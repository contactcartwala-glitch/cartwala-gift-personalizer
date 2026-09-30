import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { loadGroupProduct, loadGroupSettings, syncGroupProduct } from "../lib/product-groups.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload } = await authenticate.webhook(request);
  if (!admin) return new Response();
  const id = (payload as { admin_graphql_api_id?: string }).admin_graphql_api_id ||
    ((payload as { id?: number }).id ? `gid://shopify/Product/${(payload as { id: number }).id}` : null);
  if (!id) return new Response();
  try {
    const product = await loadGroupProduct(admin, id);
    const settings = await loadGroupSettings(admin, product ? [product] : []);
    if (product) {
      const result = await syncGroupProduct(admin, settings.state.published, product);
      if (["error", "conflict"].includes(result.status)) console.warn(`Group sync needs attention for ${id}: ${result.message}`);
    }
  } catch (error) {
    console.error(`Product group sync failed for ${id}`, error);
    return new Response("Group sync failed; Shopify may retry this webhook.", { status: 500 });
  }
  return new Response();
};
