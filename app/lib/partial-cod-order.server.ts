import { buildPaidCodOrder, verifyCodCreatedOrder, type PaidCodOrderContext,
  type CodCreatedOrder, type CodCreatedLine } from "./partial-cod-order";

export type CodOrderAdmin = { graphql(query: string, options: {
  variables: Record<string, unknown>; tries: number; signal?: AbortSignal;
}): Promise<Response> };
export const CREATE_PAID_COD_ORDER = `mutation CreatePaidCodOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
  orderCreate(order: $order, options: $options) {
    order { id }
    userErrors { field message }
  }
}`;
export const READ_COD_ORDER_ACCOUNTING = `query ReadCodOrderAccounting($id: ID!) {
  order(id: $id) {
    id cancelledAt test currencyCode presentmentCurrencyCode displayFinancialStatus sourceIdentifier taxesIncluded tags
    shippingAddress { firstName lastName address1 address2 city provinceCode zip phone countryCodeV2 }
    customAttributes { key value }
    totalPriceSet { shopMoney { amount currencyCode } }
    currentTotalPriceSet { shopMoney { amount currencyCode } }
    totalReceivedSet { shopMoney { amount currencyCode } }
    totalOutstandingSet { shopMoney { amount currencyCode } }
    totalRefundedSet { shopMoney { amount currencyCode } }
    totalShippingPriceSet { shopMoney { amount currencyCode } }
    currentTotalDiscountsSet { shopMoney { amount currencyCode } }
    totalTaxSet { shopMoney { amount currencyCode } }
    taxLines { title rate channelLiable priceSet { shopMoney { amount currencyCode } } }
    transactions(first: 2) { kind status test gateway amountSet { shopMoney { amount currencyCode } } }
  }
}`;
export const READ_COD_ORDER_LINES = `query ReadCodOrderLines($id: ID!, $after: String) {
  order(id: $id) {
    id
    lineItems(first: 50, after: $after) {
      nodes {
        variant { id } quantity currentQuantity requiresShipping taxable title
        originalUnitPriceSet { shopMoney { amount currencyCode } }
        discountedTotalSet { shopMoney { amount currencyCode } }
        customAttributes { key value }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export class CodOrderRejected extends Error {
  constructor() { super("Shopify rejected this order. Reconcile the paid advance before continuing."); }
}
async function readJson(response: Response) {
  if (!response.ok) throw new Error("Shopify order request was not acknowledged");
  const json = await response.json();
  if (!json || typeof json !== "object" || json.errors?.length || !json.data)
    throw new Error("Shopify order response could not be verified");
  return json.data;
}

/** Caller must first commit a durable claim; this function performs exactly one mutation attempt. */
export async function createPaidCodOrderOnce(admin: CodOrderAdmin, context: PaidCodOrderContext, allowLiveOrders = false) {
  const expected = buildPaidCodOrder(context);
  if (context.intent.codOrderId || (!expected.order.test && !allowLiveOrders))
    throw new Error("Live order creation is not enabled or this intent already has an order");
  const data = await readJson(await admin.graphql(CREATE_PAID_COD_ORDER, {
    variables: { order: expected.order, options: expected.options }, tries: 1, signal: AbortSignal.timeout(20_000),
  }));
  const result = data.orderCreate;
  if (result?.order === null && Array.isArray(result.userErrors) && result.userErrors.length)
    throw new CodOrderRejected();
  if (!result || !Array.isArray(result.userErrors) || result.userErrors.length ||
      !/^gid:\/\/shopify\/Order\/[1-9]\d*$/.test(result.order?.id || ""))
    throw new Error("Shopify order creation outcome is uncertain; do not create another order");
  return result.order.id as string;
}

export async function readAndVerifyCodOrder(admin: CodOrderAdmin, context: PaidCodOrderContext, orderId: string) {
  if (!/^gid:\/\/shopify\/Order\/[1-9]\d*$/.test(orderId)) throw new Error("Invalid COD order ID");
  const lines: CodCreatedLine[] = [], cursors = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < 3; page++) {
    const data = await readJson(await admin.graphql(READ_COD_ORDER_LINES, {
      variables: { id: orderId, after }, tries: 1, signal: AbortSignal.timeout(20_000) }));
    const order = data.order, connection = order?.lineItems;
    if (order?.id !== orderId || !Array.isArray(connection?.nodes) || connection.nodes.length > 50 ||
        typeof connection.pageInfo?.hasNextPage !== "boolean") throw new Error("Could not re-read Shopify order lines");
    lines.push(...connection.nodes);
    if (lines.length > 101) throw new Error("Shopify order has unexpected merchandise");
    if (!connection.pageInfo.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (page === 2 || !after || cursors.has(after)) throw new Error("Shopify order pagination did not finish");
    cursors.add(after);
  }
  // Re-read accounting after all line pages, so money/cancellation checks are the final acknowledgment.
  const data = await readJson(await admin.graphql(READ_COD_ORDER_ACCOUNTING, {
    variables: { id: orderId }, tries: 1, signal: AbortSignal.timeout(20_000) }));
  if (data.order?.id !== orderId) throw new Error("Shopify returned a different order");
  return verifyCodCreatedOrder(context, data.order as CodCreatedOrder, lines);
}
