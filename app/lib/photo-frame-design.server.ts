import { normalizeConfig, PHOTO_FRAME_MASTER_ID, type Config } from "./personalizer-config";

type Admin = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
type Variant = { id: string; price: string; compareAtPrice: string | null; selectedOptions: Array<{ name: string; value: string }> };
type FrameProduct = { id: string; tags: string[]; config: { jsonValue: unknown } | null; variants: { nodes: Variant[]; pageInfo: { hasNextPage: boolean } } };
export const FRAME_PRODUCT_QUERY = `query PhotoFrameDesignProduct($id:ID!){product(id:$id){id tags config:metafield(namespace:"cartwala_personalizer",key:"personalizer_config"){jsonValue} variants(first:100){nodes{id price compareAtPrice selectedOptions{name value}} pageInfo{hasNextPage endCursor}}}}`;
export const FRAME_BOOTSTRAP = `mutation BootstrapPhotoFrameDesign($identifier:ProductSetIdentifiers!,$input:ProductSetInput!){productSet(identifier:$identifier,input:$input,synchronous:true){userErrors{message}}}`;
export const FRAME_CREATE_VARIANTS = `mutation AddPhotoFrameDesignSizes($id:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkCreate(productId:$id,variants:$variants){userErrors{message}}}`;
export const FRAME_UPDATE_VARIANTS = `mutation UpdatePhotoFrameDesignPrices($id:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$id,variants:$variants,allowPartialUpdates:false){userErrors{message}}}`;
export const FRAME_TAGS = `mutation TagPhotoFrameDesign($input:ProductUpdateInput!){productUpdate(product:$input){userErrors{message}}}`;
export const FRAME_LINKS_QUERY = `query LinkedPhotoFrameDesigns($after:String){products(first:50,after:$after,query:"tag:cw-photo-frame-linked"){nodes{id} pageInfo{hasNextPage endCursor}}}`;
async function run<T>(admin: Admin, query: string, variables: Record<string, unknown>): Promise<T> {
  const result = await (await admin.graphql(query, { variables })).json();
  if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message || "Shopify did not return data.");
  for (const value of Object.values(result.data) as Array<{ userErrors?: Array<{ message: string }> }>)
    if (value?.userErrors?.length) throw new Error(value.userErrors[0].message);
  return result.data;
}
const loadProduct = async (admin: Admin, id: string) => (await run<{ product: FrameProduct | null }>(admin, FRAME_PRODUCT_QUERY, { id })).product;
const option = (variant: Variant, name: string) => variant.selectedOptions.find(o => o.name === name)?.value || "";
const isDefault = (p: FrameProduct) => p.variants.nodes.length === 1 && p.variants.nodes[0].selectedOptions.every(o => o.name === "Title");
export function frameMasterRows(master: FrameProduct, config: Config) {
  const direction = config.photoFrameDesign?.orientation;
  const [w, h] = config.canvasRatio.split(":").map(Number);
  const expected = direction === "Landscape" ? 1.5 : 2 / 3;
  if (!(w > 0 && h > 0) || Math.abs(w / h / expected - 1) >= 0.005)
    throw new Error(`This design must use a ${direction === "Landscape" ? "3:2 landscape" : "2:3 portrait"} PSD. Upload matching artwork before saving.`);
  if (master.variants.pageInfo.hasNextPage) throw new Error("The master has too many variants to sync safely.");
  const rows = master.variants.nodes.filter(v => option(v, "Orientation") === direction).map(v => ({ size: option(v, "Size"), price: v.price, compareAtPrice: v.compareAtPrice }));
  if (!rows.length || rows.some(r => !r.size)) throw new Error("The selected orientation has no master frame sizes.");
  return rows;
}
function validateProduct(product: FrameProduct, config: Config, rows: ReturnType<typeof frameMasterRows>) {
  if (product.id === PHOTO_FRAME_MASTER_ID) throw new Error("Keep the master plain. Choose a separate black frame design product.");
  if (config.acrylicDesign) throw new Error("Choose one master product for this design.");
  if (product.variants.pageInfo.hasNextPage || (!isDefault(product) && product.variants.nodes.some(v => v.selectedOptions.length !== 1 || !v.selectedOptions.some(o => o.name === "Size" && rows.some(r => r.size === o.value)))))
    throw new Error("Existing variants do not match the black frame master. Choose a new design product with its default variant, or a linked design with the same Size options.");
}
export async function validatePhotoFrameDesign(admin: Admin, id: string, config: Config) {
  if (!config.photoFrameDesign) return;
  const [master, product] = await Promise.all([loadProduct(admin, PHOTO_FRAME_MASTER_ID), loadProduct(admin, id)]);
  if (!master || !product) throw new Error("The master or selected design product no longer exists.");
  validateProduct(product, config, frameMasterRows(master, config));
}
export async function syncPhotoFrameDesign(admin: Admin, id: string): Promise<boolean> {
  const product = await loadProduct(admin, id);
  const config = normalizeConfig(product?.config?.jsonValue);
  if (!product || !config.photoFrameDesign) return false;
  const master = await loadProduct(admin, PHOTO_FRAME_MASTER_ID);
  if (!master) throw new Error("Black Frame Master was not found.");
  const rows = frameMasterRows(master, config); validateProduct(product, config, rows);
  const make = (row: typeof rows[number]) => ({ optionValues: [{ optionName: "Size", name: row.size }], price: row.price, compareAtPrice: row.compareAtPrice, inventoryItem: { tracked: false, requiresShipping: true } });
  if (isDefault(product)) {
    await run(admin, FRAME_BOOTSTRAP, { identifier: { id }, input: { productOptions: [{ name: "Size", position: 1, values: rows.map(r => ({ name: r.size })) }], variants: rows.map(make) } });
  } else {
    const matched = product.variants.nodes.map(v => ({ variant: v, row: rows.find(r => r.size === option(v, "Size"))! }));
    const missing = rows.filter(r => !matched.some(m => m.row === r));
    if (missing.length) await run(admin, FRAME_CREATE_VARIANTS, { id, variants: missing.map(make) });
    const changed = matched.filter(m => Number(m.variant.price) !== Number(m.row.price) || m.variant.compareAtPrice !== m.row.compareAtPrice);
    if (changed.length) await run(admin, FRAME_UPDATE_VARIANTS, { id, variants: changed.map(m => ({ id: m.variant.id, price: m.row.price, compareAtPrice: m.row.compareAtPrice })) });
  }
  const tags = [...new Set([...product.tags.filter(t => !["cw-photo-frame-portrait", "cw-photo-frame-landscape"].includes(t)), "cw-photo-frame-linked", `cw-photo-frame-${config.photoFrameDesign.orientation.toLowerCase()}`])];
  if (tags.length !== product.tags.length || tags.some(t => !product.tags.includes(t))) await run(admin, FRAME_TAGS, { input: { id, tags } });
  return true;
}
export async function syncLinkedPhotoFrameDesigns(admin: Admin) {
  let after: string | null = null;
  do {
    const data: { products: { nodes: Array<{ id: string }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await run(admin, FRAME_LINKS_QUERY, { after });
    for (const product of data.products.nodes) await syncPhotoFrameDesign(admin, product.id);
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
}
