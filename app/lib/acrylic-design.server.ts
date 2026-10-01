import { normalizeConfig, type Config } from "./personalizer-config";
import { ACRYLIC_MASTER_ID, compatibleAcrylicSizes } from "./acrylic-design";
import { loadAcrylicMatrix, type AcrylicMatrix } from "./acrylic-prices.server";
type Admin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};
async function run<T>(
  admin: Admin,
  q: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const result = await (await admin.graphql(q, { variables })).json();
  if (result.errors?.length || !result.data)
    throw new Error(
      result.errors?.[0]?.message || "Shopify did not return data.",
    );
  for (const value of Object.values(result.data) as Array<{
    userErrors?: Array<{ message: string }>;
  }>)
    if (value?.userErrors?.length) throw new Error(value.userErrors[0].message);
  return result.data;
}
export async function validateAcrylicDesign(
  admin: Admin,
  id: string,
  config: Config,
) {
  if (!config.acrylicDesign) return;
  if (id === ACRYLIC_MASTER_ID)
    throw new Error("Keep the master plain. Choose a separate design product.");
  const matrix = await loadAcrylicMatrix(admin);
  if (
    !compatibleAcrylicSizes(
      config.canvasRatio,
      config.acrylicDesign.orientation,
      matrix.sizes,
    ).length
  )
    throw new Error(
      "No master size matches this PSD ratio. Add a matching size to Acrylic Master first.",
    );
  const expected = compatibleAcrylicSizes(
    config.canvasRatio,
    config.acrylicDesign.orientation,
    matrix.sizes,
  );
  const state = await run<{
    product: {
      variants: {
        nodes: Array<{
          selectedOptions: Array<{ name: string; value: string }>;
        }>;
        pageInfo: { hasNextPage: boolean };
      };
    } | null;
  }>(
    admin,
    `query LinkedAcrylicDesignVariants($id:ID!){product(id:$id){variants(first:100){nodes{selectedOptions{name value}} pageInfo{hasNextPage}}}}`,
    { id },
  );
  const variants = state.product?.variants;
  if (!variants) throw new Error("The selected product no longer exists.");
  const isNew =
    variants.nodes.length === 1 &&
    variants.nodes[0].selectedOptions.every((o) => o.name === "Title");
  if (
    !isNew &&
    (variants.pageInfo.hasNextPage ||
      variants.nodes.some(
        (v) =>
          v.selectedOptions.length !== 2 ||
          !v.selectedOptions.some(
            (o) =>
              o.name === "Size" &&
              expected.some((r) => `${r.size} inches` === o.value),
          ) ||
          !v.selectedOptions.some(
            (o) =>
              o.name === "Acrylic" &&
              ["3mm without studs", "5mm with studs"].includes(o.value),
          ),
      ))
  )
    throw new Error(
      "Existing variants do not match this design. Use a new product with its default variant.",
    );
}
export async function syncAcrylicDesign(
  admin: Admin,
  id: string,
  matrix?: AcrylicMatrix,
): Promise<boolean> {
  const d = await run<{
    product: {
      id: string;
      tags: string[];
      config: { jsonValue: unknown } | null;
      variants: {
        nodes: Array<{
          id: string;
          price: string;
          selectedOptions: Array<{ name: string; value: string }>;
        }>;
        pageInfo: { hasNextPage: boolean };
      };
    } | null;
  }>(
    admin,
    `query LinkedAcrylicDesign($id:ID!){product(id:$id){id tags config:metafield(namespace:"cartwala_personalizer",key:"personalizer_config"){jsonValue} variants(first:100){nodes{id price selectedOptions{name value}} pageInfo{hasNextPage}}}}`,
    { id },
  );
  const p = d.product,
    config = normalizeConfig(p?.config?.jsonValue);
  if (!p || !config.acrylicDesign) return false;
  await validateAcrylicDesign(admin, id, config);
  const rows = compatibleAcrylicSizes(
    config.canvasRatio,
    config.acrylicDesign.orientation,
    (matrix || (await loadAcrylicMatrix(admin))).sizes,
  );
  const materials = ["3mm without studs", "5mm with studs"];
  const desired = rows.flatMap((r) =>
    materials.map((m, i) => ({
      size: `${r.size} inches`,
      material: m,
      price: String(i ? r.price5 : r.price3),
    })),
  );
  const variants = p.variants.nodes;
  const make = (v: (typeof desired)[number]) => ({
    optionValues: [
      { optionName: "Size", name: v.size },
      { optionName: "Acrylic", name: v.material },
    ],
    price: v.price,
    inventoryItem: { tracked: false, requiresShipping: true },
  });
  if (
    variants.length === 1 &&
    variants[0].selectedOptions.every((o) => o.name === "Title")
  ) {
    await run(
      admin,
      `mutation BootstrapLinkedAcrylic($identifier:ProductSetIdentifiers!,$input:ProductSetInput!){productSet(identifier:$identifier,input:$input,synchronous:true){userErrors{message}}}`,
      {
        identifier: { id },
        input: {
          productOptions: [
            {
              name: "Size",
              position: 1,
              values: rows.map((r) => ({ name: `${r.size} inches` })),
            },
            {
              name: "Acrylic",
              position: 2,
              values: materials.map((name) => ({ name })),
            },
          ],
          variants: desired.map(make),
        },
      },
    );
  } else {
    if (p.variants.pageInfo.hasNextPage)
      throw new Error("This design has too many variants to sync safely.");
    const matched = variants.map((v) => ({
      v,
      row: desired.find(
        (r) =>
          v.selectedOptions.length === 2 &&
          v.selectedOptions.some(
            (o) => o.name === "Size" && o.value === r.size,
          ) &&
          v.selectedOptions.some(
            (o) => o.name === "Acrylic" && o.value === r.material,
          ),
      ),
    }));
    if (matched.some((v) => !v.row))
      throw new Error(
        "Existing variants do not match this design. Use a new product with its default variant.",
      );
    const missing = desired.filter((r) => !matched.some((m) => m.row === r));
    if (missing.length)
      await run(
        admin,
        `mutation AddLinkedAcrylicSizes($id:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkCreate(productId:$id,variants:$variants){userErrors{message}}}`,
        { id, variants: missing.map(make) },
      );
    const updates = matched
      .filter((m) => Number(m.v.price) !== Number(m.row!.price))
      .map((m) => ({ id: m.v.id, price: m.row!.price }));
    if (updates.length)
      await run(
        admin,
        `mutation UpdateLinkedAcrylicPrices($id:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$id,variants:$variants,allowPartialUpdates:false){userErrors{message}}}`,
        { id, variants: updates },
      );
  }
  const tags = [
    ...p.tags.filter(
      (t) => !["cw-acrylic-portrait", "cw-acrylic-landscape"].includes(t),
    ),
    "cw-acrylic-linked",
    "cw-acrylic-frame",
    config.acrylicDesign.orientation === "Portrait"
      ? "cw-acrylic-portrait"
      : "cw-acrylic-landscape",
  ];
  if (
    tags.some((t) => !p.tags.includes(t)) ||
    p.tags.some((t) => !tags.includes(t))
  )
    await run(
      admin,
      `mutation TagLinkedAcrylic($input:ProductUpdateInput!){productUpdate(product:$input){userErrors{message}}}`,
      { input: { id, tags: [...new Set(tags)] } },
    );
  return true;
}
export async function syncLinkedAcrylicDesigns(
  admin: Admin,
  matrix: AcrylicMatrix,
) {
  let after: string | null = null;
  do {
    const d: {
      products: {
        nodes: Array<{ id: string }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await run(
      admin,
      `query LinkedAcrylicProducts($after:String){products(first:50,after:$after,query:"tag:cw-acrylic-linked"){nodes{id} pageInfo{hasNextPage endCursor}}}`,
      { after },
    );
    for (const p of d.products.nodes)
      await syncAcrylicDesign(admin, p.id, matrix);
    after = d.products.pageInfo.hasNextPage
      ? d.products.pageInfo.endCursor
      : null;
  } while (after);
}
