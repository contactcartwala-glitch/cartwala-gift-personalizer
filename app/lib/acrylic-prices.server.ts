import { ACRYLIC_SIZES, acrylicComparePrice } from "./acrylic-prices";

export const ACRYLIC_COLLECTION_ID = "gid://shopify/Collection/507932115129";
export const ACRYLIC_TAG = "cw-acrylic-frame";
export const ACRYLIC_PORTRAIT_TAG = "cw-acrylic-portrait";
export const ACRYLIC_LANDSCAPE_TAG = "cw-acrylic-landscape";
export const isAcrylicProduct = (tags: string[]) => [ACRYLIC_TAG, ACRYLIC_PORTRAIT_TAG, ACRYLIC_LANDSCAPE_TAG].some(tag => tags.includes(tag));
export const acrylicDesignDirection = (tags: string[]) => {
  const portrait = tags.includes(ACRYLIC_PORTRAIT_TAG) || tags.includes("cw-frame-portrait");
  const landscape = tags.includes(ACRYLIC_LANDSCAPE_TAG) || tags.includes("cw-frame-landscape");
  if (portrait && landscape) throw new Error("Use only one acrylic design direction tag.");
  return portrait ? "Portrait" : landscape ? "Landscape" : null;
};

type Row = { size: string; price3: number; price5: number };
export type AcrylicMatrix = { version: 2; sizes: Row[] };
type Graphql = (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
type Variant = { id: string; price: string; compareAtPrice: string | null; selectedOptions: Array<{ name: string; value: string }> };
type Product = { id: string; title: string; tags: string[]; variants: { nodes: Variant[]; pageInfo: { hasNextPage: boolean } } };

export const DEFAULT_ACRYLIC_MATRIX: AcrylicMatrix = {
  version: 2,
  sizes: [
    { size: "8×12", price3: 750, price5: 1125 },
    { size: "12×18", price3: 1250, price5: 2125 },
    { size: "16×24", price3: 2500, price5: 3750 },
    { size: "20×30", price3: 3750, price5: 5000 },
    { size: "24×36", price3: 6250, price5: 8750 },
  ],
};

export function validateMatrix(value: unknown): AcrylicMatrix {
  if (!value || typeof value !== "object") throw new Error("Price table is missing.");
  const input = value as { version?: number; multiplier?: number; sizes?: Array<{ size: string; cost3?: number; cost5?: number; price3?: number; price5?: number }> };
  // Read the previous table once without changing existing selling prices.
  const matrix: AcrylicMatrix = input.version === 1 && input.multiplier === 2.5
    ? { version: 2, sizes: (input.sizes || []).map(row => ({ size: row.size,
        price3: Number(row.cost3) * 2.5, price5: Number(row.cost5) * 2.5 })) }
    : value as AcrylicMatrix;
  if (matrix.version !== 2 || !Array.isArray(matrix.sizes) || matrix.sizes.length !== ACRYLIC_SIZES.length)
    throw new Error("The price table must contain the five approved sizes.");
  ACRYLIC_SIZES.forEach((size, index) => {
    const row = matrix.sizes[index];
    if (row?.size !== size || [row.price3, row.price5].some(price =>
        !Number.isFinite(price) || price <= 0 || price > 10000000 ||
        Math.abs(price * 100 - Math.round(price * 100)) > 0.00001))
      throw new Error(`Check the selling prices for ${size}.`);
  });
  return matrix;
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
  if (/^3\s*mm\b/.test(acrylic)) return row.price3;
  if (/^5\s*mm\b/.test(acrylic)) return row.price5;
  return null;
}

async function prepareAcrylicDesign(admin: { graphql: Graphql }, product: Product, matrix: AcrylicMatrix): Promise<Product> {
  const direction = acrylicDesignDirection(product.tags);
  if (!product.tags.includes(ACRYLIC_TAG)) {
    const result = await graphql<{ tagsAdd: { userErrors: Array<{ message: string }> } }>(admin,
      `#graphql
      mutation AddAcrylicCollectionTag($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) { userErrors { message } }
      }`, { id: product.id, tags: [ACRYLIC_TAG] });
    if (result.tagsAdd.userErrors.length) throw new Error(result.tagsAdd.userErrors[0].message);
    product = { ...product, tags: [...product.tags, ACRYLIC_TAG] };
  }
  // Bootstrap only a new product with Shopify's default variant. Existing custom
  // options and variants are never deleted or rebuilt by the price webhook.
  const current = product.variants.nodes;
  if (!direction || product.variants.pageInfo.hasNextPage || current.length !== 1 ||
      current[0].selectedOptions.some(option => option.name !== "Title")) return product;
  const materials = ["3mm without studs", "5mm with studs"];
  const result = await graphql<{ productSet: { product: Product | null; userErrors: Array<{ message: string }> } }>(admin,
    `#graphql
    mutation PrepareAcrylicDesign($identifier: ProductSetIdentifiers!, $input: ProductSetInput!) {
      productSet(identifier: $identifier, input: $input, synchronous: true) {
        product { id title tags variants(first: 100) {
          nodes { id price compareAtPrice selectedOptions { name value } }
          pageInfo { hasNextPage }
        } }
        userErrors { message }
      }
    }`, { identifier: { id: product.id }, input: {
      productOptions: [
        { name: "Size", position: 1, values: matrix.sizes.map(row => ({ name: `${row.size} inches` })) },
        { name: "Acrylic", position: 2, values: materials.map(name => ({ name })) },
      ],
      variants: matrix.sizes.flatMap(row => materials.map((material, index) => {
        const price = index ? row.price5 : row.price3;
        return { optionValues: [{ optionName: "Size", name: `${row.size} inches` },
          { optionName: "Acrylic", name: material }], price, compareAtPrice: acrylicComparePrice(price),
          inventoryItem: { tracked: false, requiresShipping: true } };
      })),
    } });
  if (result.productSet.userErrors.length || !result.productSet.product)
    throw new Error(result.productSet.userErrors[0]?.message || "Could not create acrylic design variants.");
  return result.productSet.product;
}

export async function syncAcrylicProduct(admin: { graphql: Graphql }, product: Product, matrix: AcrylicMatrix) {
  if (!isAcrylicProduct(product.tags)) return "ignored";
  product = await prepareAcrylicDesign(admin, product, matrix);
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
    Number(variant.price) === desired[index] && Number(variant.compareAtPrice) === acrylicComparePrice(desired[index]!)
      ? [] : [{ id: variant.id, price: desired[index], compareAtPrice: acrylicComparePrice(desired[index]!) }]);
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
          nodes { id price compareAtPrice selectedOptions { name value } }
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
            nodes { id price compareAtPrice selectedOptions { name value } }
            pageInfo { hasNextPage }
          } }
          pageInfo { hasNextPage endCursor }
        }
      }`, { after: cursor, query: `(tag:${ACRYLIC_TAG} OR tag:${ACRYLIC_PORTRAIT_TAG} OR tag:${ACRYLIC_LANDSCAPE_TAG})` });
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

export async function loadAcrylicRoom(admin: { graphql: Graphql }): Promise<string | null> {
  const data = await graphql<{ collection: { room: { reference: { image?: { url: string } } | null } | null } | null }>(admin,
    `#graphql
    query AcrylicRoom($id: ID!) {
      collection(id: $id) { room: metafield(namespace: "$app", key: "acrylic_room") {
        reference { ... on MediaImage { id image { url } } }
      } }
    }`, { id: ACRYLIC_COLLECTION_ID });
  return data.collection?.room?.reference?.image?.url || null;
}

export async function saveAcrylicRoom(admin: { graphql: Graphql }, fileId: string) {
  const data = await graphql<{ metafieldsSet: { userErrors: Array<{ message: string }> } }>(admin,
    `#graphql
    mutation SaveAcrylicRoom($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { message } }
    }`, { metafields: [{ ownerId: ACRYLIC_COLLECTION_ID, namespace: "$app",
      key: "acrylic_room", type: "file_reference", value: fileId }] });
  if (data.metafieldsSet.userErrors.length) throw new Error(data.metafieldsSet.userErrors[0].message);
}
