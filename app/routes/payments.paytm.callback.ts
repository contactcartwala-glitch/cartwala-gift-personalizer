import type { ActionFunctionArgs } from "react-router";
import { configuredPaytm, paytmDatabase, progressConfiguredCodCheckout } from "../lib/partial-cod-paytm-runtime.server";
import { verifyPaytmCallback } from "../lib/partial-cod-paytm.server";
import { findPaytmCallbackIntent } from "../lib/partial-cod-paytm-store.server";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
async function boundedBody(request: Request) {
  if (!request.body) throw new Error();
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 32_768) { await reader.cancel(); throw new Error(); }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return loader();
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded")
    return new Response("Unsupported payment callback", { status: 415, headers });
  let connection: ReturnType<typeof configuredPaytm>;
  try { connection = configuredPaytm(); }
  catch { return new Response("Payment verification is unavailable", { status: 503, headers }); }
  let orderId: string;
  try { orderId = verifyPaytmCallback(await boundedBody(request), connection.config).orderId; }
  catch { return new Response("Invalid payment callback", { status: 400, headers }); }
  try {
    const intent = await findPaytmCallbackIntent(paytmDatabase, orderId, connection.shop, connection.config);
    const progress = await progressConfiguredCodCheckout(connection.shop, intent.id);
    if (progress.state === "order_confirmed") return new Response("Your order is confirmed. Thank you for shopping with Cartwala Gift Shop.", { headers });
    if (progress.state === "paid_order_pending")
      return new Response("Payment recorded. Your order confirmation is being checked. Do not pay again.", { status: 202, headers });
    return new Response(progress.state === "payment_pending"
      ? "Payment confirmation is pending. Do not pay again."
      : "Payment was not confirmed. Contact Cartwala before attempting another payment.", { headers });
  } catch {
    // No secrets, provider errors or customer details are logged or echoed to the browser.
    return new Response("Payment could not be confirmed. Do not pay again; contact Cartwala.", { status: 503, headers });
  }
};

export const loader = () => new Response("Method not allowed", { status: 405, headers: { ...headers, Allow: "POST" } });
