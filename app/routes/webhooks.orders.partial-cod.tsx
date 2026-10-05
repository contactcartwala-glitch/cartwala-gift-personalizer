import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { recordPaidDeposit } from "../lib/partial-cod-payment.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop, topic, payload } = await authenticate.webhook(request);
  if (topic !== "ORDERS_PAID") return new Response(null, { status: 400 });
  if (!admin) return new Response(null, { status: 503 });
  const data = payload as { admin_graphql_api_id?: string; note_attributes?: { name: string; value: string }[] };
  const attrs = data.note_attributes ?? [];
  if (!attrs.some(a => a.name === "_cartwala_order_kind" && a.value === "partial_cod_deposit")) return new Response();
  const id = attrs.find(a => a.name === "_cartwala_cod_intent")?.value;
  if (!id || !/^[a-f\d-]{36}$/i.test(id) || !data.admin_graphql_api_id) return new Response(null, { status: 400 });
  if (process.env.PARTIAL_COD_ENABLED !== "true") return new Response(null, { status: 503 });
  try {
    await recordPaidDeposit(admin, shop, id, data.admin_graphql_api_id);
    return new Response();
  } catch {
    console.error("Partial COD payment verification requires review");
    return new Response(null, { status: 503 });
  }
};
