import type { authenticate } from "../shopify.server";
import { ACRYLIC_ACTIVE_PRODUCT_ID } from "./acrylic-prices.server";
import { choiceDimensions, legacyAcrylicMockups, validateAcrylicMockup, type AcrylicMockups } from "./acrylic-mockups";
import { inspectMockupPng } from "./png-mockup.server";
import { uploadImageAsset } from "./shopify-files.server";
type Admin = Awaited<ReturnType<typeof authenticate.admin>>["admin"];
type ApiResult<T> = { data?: T; errors?: Array<{ message: string }> };
export const ACRYLIC_MOCKUPS_QUERY = `#graphql
query AcrylicMockups($id: ID!) {
  product(id: $id) {
    mockups: metafield(namespace: "$app", key: "acrylic_mockups") { jsonValue compareDigest }
    legacy: metafield(namespace: "$app", key: "group_config") { jsonValue }
  }
}`;
export const SAVE_ACRYLIC_MOCKUPS = `#graphql
mutation SaveAcrylicMockups($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { userErrors { message } }
}`;

export async function loadAcrylicMockups(admin: Admin) {
  const result = await (await admin.graphql(ACRYLIC_MOCKUPS_QUERY, { variables: { id: ACRYLIC_ACTIVE_PRODUCT_ID } })).json() as ApiResult<{
    product: { mockups: { jsonValue: unknown; compareDigest: string } | null; legacy: { jsonValue: unknown } | null } | null;
  }>;
  if (result.errors?.length || !result.data?.product) throw new Error(result.errors?.[0]?.message || "Could not load acrylic mockups.");
  const product = result.data.product;
  const templates = legacyAcrylicMockups(product.legacy?.jsonValue);
  const stored = product.mockups?.jsonValue as { version?: number; templates?: AcrylicMockups } | undefined;
  if (stored && (stored.version !== 1 || !stored.templates)) throw new Error("Unsupported acrylic mockup settings.");
  for (const [choice, template] of Object.entries(stored?.templates || {})) {
    choiceDimensions(choice);
    templates[choice] = validateAcrylicMockup(template, choice);
  }
  return { templates, digest: product.mockups?.compareDigest as string | undefined || null };
}

export async function uploadAcrylicMockup(admin: Admin, file: File, choice: string) {
  const dimensions = choiceDimensions(choice);
  if (!/\.png$/i.test(file.name) || !file.size || file.size > 20 * 1024 * 1024)
    throw new Error("Choose a transparent PNG smaller than 20 MB.");
  const geometry = inspectMockupPng(await file.arrayBuffer(), dimensions.width / dimensions.height);
  const asset = await uploadImageAsset(admin, file);
  return { ...geometry, mockup: asset.url, mockupName: file.name, fileId: asset.id };
}

export async function saveAcrylicMockup(admin: Admin, choice: string, value: unknown, digest: string | null) {
  choiceDimensions(choice);
  const template = validateAcrylicMockup(value, choice);
  const current = await loadAcrylicMockups(admin);
  if (current.digest !== digest) throw new Error("Mockups changed in another tab. Refresh this page before saving.");
  const templates = { ...current.templates, [choice]: template };
  const result = await (await admin.graphql(SAVE_ACRYLIC_MOCKUPS, { variables: { metafields: [{
    ownerId: ACRYLIC_ACTIVE_PRODUCT_ID, namespace: "$app", key: "acrylic_mockups", type: "json",
    value: JSON.stringify({ version: 1, templates }), compareDigest: digest,
  }] } })).json() as ApiResult<{ metafieldsSet: { userErrors: Array<{ message: string }> } }>;
  if (result.errors?.length || !result.data?.metafieldsSet || result.data.metafieldsSet.userErrors?.length)
    throw new Error(result.errors?.[0]?.message || result.data?.metafieldsSet?.userErrors?.[0]?.message || "Could not save this mockup.");
  return template;
}
