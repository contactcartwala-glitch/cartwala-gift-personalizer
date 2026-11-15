import { codBreakdownTestPayload, COD_BREAKDOWN_TEST_REFERENCE } from "./cod-breakdown-test";
import { randomUUID } from "node:crypto";

export const COD_DIAGNOSTIC_SHOP = "0k9icg-ns.myshopify.com";
type Database = { query<T>(sql: string, parameters: unknown[]): Promise<T[]> };
type Admin = { graphql(query: string, options: { variables: Record<string, unknown>; tries: number; signal: AbortSignal }): Promise<Response> };
type Row = { id: string; shop: string; state: string; claimToken: string; orderId: string | null; observed: unknown };
export const CREATE_COD_DIAGNOSTIC = `mutation CreateCodAccountingTest($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
  orderCreate(order: $order, options: $options) { order { id } userErrors { field message } }
}`;
export const FIND_COD_DIAGNOSTIC = `query FindCodAccountingTest($query: String!) {
  orders(first: 2, query: $query) { nodes { id } }
}`;
export const READ_COD_DIAGNOSTIC = `query ReadCodAccountingTest($id: ID!) {
  order(id: $id) {
    id test cancelledAt sourceIdentifier tags displayFinancialStatus
    customAttributes { key value }
    totalPriceSet { shopMoney { amount currencyCode } }
    totalReceivedSet { shopMoney { amount currencyCode } }
    totalOutstandingSet { shopMoney { amount currencyCode } }
    totalRefundedSet { shopMoney { amount currencyCode } }
    totalShippingPriceSet { shopMoney { amount currencyCode } }
    totalTaxSet { shopMoney { amount currencyCode } }
    transactions(first: 2) { test kind status gateway amountSet { shopMoney { amount currencyCode } } }
    lineItems(first: 3) { nodes { title quantity requiresShipping variant { id } originalUnitPriceSet { shopMoney { amount currencyCode } } } }
  }
}`;
export function codDiagnosticReference(shop: string) {
  if (shop !== COD_DIAGNOSTIC_SHOP) throw new Error("COD diagnostic is restricted to Cartwala");
  return COD_BREAKDOWN_TEST_REFERENCE;
}
export function codDiagnosticPayload(shop: string) {
  codDiagnosticReference(shop);
  return codBreakdownTestPayload();
}
async function graphql(admin: Admin, query: string, variables: Record<string, unknown>) {
  const response = await admin.graphql(query, { variables, tries: 1, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Shopify test response was not acknowledged");
  const body = await response.json();
  if (!body?.data || body.errors?.length) throw new Error("Shopify test response could not be verified");
  return body.data;
}
function amount(value: { shopMoney?: { amount?: string; currencyCode?: string } } | null | undefined) {
  const money = value?.shopMoney;
  if (money?.currencyCode !== "INR" || typeof money.amount !== "string" || !/^\d+(\.\d{1,2})?$/.test(money.amount))
    throw new Error("Invalid accounting test amount");
  const [whole, fraction = ""] = money.amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
async function verify(admin: Admin, shop: string, id: string) {
  if (!/^gid:\/\/shopify\/Order\/[1-9]\d*$/.test(id)) throw new Error("Invalid test order ID");
  const data = await graphql(admin, READ_COD_DIAGNOSTIC, { id }), order = data.order;
  const expected = codDiagnosticPayload(shop).order;
  if (!order || order.id !== id || order.test !== true || order.cancelledAt ||
      order.sourceIdentifier !== expected.sourceIdentifier || !order.tags?.includes(expected.sourceIdentifier))
    throw new Error("This is not the original Cartwala accounting test order");
  const observed = { totalPaise: amount(order.totalPriceSet), receivedPaise: amount(order.totalReceivedSet),
    outstandingPaise: amount(order.totalOutstandingSet), financialStatus: String(order.displayFinancialStatus || ""),
    gateway: String(order.transactions?.[0]?.gateway || ""), shippingPaise: amount(order.totalShippingPriceSet) };
  const lines = order.lineItems?.nodes, transaction = order.transactions?.[0];
  const matches = observed.totalPaise === 45000 && observed.receivedPaise === 13000 && observed.outstandingPaise === 32000 &&
    observed.financialStatus === "PARTIALLY_PAID" && amount(order.totalRefundedSet) === 0 &&
    amount(order.totalShippingPriceSet) === 5000 && amount(order.totalTaxSet) === 0 &&
    order.transactions?.length === 1 && transaction.test === true && transaction.kind === "SALE" &&
    transaction.status === "SUCCESS" && amount(transaction.amountSet) === 13000 && transaction.gateway === "Cartwala TEST accounting (no real payment)" &&
    expected.customAttributes.every(e => order.customAttributes?.filter((p: { key: string; value: string }) => p.key === e.key && p.value === e.value).length === 1) &&
    Array.isArray(lines) && lines.length === 1 && expected.lineItems.every(e => lines.some(line =>
      line.title === e.title && line.quantity === 1 && line.requiresShipping === false && !line.variant &&
      amount(line.originalUnitPriceSet) === amount(e.priceSet)));
  return { state: matches ? "confirmed" : "mismatch", observed };
}
export async function readCodDiagnostic(db: Database, shop: string) {
  const id = codDiagnosticReference(shop);
  return (await db.query<Row>(`SELECT * FROM "CodAccountingDiagnostic" WHERE "id"=$1 AND "shop"=$2`, [id, shop]))[0] ?? null;
}

/** One test attempt per shop/version. No customer/contact/address, stock change or real payment. */
export async function runCodDiagnostic(db: Database, admin: Admin, shop: string) {
  const id = codDiagnosticReference(shop), token = randomUUID();
  const inserted = await db.query<Row>(`INSERT INTO "CodAccountingDiagnostic" ("id","shop","claimToken") VALUES ($1,$2,$3)
    ON CONFLICT ("id") DO NOTHING RETURNING *`, [id, shop, token]);
  const owned = inserted.length === 1;
  const row = inserted[0] ?? await readCodDiagnostic(db, shop);
  if (!row) throw new Error("Could not read accounting test state");
  let orderId = row.orderId;
  try {
    if (owned) {
      const data = await graphql(admin, CREATE_COD_DIAGNOSTIC, codDiagnosticPayload(shop));
      const result = data.orderCreate;
      if (result?.order === null && result.userErrors?.length) {
        await db.query<Row>(`UPDATE "CodAccountingDiagnostic" SET "state"='rejected',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 RETURNING *`, [id]);
        throw new Error("Shopify rejected the test; no automatic second attempt will be made");
      }
      orderId = result?.order?.id;
      if (!orderId || !/^gid:\/\/shopify\/Order\/[1-9]\d*$/.test(orderId)) throw new Error("Test outcome is uncertain");
    } else if (!orderId) {
      // The first request may have succeeded before its response was lost. Search; never re-POST.
      const data = await graphql(admin, FIND_COD_DIAGNOSTIC, { query: `tag:${id}` });
      const found = data.orders?.nodes;
      if (!Array.isArray(found) || found.length !== 1) throw new Error("Test is processing or needs review; do not create another order");
      orderId = found[0].id;
    }
    if (!orderId) throw new Error("Accounting test needs review");
    const linked = await db.query<Row>(`UPDATE "CodAccountingDiagnostic" SET "orderId"=$2,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=$1 AND ("orderId" IS NULL OR "orderId"=$2) RETURNING *`, [id, orderId]);
    if (linked.length !== 1) throw new Error("Accounting test order conflicts with the saved reference");
    const verified = await verify(admin, shop, orderId);
    const recorded = await db.query<Row>(`UPDATE "CodAccountingDiagnostic" SET "state"=$2,"observed"=$3::jsonb,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=$1 AND "orderId"=$4 RETURNING *`, [id, verified.state, JSON.stringify(verified.observed), orderId]);
    if (recorded.length !== 1) throw new Error("Accounting test result could not be recorded");
    return { orderId, ...verified };
  } catch {
    if (owned) await db.query<Row>(`UPDATE "CodAccountingDiagnostic" SET "state"='uncertain',"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=$1 AND "state"='processing' RETURNING *`, [id]);
    throw new Error("Accounting test is not confirmed. Recheck the existing test; another order will not be created.");
  }
}
