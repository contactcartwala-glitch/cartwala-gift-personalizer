import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { loadCodSettings } from "../lib/partial-cod-settings.server";
import { canEnableAdvanceCod } from "../lib/partial-cod-settings";
import { calculateCodQuote } from "../lib/partial-cod-quote.server";
import { issueCodAccess, readCodAccess } from "../lib/partial-cod-access.server";
import { codCheckoutAvailable, startConfiguredCodCheckout, progressConfiguredCodCheckout } from "../lib/partial-cod-paytm-runtime.server";

const headers = { "Cache-Control": "no-store" };
async function readBody(request: Request) {
  if (!request.body) throw new Error();
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 128 * 1024) { await reader.cancel(); throw new Error(); }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.public.appProxy(request);
  if (!admin || !session) return Response.json({ error: "App is not installed" }, { status: 503, headers });
  const settings = await loadCodSettings(session.shop);
  return Response.json({ enabled: settings.enabled && canEnableAdvanceCod(),
    advancePercent: settings.advancePercent, codFeePaise: settings.codFeePaise, checkoutAvailable: codCheckoutAvailable(session.shop, settings) }, { headers });
};

// Every provider operation requires a signed quote capability as well as app-proxy authentication.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.public.appProxy(request);
  if (!admin || !session) return Response.json({ error: "App is not installed" }, { status: 503, headers });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { ...headers, Allow: "POST" } });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return Response.json({ error: "Use a JSON request" }, { status: 415, headers });
  let raw: string;
  try { raw = await readBody(request); }
  catch { return Response.json({ error: "Cart request is too large or unreadable" }, { status: 413, headers }); }
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error("Advance checkout is not yet available");
    if (input.intent === "begin_payment" || input.intent === "payment_status") {
      const id = readCodAccess(input.access, session.shop, process.env.SHOPIFY_API_SECRET || "");
      if (input.intent === "payment_status") {
        const result = await progressConfiguredCodCheckout(session.shop, id);
        return Response.json(result, { headers });
      }
      const settings = await loadCodSettings(session.shop);
      const checkout = await startConfiguredCodCheckout(session.shop, id, settings);
      return Response.json({ checkout }, { headers });
    }
    if (input.intent !== "review_quote" && input.intent !== "create_quote") throw new Error("Invalid checkout action");
    if (typeof input.requestKey !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input.requestKey))
      throw new Error("Invalid quote request key");
    // Customer-specific discount eligibility has not been integrated.
    if (Array.isArray(input.discountCodes) && input.discountCodes.length)
      throw new Error("Discount codes are not supported in this review yet. Use prepaid checkout.");
  } catch {
    return Response.json({ error: "This checkout could not be confirmed. If payment was started, check its status; do not pay again." }, { status: 400, headers });
  }
  const requestKey = input.requestKey as string;
  const existing = await prisma.partialCodIntent.findUnique({
    where: { shop_requestKey: { shop: session.shop, requestKey } },
  });
  // A key is single-use. Never disclose a prior quote or overwrite its frozen balance.
  if (existing) return Response.json({ error: "Use a new request key for this cart" }, { status: 409, headers });
  const recent = await prisma.partialCodIntent.count({
    where: { shop: session.shop, createdAt: { gte: new Date(Date.now() - 60000) } },
  });
  if (recent >= 60) return Response.json({ error: "Try again shortly" }, { status: 429, headers });
  try {
    const settings = await loadCodSettings(session.shop);
    const available = codCheckoutAvailable(session.shop, settings);
    if (input.intent === "create_quote" && !available)
      return Response.json({ error: "Advance checkout is unavailable. Use prepaid checkout." }, { status: 503, headers });
    const quote = await calculateCodQuote(admin, input, settings.advancePercent, settings.codFeePaise);
    const row = await prisma.partialCodIntent.create({ data: {
      shop: session.shop, requestKey, state: "quoted", advancePercent: settings.advancePercent, codFeePaise: settings.codFeePaise,
      orderPaise: quote.amounts.orderPaise, payableNowPaise: quote.amounts.payableNowPaise,
      collectPaise: quote.amounts.collectOnDeliveryPaise,
      lines: quote.lines, shippingAddress: quote.shippingAddress, accountingSnapshot: quote.accountingSnapshot,
    } });
    return Response.json({ quoteId: row.id, advancePercent: row.advancePercent,
      amounts: quote.amounts, checkoutAvailable: available && input.intent === "create_quote",
      ...(available && input.intent === "create_quote"
        ? { access: issueCodAccess(session.shop, row.id, process.env.SHOPIFY_API_SECRET || "") } : {}),
      message: "No payment or order has been created." }, { headers });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002")
      return Response.json({ error: "Use a new request key for this cart" }, { status: 409, headers });
    // Do not expose upstream API, database or address details in public errors.
    return Response.json({ error: "Could not calculate this cart. Check your delivery details or use prepaid checkout." },
      { status: 400, headers });
  }
};

