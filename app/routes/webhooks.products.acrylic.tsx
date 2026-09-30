import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { isAcrylicProduct, loadAcrylicMatrix, loadAcrylicProduct, syncAcrylicProduct } from "../lib/acrylic-prices.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, topic } = await authenticate.webhook(request);
  if (!admin) return new Response();
  const id = (payload as { admin_graphql_api_id?: string; id?: number }).admin_graphql_api_id ||
    ((payload as { id?: number }).id ? `gid://shopify/Product/${(payload as { id: number }).id}` : null);
  if (!id) return new Response();
  try {
    const product = await loadAcrylicProduct(admin, id);
    if (product && isAcrylicProduct(product.tags)) {
      const result = await syncAcrylicProduct(admin, product, await loadAcrylicMatrix(admin));
      console.log(`Acrylic price sync ${topic}: ${result}`);
    }
  } catch (error) {
    console.error(`Acrylic price sync failed for ${id}`, error);
    return new Response("Price sync failed; Shopify may retry this webhook.", { status: 500 });
  }
  return new Response();
};
