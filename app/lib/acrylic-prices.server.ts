import { ACRYLIC_MULTIPLIER, ACRYLIC_SIZES } from "./acrylic-prices";

export const ACRYLIC_COLLECTION_ID = "gid://shopify/Collection/507932115129";
export const ACRYLIC_TAG = "cw-acrylic-frame";

type Row = { size: string; cost3: number; cost5: number };
export type AcrylicMatrix = { version: 1; multiplier: 2.5; sizes: Row[] };
type Graphql = (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
type Variant = { id: string; price: string; selectedOptions: Array<{ name: string; value: string }> };
type Product = { id: string; title: string; tags: string[]; variants: { nodes: Variant[]; pageInfo: { hasNextPage: boolean } } };

export const DEFAULT_ACRYLIC_MATRIX: AcrylicMatrix = {
  version: 1, multiplier: ACRYLIC_MULTIPLIER,
  sizes: [
    { size: "8×12", cost3: 300, cost5: 450 },
    { size: "12×18", cost3: 500, cost5: 850 },
    { size: "16×24", cost3: 1000, cost5: 1500 },
    { size: "20×30", cost3: 1500, cost5: 2000 },
    { size: "24×36", cost3: 2500, cost5: 3500 },
  ],
};

export function validateMatrix(value: unknown): AcrylicMatrix {
  if (!value || typeof value !== "object") throw new Error("Price table is missing.");
  const matrix = value as Partial<AcrylicMatrix>;
  if (matrix.version !== 1 || matrix.multiplier !== ACRYLIC_MULTIPLIER ||
      !Array.isArray(matrix.sizes) || matrix.sizes.length !== ACRYLIC_SIZES.length)
    throw new Error("The price table must have the five approved sizes and a 2.5 multiplier.");
  ACRYLIC_SIZES.forEach((size, index) => {
    const row = matrix.sizes?.[index];
    if (row?.size !== size || !Number.isSafeInteger(row.cost3) || !Number.isSafeInteger(row.cost5) ||
        row.cost3 <= 0 || row.cost5 <= 0 || row.cost3 > 1000000 || row.cost5 > 1000000)
      throw new Error(`Check the base costs for ${size}.`);
  });
  return matrix as AcrylicMatrix;
}

async function graphql<T>(admin: { graphql: Graphql }, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const result = await response.json() as { data?: T; errors?: Array<{ message: string }> };
  if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message || "Shopify did not return data.");
  return result.data;
}

export async function loadAcrylicMatrix(admin: { graphql: Graphql }): Promise<AcrylicMatrix> {
  const data = await graphql<{ collection: { metafield: { jsonValue: unknown } | null } | null }>(admin,
    `#graphql
    query AcrylicPriceMatrix($id: ID!) {
      collection(id: $id) { metafield(namespace: "cartwala_acrylic", key: "price_matrix") { jsonValue } }
    }`, { id: ACRYLIC_COLLECTION_ID });
  if (!data.collection?.metafield) throw new Error("Acrylic collection price table is missing.");
  return validateMatrix(data.collection.metafield.jsonValue);
}

export async function saveAcrylicMatrix(admin: { graphql: Graphql }, matrix: AcrylicMatrix) {
  const data = await graphql<{ metafieldsSet: { userErrors: Array<{ message: string }> } }>(admin,
    `#graphql
    mutation SaveAcrylicPriceMatrix($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { message } }
    }`, { metafields: [{ ownerId: ACRYLIC_COLLECTION_ID, namespace: "cartwala_acrylic",
      key: "price_matrix", type: "json", value: JSON.stringify(validateMatrix(matrix)) }] });
  if (data.metafieldsSet.userErrors.length) throw new Error(data.metafieldsSet.userErrors[0].message);
}

function variantPrice(variant: Variant, matrix: AcrylicMatrix): number | null {
  const options = new Map(variant.selectedOptions.map(({ name, value }) => [name.toLowerCase(), value.toLowerCase()]));
  const size = options.get("size")?.replace(/\s*(inches|inch|in|")\s*$/i, "").replace(/\s*[x×]\s*/g, "×");
  const acrylic = options.get("acrylic") || "";
  const row = matrix.sizes.find((item) => item.size === size);
  if (!row) return null;
  if (/^3\s*mm\b/.test(acrylic)) return row.cost3 * matrix.multiplier;
  if (/^5\s*mm\b/.test(acrylic)) return row.cost5 * matrix.multiplier;
  return null;
}

export async function syncAcrylicProduct(admin: { graphql: Graphql }, product: Product, matrix: AcrylicMatrix) {
  if (!product.tags.includes(ACRYLIC_TAG)) return "ignored";
  const variants = product.variants.nodes;
  const desired = variants.map((variant) => variantPrice(variant, matrix));
  const groups = new Map<string, Set<string>>();
  for (const variant of variants) {
    const options = new Map(variant.selectedOptions.map(({ name, value }) => [name.toLowerCase(), value.toLowerCase()]));
    const size = options.get("size")?.replace(/\s*(inches|inch|in|")\s*$/i, "").replace(/\s*[x×]\s*/g, "×");
    const material = options.get("acrylic")?.match(/^(3|5)\s*mm\b/)?.[1];
    const orientation = options.get("orientation") || "fixed";
    if (!size || !material || !["fixed", "portrait", "landscape"].includes(orientation) ||
        variant.selectedOptions.some(({ name }) => !["size", "acrylic", "orientation"].includes(name.toLowerCase()))) return "incomplete";
    const key = `${size}|${material}`;
    const directions = groups.get(key) || new Set<string>();
    if (directions.has(orientation)) return "incomplete";
    directions.add(orientation);
    groups.set(key, directions);
  }
  const expectedDirections = variants.length === 20 ? ["portrait", "landscape"] :
    [...(groups.values().next().value || [])];
  if (product.variants.pageInfo.hasNextPage || ![10, 20].includes(variants.length) ||
      desired.some((price) => price === null) || groups.size !== 10 ||
      expectedDirections.length !== (variants.length === 20 ? 2 : 1) ||
      [...groups.values()].some((directions) => directions.size !== expectedDirections.length ||
        expectedDirections.some((direction) => !directions.has(direction)))) return "incomplete";
  const updates = variants.flatMap((variant, index) =>
    Number(variant.price) === desired[index] ? [] : [{ id: variant.id, price: desired[index] }]);
  if (!updates.length) return "unchanged";
  const data = await graphql<{ productVariantsBulkUpdate: { userErrors: Array<{ message: string }> } }>(admin,
    `#graphql
    mutation SyncAcrylicPrices($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } }
    }`, { productId: product.id, variants: updates });
  if (data.productVariantsBulkUpdate.userErrors.length)
    throw new Error(`${product.title}: ${data.productVariantsBulkUpdate.userErrors[0].message}`);
  return "updated";
}

export async function loadAcrylicProduct(admin: { graphql: Graphql }, id: string): Promise<Product | null> {
  const data = await graphql<{ product: Product | null }>(admin,
    `#graphql
    query AcrylicProduct($id: ID!) {
      product(id: $id) {
        id title tags variants(first: 100) {
          nodes { id price selectedOptions { name value } }
          pageInfo { hasNextPage }
        }
      }
    }`, { id });
  return data.product;
}

export async function syncAcrylicCollection(admin: { graphql: Graphql }, matrix: AcrylicMatrix) {
  const report = { updated: 0, unchanged: 0, incomplete: [] as string[], errors: [] as string[] };
  let cursor: string | null = null;
  do {
    const data: { products: { nodes: Product[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await graphql(admin,
      `#graphql
      query AcrylicProducts($after: String, $query: String!) {
        products(first: 100, after: $after, query: $query) {
          nodes { id title tags variants(first: 100) {
            nodes { id price selectedOptions { name value } }
            pageInfo { hasNextPage }
          } }
          pageInfo { hasNextPage endCursor }
        }
      }`, { after: cursor, query: `tag:${ACRYLIC_TAG}` });
    for (const product of data.products.nodes) {
      try {
        const result = await syncAcrylicProduct(admin, product, matrix);
        if (result === "updated") report.updated++;
        if (result === "unchanged") report.unchanged++;
        if (result === "incomplete") report.incomplete.push(product.title);
      } catch (error) { report.errors.push(`${product.title}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
    if (data.products.pageInfo.hasNextPage && !cursor) throw new Error("Could not continue product pagination.");
  } while (cursor);
  return report;
}
