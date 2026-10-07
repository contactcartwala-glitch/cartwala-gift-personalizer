import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { loadCodSettings } from "../lib/partial-cod-settings.server";
import { canEnableAdvanceCod } from "../lib/partial-cod-settings";
import { calculateCodQuote } from "../lib/partial-cod-quote.server";

const headers = { "Cache-Control": "no-store" };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.public.appProxy(request);
  if (!admin || !session) return Response.json({ error: "App is not installed" }, { status: 503, headers });
  const settings = await loadCodSettings(session.shop);
  return Response.json({ enabled: settings.enabled && canEnableAdvanceCod(),
    advancePercent: settings.advancePercent, codFeePaise: 8000, checkoutAvailable: false }, { headers });
};

// Review quotes only. This endpoint cannot create a checkout or take payment.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.public.appProxy(request);
  if (!admin || !session) return Response.json({ error: "App is not installed" }, { status: 503, headers });
  if (!request.headers.get("content-type")?.includes("application/json"))
    return Response.json({ error: "Use a JSON request" }, { status: 415, headers });
  const raw = await request.text();
  if (raw.length > 128 * 1024) return Response.json({ error: "Cart request is too large" }, { status: 413, headers });
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input) || input.intent !== "review_quote")
      throw new Error("Advance checkout is not yet available");
    if (typeof input.requestKey !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input.requestKey))
      throw new Error("Invalid quote request key");
    // Customer-specific discount eligibility has not been integrated.
    if (Array.isArray(input.discountCodes) && input.discountCodes.length)
      throw new Error("Discount codes are not supported in this review yet. Use prepaid checkout.");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid cart" }, { status: 400, headers });
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
    const quote = await calculateCodQuote(admin, input, settings.advancePercent);
    const row = await prisma.partialCodIntent.create({ data: {
      shop: session.shop, requestKey, state: "quoted", advancePercent: settings.advancePercent,
      orderPaise: quote.amounts.orderPaise, payableNowPaise: quote.amounts.payableNowPaise,
      collectPaise: quote.amounts.collectOnDeliveryPaise,
      lines: quote.lines, shippingAddress: quote.shippingAddress,
    } });
    return Response.json({ quoteId: row.id, advancePercent: row.advancePercent,
      amounts: quote.amounts, checkoutAvailable: false,
      message: "Review only. No payment or order has been created." }, { headers });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002")
      return Response.json({ error: "Use a new request key for this cart" }, { status: 409, headers });
    // Do not expose upstream API, database or address details in public errors.
    return Response.json({ error: "Could not calculate this cart. Check your delivery details or use prepaid checkout." },
      { status: 400, headers });
  }
};
