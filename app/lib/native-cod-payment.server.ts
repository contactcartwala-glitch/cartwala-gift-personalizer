import { createHash } from "node:crypto";
import { calculatePartialCod } from "./partial-cod-amounts";
import { inrPaise } from "./partial-cod-payment";

export type NativeCodAdmin = { graphql(query: string, options: {
  variables: Record<string, unknown>; tries: number; signal: AbortSignal;
}): Promise<Response> };
type Money = Parameters<typeof inrPaise>[0];
export type NativeAdvanceLine = { variantId: string | null; title: string; quantity: number;
  unitPaise: number; requiresShipping: boolean; taxable: boolean; attributes: Array<{ key: string; value: string }> };
/** Internal frozen quote only. Never construct this from a browser payment-success payload.
 * Tax amounts must come from authenticated Shopify calculations before payment starts.
 */
export type NativeCodContext = {
  id: string; shop: string; appClientId: string; draftId: string; orderId: string; test: boolean;
  goodsPaise: number; advancePercent: number; shippingPaise: number; taxesIncluded: boolean;
  initialTaxPaise: number; completedTaxPaise: number; balanceTaxable: boolean; lines: NativeAdvanceLine[];
};
export const NATIVE_COD_BALANCE_TITLE = "Remaining goods value — pay on delivery";
export const NATIVE_COD_SCOPES = ["read_orders", "write_orders", "write_order_edits"];
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const orderId = /^gid:\/\/shopify\/Order\/[1-9]\d*$/;
const safeText = (s: unknown, max: number) => typeof s === "string" && s.length <= max &&
  !Array.from(s).some(character => character.charCodeAt(0) < 32);
const propertyKey = (properties: Array<{ key: string; value: string }>) => {
  if (new Set(properties.map(p => p.key)).size !== properties.length) throw new Error("Duplicate order properties");
  return JSON.stringify([...properties].sort((a, b) => a.key.localeCompare(b.key)));
};

type NativeCodQuote = Omit<NativeCodContext, "draftId" | "orderId">;
/** Stable before the draft and resulting order exist; these IDs are bound separately in trusted storage. */
export function nativeCodQuoteReference(context: NativeCodQuote) {
  if (!uuid.test(context.id) || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(context.shop) ||
      !/^[a-f0-9]{32}$/.test(context.appClientId) ||
      typeof context.test !== "boolean" || typeof context.taxesIncluded !== "boolean" || typeof context.balanceTaxable !== "boolean" ||
      ![context.initialTaxPaise, context.completedTaxPaise].every(n => Number.isSafeInteger(n) && n >= 0) ||
      !Array.isArray(context.lines) || !context.lines.length || context.lines.length > 200)
    throw new Error("Invalid native checkout context");
  const amounts = calculatePartialCod(context.goodsPaise, context.advancePercent, context.shippingPaise);
  for (const line of context.lines) {
    if ((!context.test && !line.variantId) || (line.variantId && !/^gid:\/\/shopify\/ProductVariant\/[1-9]\d*$/.test(line.variantId)) ||
        !safeText(line.title, 255) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000 ||
        !Number.isSafeInteger(line.unitPaise) || line.unitPaise < 0 || typeof line.requiresShipping !== "boolean" ||
        typeof line.taxable !== "boolean" || !Array.isArray(line.attributes) || line.attributes.length > 100 ||
        line.attributes.some(p => !safeText(p.key, 255) || !p.key || !safeText(p.value, 4096)))
      throw new Error("Invalid native checkout merchandise");
    propertyKey(line.attributes);
  }
  const subtotal = context.lines.reduce((sum, line) => sum + line.unitPaise * line.quantity, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal + (context.taxesIncluded ? 0 : context.initialTaxPaise) !== amounts.advancePaise ||
      context.initialTaxPaise > amounts.payableNowPaise || context.completedTaxPaise > amounts.totalPaise)
    throw new Error("Native checkout prices do not match the frozen advance");
  // Explicit fields exclude resource IDs and unknown input keys. This is an integrity reference,
  // not authentication: the caller must load the quote from trusted server storage.
  const hash = createHash("sha256").update(JSON.stringify({ id: context.id, shop: context.shop,
    appClientId: context.appClientId, test: context.test, goodsPaise: context.goodsPaise,
    advancePercent: context.advancePercent, shippingPaise: context.shippingPaise,
    taxesIncluded: context.taxesIncluded, initialTaxPaise: context.initialTaxPaise,
    completedTaxPaise: context.completedTaxPaise, balanceTaxable: context.balanceTaxable,
    lines: context.lines.map(l => ({ variantId: l.variantId, title: l.title, quantity: l.quantity,
      unitPaise: l.unitPaise, requiresShipping: l.requiresShipping, taxable: l.taxable,
      attributes: JSON.parse(propertyKey(l.attributes)) })) })).digest("hex");
  return { amounts, hash, attributes: [
    { key: "_cartwala_order_kind", value: "native_cod_advance" },
    { key: "_cartwala_cod_intent", value: context.id },
    { key: "_cartwala_cod_native_hash", value: hash },
  ] };
}
export function nativeCodReference(context: NativeCodContext) {
  if (!orderId.test(context.orderId) || !/^gid:\/\/shopify\/DraftOrder\/[1-9]\d*$/.test(context.draftId))
    throw new Error("Invalid native checkout resource binding");
  return nativeCodQuoteReference(context);
}

export async function nativeCodGraphql(admin: NativeCodAdmin, query: string, variables: Record<string, unknown>) {
  const response = await admin.graphql(query, { variables, tries: 1, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Shopify native checkout response was not acknowledged");
  const body = await response.json();
  if (!body?.data || body.errors?.length) throw new Error("Shopify native checkout response could not be verified");
  return body.data;
}
export async function nativeCodPermissions(admin: NativeCodAdmin, context: NativeCodContext) {
  const data = await nativeCodGraphql(admin, `query NativeCodPermissions { shop { myshopifyDomain }
    currentAppInstallation { app { apiKey } accessScopes { handle } } }`, {});
  if (data.shop?.myshopifyDomain !== context.shop || data.currentAppInstallation?.app?.apiKey !== context.appClientId)
    throw new Error("The native checkout belongs to a different shop or app");
  const scopes = data.currentAppInstallation.accessScopes;
  if (!Array.isArray(scopes)) throw new Error("App permissions could not be confirmed");
  return NATIVE_COD_SCOPES.filter(scope => !scopes.some(row => row.handle === scope));
}

export type NativeOrderLine = Omit<NativeAdvanceLine, "unitPaise"> & { currentQuantity: number; amountSet: Money; totalSet: Money };
type NativeGraphqlLine = Omit<NativeOrderLine, "variantId" | "attributes" | "amountSet" | "totalSet"> & {
  variant: { id: string } | null; customAttributes: Array<{ key: string; value: string }>;
  originalUnitPriceSet: Money; discountedTotalSet: Money;
};
export type NativeOrder = {
  id: string; test: boolean; cancelledAt: string | null; displayFinancialStatus: string; currencyCode: string;
  taxesIncluded: boolean; customAttributes: Array<{ key: string; value: string }>;
  currentTotalPriceSet: Money; totalReceivedSet: Money; totalOutstandingSet: Money; totalRefundedSet: Money;
  totalShippingPriceSet: Money; currentTotalDiscountsSet: Money; currentTotalTaxSet: Money;
  transactions: Array<{ id: string; test: boolean; kind: string; status: string; manualPaymentGateway: boolean;
    gateway: string | null; amountSet: Money }>;
  lines: NativeOrderLine[];
};
export async function readNativeCodOrder(admin: NativeCodAdmin, context: NativeCodContext) {
  nativeCodReference(context);
  const receiptQuery = `query ReadNativeCodReceipt($id: ID!, $draft: ID!) {
    draftOrder(id:$draft) { id order { id } }
    order(id:$id) { id updatedAt test cancelledAt displayFinancialStatus currencyCode taxesIncluded customAttributes { key value }
      currentTotalPriceSet { shopMoney { amount currencyCode } } totalReceivedSet { shopMoney { amount currencyCode } }
      totalOutstandingSet { shopMoney { amount currencyCode } } totalRefundedSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount currencyCode } } currentTotalDiscountsSet { shopMoney { amount currencyCode } }
      currentTotalTaxSet { shopMoney { amount currencyCode } }
      transactions(first:100) { id test kind status manualPaymentGateway gateway amountSet { shopMoney { amount currencyCode } } }
    } }`;
  const variables = { id: context.orderId, draft: context.draftId };
  const data = await nativeCodGraphql(admin, receiptQuery, variables);
  if (data.draftOrder?.id !== context.draftId || data.draftOrder.order?.id !== context.orderId || data.order?.id !== context.orderId)
    throw new Error("The paid order is not linked to the original native checkout");
  const lines: NativeOrderLine[] = [];
  const cursors = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < 4; page++) {
    const result = await nativeCodGraphql(admin, `query ReadNativeCodLines($id: ID!, $after: String) {
      order(id:$id) { id lineItems(first:100,after:$after) { nodes { title quantity currentQuantity requiresShipping taxable
        variant { id } customAttributes { key value } originalUnitPriceSet { shopMoney { amount currencyCode } }
        discountedTotalSet { shopMoney { amount currencyCode } } } pageInfo { hasNextPage endCursor } } } }`,
    { id: context.orderId, after });
    const connection = result.order?.lineItems;
    if (result.order?.id !== context.orderId || !Array.isArray(connection?.nodes) || connection.nodes.length > 100 ||
        typeof connection.pageInfo?.hasNextPage !== "boolean") throw new Error("Native checkout lines could not be re-read");
    lines.push(...connection.nodes.map((line: NativeGraphqlLine) => ({ ...line, variantId: line.variant?.id ?? null,
      attributes: line.customAttributes, amountSet: line.originalUnitPriceSet, totalSet: line.discountedTotalSet })));
    if (!connection.pageInfo.hasNextPage) {
      const latest = await nativeCodGraphql(admin, receiptQuery, variables);
      if (JSON.stringify(latest) !== JSON.stringify(data)) throw new Error("Native order changed during verification; re-read required");
      return { ...latest.order, lines } as NativeOrder;
    }
    after = connection.pageInfo.endCursor;
    if (!after || cursors.has(after) || lines.length > 201) throw new Error("Native checkout line pagination did not finish");
    cursors.add(after);
  }
  throw new Error("Native checkout line pagination did not finish");
}

/** Gateway independent: only Shopify's authenticated successful capture/sale is proof. */
export function verifyNativeCodPayment(context: NativeCodContext, order: NativeOrder, phase: "advance" | "completed") {
  const reference = nativeCodReference(context), a = reference.amounts, completed = phase === "completed";
  if (order.id !== context.orderId || order.test !== context.test || order.cancelledAt || order.currencyCode !== "INR" ||
      order.taxesIncluded !== context.taxesIncluded || order.displayFinancialStatus !== (completed ? "PARTIALLY_PAID" : "PAID") ||
      inrPaise(order.currentTotalPriceSet) !== (completed ? a.totalPaise : a.payableNowPaise) ||
      inrPaise(order.totalReceivedSet) !== a.payableNowPaise || inrPaise(order.totalOutstandingSet) !== (completed ? a.collectOnDeliveryPaise : 0) ||
      inrPaise(order.totalRefundedSet) !== 0 || inrPaise(order.totalShippingPriceSet) !== context.shippingPaise ||
      inrPaise(order.currentTotalDiscountsSet) !== 0 ||
      inrPaise(order.currentTotalTaxSet) !== (completed ? context.completedTaxPaise : context.initialTaxPaise) ||
      reference.attributes.some(e => { const values = order.customAttributes?.filter(p => p.key === e.key);
        return values?.length !== 1 || values[0].value !== e.value; }))
    throw new Error("Native order accounting does not match the quoted advance and balance");
  const transactions = order.transactions;
  if (!Array.isArray(transactions) || !transactions.length || transactions.length >= 100 ||
      new Set(transactions.map(t => t.id)).size !== transactions.length ||
      transactions.some(t => !/^gid:\/\/shopify\/OrderTransaction\/[1-9]\d*$/.test(t.id) ||
        t.status === "SUCCESS" && ["REFUND", "VOID"].includes(t.kind))) throw new Error("Native payment history needs review");
  const paid = transactions.filter(t => t.status === "SUCCESS" && ["SALE", "CAPTURE"].includes(t.kind));
  if (!paid.length || paid.some(t => t.test !== context.test || t.manualPaymentGateway || !t.gateway?.trim()) ||
      paid.reduce((sum, t) => sum + inrPaise(t.amountSet), 0) !== a.payableNowPaise)
    throw new Error("A genuine native online payment has not been confirmed");
  const remaining = [...order.lines];
  if (remaining.length !== context.lines.length + (completed ? 1 : 0)) throw new Error("Native order merchandise changed");
  for (const line of context.lines) {
    const key = propertyKey(line.attributes);
    const index = remaining.findIndex(x => x.variantId === line.variantId && propertyKey(x.attributes) === key &&
      inrPaise(x.amountSet) === line.unitPaise && x.quantity === line.quantity);
    if (index < 0) throw new Error("Native order artwork or prices changed");
    const [actual] = remaining.splice(index, 1);
    if (actual.currentQuantity !== line.quantity || actual.requiresShipping !== line.requiresShipping ||
        actual.taxable !== line.taxable || inrPaise(actual.totalSet) !== line.unitPaise * line.quantity)
      throw new Error("Native order merchandise changed");
  }
  if (completed) {
    const balance = remaining[0];
    if (balance.variantId || balance.title !== NATIVE_COD_BALANCE_TITLE || balance.quantity !== 1 || balance.currentQuantity !== 1 ||
        balance.requiresShipping || balance.taxable !== context.balanceTaxable ||
        inrPaise(balance.amountSet) !== a.collectOnDeliveryPaise || inrPaise(balance.totalSet) !== a.collectOnDeliveryPaise)
      throw new Error("Native COD balance line is not correct");
  }
  return { orderId: context.orderId, paidPaise: a.payableNowPaise, collectPaise: a.collectOnDeliveryPaise,
    fingerprint: `native:${createHash("sha256").update(`${context.shop}:${context.orderId}:${paid.map(t => t.id).sort().join(",")}`).digest("hex")}` };
}
