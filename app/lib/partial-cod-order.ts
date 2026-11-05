import { createHash } from "node:crypto";
import { readCodAccounting, type FrozenCodAccounting } from "./partial-cod-accounting";
import { buildCodQuoteInput } from "./partial-cod-quote";
import { inrPaise } from "./partial-cod-payment";
import { paytmPaymentReference, type PaytmIntent } from "./partial-cod-paytm.server";

type Money = Parameters<typeof inrPaise>[0];
export type PaidCodOrderContext = {
  intent: PaytmIntent & { depositOrderId: string | null; codOrderId: string | null };
  accountingSnapshot: unknown; shippingAddress: unknown;
  payment: { state: string; environment: "staging" | "production"; merchantId: string;
    orderId: string; transactionId: string | null; paymentFingerprint: string | null; payableNowPaise: number };
};
const money = (paise: number) => ({ shopMoney: {
  amount: `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`, currencyCode: "INR",
} });
export const COD_FEE_TITLE = "COD charge";
export const PAYTM_ORDER_GATEWAY = "Cartwala Paytm";

/** One merchandise order, one genuine external-payment record, no separate deposit sale. */
export function buildPaidCodOrder(context: PaidCodOrderContext) {
  const { intent, payment } = context, reference = paytmPaymentReference(intent);
  const snapshot = readCodAccounting(context.accountingSnapshot, intent.orderPaise);
  if (!["awaiting_payment", "paid", "cod_order_created"].includes(intent.state) || intent.depositOrderId ||
      payment.state !== "paid" || !payment.transactionId || !/^[A-Za-z0-9_-]{1,100}$/.test(payment.transactionId) ||
      payment.orderId !== reference.orderId || payment.payableNowPaise !== intent.payableNowPaise ||
      !/^[A-Za-z0-9]{10,40}$/.test(payment.merchantId) ||
      !["staging", "production"].includes(payment.environment) ||
      payment.paymentFingerprint !== `paytm:${payment.environment}:${payment.merchantId}:${payment.transactionId}` ||
      intent.collectPaise < 1) throw new Error("A verified Paytm payment and an open merchandise intent are required");
  const shippingAddress = buildCodQuoteInput({ lines: snapshot.lines, address: context.shippingAddress }).shippingAddress;
  const test = payment.environment === "staging", tag = `cartwala-cod-${reference.orderId}`;
  const attributes = [
    { key: "_cartwala_order_kind", value: "partial_cod_merchandise" },
    { key: "_cartwala_cod_intent", value: intent.id },
    { key: "_cartwala_cod_payment", value: payment.paymentFingerprint },
    { key: "_cartwala_cod_collect_paise", value: String(intent.collectPaise) },
  ];
  const order = {
    currency: "INR", presentmentCurrency: "INR", test,
    sourceName: "cartwala_advance_cod", sourceIdentifier: reference.orderId, tags: [tag, "Cartwala Advance COD"],
    shippingAddress, phone: shippingAddress.phone, buyerAcceptsMarketing: false,
    taxesIncluded: snapshot.taxesIncluded,
    taxLines: snapshot.taxLines.map(t => ({ title: t.title, rate: String(t.rate), priceSet: money(t.paise),
      channelLiable: t.channelLiable })),
    shippingLines: [{ title: "Free shipping", code: "cartwala_free_shipping", priceSet: money(0) }],
    customAttributes: attributes,
    lineItems: [
      ...snapshot.lines.map(line => ({ variantId: line.variantId, quantity: line.quantity,
        priceSet: money(line.unitPaise), taxable: line.taxable, requiresShipping: line.requiresShipping,
        properties: [...line.properties, { name: "_cartwala_cod_line", value: line.quoteLineId }] })),
      { title: COD_FEE_TITLE, quantity: 1, priceSet: money(8000), taxable: false, requiresShipping: false,
        properties: [{ name: "_cartwala_order_kind", value: "partial_cod_fee" },
          { name: "_cartwala_cod_intent", value: intent.id }] },
    ],
    transactions: [{ gateway: PAYTM_ORDER_GATEWAY, kind: "SALE", status: "SUCCESS", test,
      amountSet: money(intent.payableNowPaise), receiptJson: {
        cartwalaIntentId: intent.id, paytmTransactionId: payment.transactionId,
      } }],
  };
  // financialStatus is intentionally omitted: Shopify must derive it from the actual transaction.
  const options = { inventoryBehaviour: "DECREMENT_OBEYING_POLICY", sendReceipt: false, sendFulfillmentReceipt: false };
  return { order, options, tag, snapshot, attributes, payloadHash: createHash("sha256")
    .update(JSON.stringify({ order, options })).digest("hex") };
}

export type CodCreatedOrder = {
  id: string; cancelledAt: string | null; test: boolean; currencyCode: string; presentmentCurrencyCode: string;
  displayFinancialStatus: string; sourceIdentifier: string | null; taxesIncluded: boolean;
  tags: string[];
  shippingAddress: { firstName: string | null; lastName: string | null; address1: string | null; address2: string | null;
    city: string | null; provinceCode: string | null; zip: string | null; phone: string | null; countryCodeV2: string | null } | null;
  customAttributes: Array<{ key: string; value: string }>;
  totalPriceSet: Money; currentTotalPriceSet: Money; totalReceivedSet: Money; totalOutstandingSet: Money;
  totalRefundedSet: Money; totalShippingPriceSet: Money; currentTotalDiscountsSet: Money; totalTaxSet: Money;
  taxLines: Array<{ title: string; rate: number | null; channelLiable: boolean | null; priceSet: Money }>;
  transactions: Array<{ kind: string; status: string; test: boolean; gateway: string | null; amountSet: Money }>;
};
export type CodCreatedLine = {
  variant: { id: string } | null; quantity: number; currentQuantity: number; requiresShipping: boolean; taxable: boolean;
  title: string; originalUnitPriceSet: Money; discountedTotalSet: Money;
  customAttributes: Array<{ key: string; value: string }>;
};
function props(properties: Array<{ key: string; value: string }>) {
  if (new Set(properties.map(p => p.key)).size !== properties.length) throw new Error("Duplicate Shopify order attributes");
  return JSON.stringify([...properties].sort((a, b) => a.key.localeCompare(b.key)));
}

/** Require a server re-read to acknowledge both accounting and artwork before courier work. */
export function verifyCodCreatedOrder(context: PaidCodOrderContext, actual: CodCreatedOrder, lines: CodCreatedLine[]) {
  const expected = buildPaidCodOrder(context), { intent } = context;
  if (!/^gid:\/\/shopify\/Order\/[1-9]\d*$/.test(actual.id) || actual.cancelledAt ||
      (intent.codOrderId && actual.id !== intent.codOrderId) || actual.test !== expected.order.test ||
      actual.currencyCode !== "INR" || actual.presentmentCurrencyCode !== "INR" ||
      actual.displayFinancialStatus !== "PARTIALLY_PAID" || actual.sourceIdentifier !== expected.order.sourceIdentifier ||
      !actual.tags.includes(expected.tag) ||
      actual.taxesIncluded !== expected.snapshot.taxesIncluded ||
      expected.attributes.some(p => actual.customAttributes.filter(v => v.key === p.key && v.value === p.value).length !== 1) ||
      inrPaise(actual.totalPriceSet) !== intent.orderPaise + 8000 ||
      inrPaise(actual.currentTotalPriceSet) !== intent.orderPaise + 8000 ||
      inrPaise(actual.totalReceivedSet) !== intent.payableNowPaise ||
      inrPaise(actual.totalOutstandingSet) !== intent.collectPaise || inrPaise(actual.totalRefundedSet) !== 0 ||
      inrPaise(actual.totalShippingPriceSet) !== 0 || inrPaise(actual.currentTotalDiscountsSet) !== 0 ||
      inrPaise(actual.totalTaxSet) !== expected.snapshot.taxPaise || actual.transactions.length !== 1)
    throw new Error("Shopify order accounting does not acknowledge this advance and remaining balance");
  const transaction = actual.transactions[0];
  if (transaction.kind !== "SALE" || transaction.status !== "SUCCESS" || transaction.test !== expected.order.test ||
      transaction.gateway !== PAYTM_ORDER_GATEWAY || inrPaise(transaction.amountSet) !== intent.payableNowPaise)
    throw new Error("Shopify did not acknowledge the recorded Paytm advance");
  const taxes = actual.taxLines.map(t => ({ title: t.title, rate: t.rate,
    channelLiable: t.channelLiable, paise: inrPaise(t.priceSet) }));
  const taxKey = (t: typeof taxes[number]) => JSON.stringify([t.title, t.rate, t.channelLiable, t.paise]);
  if (JSON.stringify(taxes.map(taxKey).sort()) !== JSON.stringify(expected.snapshot.taxLines.map(taxKey).sort()))
    throw new Error("Shopify tax details changed; review the order before shipping");
  const address = actual.shippingAddress, destination = expected.order.shippingAddress;
  const normalized = (value: string | null) => (value || "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  if (!address || address.countryCodeV2 !== "IN" ||
      (address.phone || "").replace(/[ ()-]/g, "") !== destination.phone ||
      (["firstName", "lastName", "address1", "address2", "city", "provinceCode", "zip"] as const)
        .some(key => normalized(address[key]) !== normalized(destination[key])))
    throw new Error("Shopify delivery details changed; review the order before shipping");
  verifyCodOrderLines(expected.snapshot, intent.id, lines);
  return { orderId: actual.id, receivedPaise: intent.payableNowPaise, collectPaise: intent.collectPaise };
}

function verifyCodOrderLines(snapshot: FrozenCodAccounting, intentId: string, actual: CodCreatedLine[]) {
  if (actual.length !== snapshot.lines.length + 1) throw new Error("Shopify order lines changed");
  const remaining = [...actual];
  for (const line of snapshot.lines) {
    const expected = props([...line.properties.map(p => ({ key: p.name, value: p.value })),
      { key: "_cartwala_cod_line", value: line.quoteLineId }]);
    const index = remaining.findIndex(item => item.variant?.id === line.variantId && props(item.customAttributes) === expected);
    if (index < 0) throw new Error("Shopify artwork properties were not preserved");
    const [item] = remaining.splice(index, 1);
    if (item.quantity !== line.quantity || item.currentQuantity !== line.quantity ||
        item.requiresShipping !== line.requiresShipping || item.taxable !== line.taxable ||
        inrPaise(item.originalUnitPriceSet) !== line.unitPaise ||
        inrPaise(item.discountedTotalSet) !== line.unitPaise * line.quantity)
      throw new Error("Shopify merchandise prices or quantities changed");
  }
  const fee = remaining[0];
  if (fee.variant || fee.quantity !== 1 || fee.currentQuantity !== 1 || fee.requiresShipping || fee.taxable ||
      fee.title !== COD_FEE_TITLE || inrPaise(fee.originalUnitPriceSet) !== 8000 || inrPaise(fee.discountedTotalSet) !== 8000 ||
      props(fee.customAttributes) !== props([{ key: "_cartwala_order_kind", value: "partial_cod_fee" },
        { key: "_cartwala_cod_intent", value: intentId }])) throw new Error("Shopify COD fee changed");
}
