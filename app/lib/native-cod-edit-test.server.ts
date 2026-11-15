import { randomUUID } from "node:crypto";
import { codBreakdownTestPayload } from "./cod-breakdown-test";
type Money = { shopMoney: { amount: string; currencyCode: string } };
function inrPaise(value: Money) {
  const money = value?.shopMoney;
  if (money?.currencyCode !== "INR" || !/^\d+(\.\d{1,2})?$/.test(money.amount)) throw new Error("Invalid test INR amount");
  const [whole, fraction = ""] = money.amount.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 101_000_000) throw new Error("Invalid test amount");
  return result;
}

export const EDIT_TEST_SHOP = "0k9icg-ns.myshopify.com";
export const EDIT_TEST_REFERENCE = "CARTWALA-NATIVE-EDIT-20261106-V1";
export const EDIT_TEST_BALANCE = "Remaining goods value — pay on delivery — TEST ONLY";
type DB = { query<T>(sql: string, params: unknown[]): Promise<T[]> };
type Admin = { graphql(query: string, options: { variables: Record<string, unknown>; tries: number; signal: AbortSignal }): Promise<Response> };
type Row = { id: string; shop: string; state: string; claimToken: string; orderId: string | null; observed: unknown };
const gid = /^gid:\/\/shopify\/Order\/[1-9]\d*$/;
export const EDIT_TEST_CREATE = `mutation NativeEditTestCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
  orderCreate(order:$order,options:$options) { order { id } userErrors { field message } }
}`;
export const EDIT_TEST_BEGIN = `mutation NativeEditTestBegin($id: ID!) { orderEditBegin(id:$id) {
  calculatedOrder { id originalOrder { id } totalPriceSet { shopMoney { amount currencyCode } } } userErrors { field message }
} }`;
export const EDIT_TEST_ADD = `mutation NativeEditTestAdd($id: ID!) { orderEditAddCustomItem(id:$id,
  title:"Remaining goods value — pay on delivery — TEST ONLY",price:{amount:"320.00",currencyCode:INR},quantity:1,requiresShipping:false,taxable:false) {
  calculatedOrder { id originalOrder { id } totalPriceSet { shopMoney { amount currencyCode } }
    totalOutstandingSet { shopMoney { amount currencyCode } } subtotalPriceSet { shopMoney { amount currencyCode } } }
  userErrors { field message }
} }`;
export const EDIT_TEST_COMMIT = `mutation NativeEditTestCommit($id: ID!) { orderEditCommit(id:$id,notifyCustomer:false,
  staffNote:"TEST ONLY: simulated 130 received, add 320 COD balance. No real payment. Do not ship.") { order { id } userErrors { field message } } }`;
export const EDIT_TEST_READ = `query NativeEditTestRead($id: ID!) { order(id:$id) {
  id test cancelledAt sourceIdentifier tags displayFinancialStatus customAttributes { key value }
  currentTotalPriceSet { shopMoney { amount currencyCode } } totalReceivedSet { shopMoney { amount currencyCode } }
  totalOutstandingSet { shopMoney { amount currencyCode } } totalRefundedSet { shopMoney { amount currencyCode } }
  totalShippingPriceSet { shopMoney { amount currencyCode } } currentTotalTaxSet { shopMoney { amount currencyCode } }
  currentTotalDiscountsSet { shopMoney { amount currencyCode } }
  transactions(first:2) { test kind status gateway amountSet { shopMoney { amount currencyCode } } }
  lineItems(first:3) { nodes { title quantity currentQuantity requiresShipping taxable variant { id }
    originalUnitPriceSet { shopMoney { amount currencyCode } } } }
} }`;
function restrict(shop: string) { if (shop !== EDIT_TEST_SHOP) throw new Error("Cartwala TEST only"); }
async function graphql(admin: Admin, query: string, variables: Record<string, unknown> = {}) {
  const response = await admin.graphql(query, { variables, tries: 1, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Shopify response not acknowledged");
  const body = await response.json();
  if (!body.data || body.errors?.length) throw new Error("Shopify response not verified");
  return body.data;
}
export function nativeEditTestPayload() {
  const payload = codBreakdownTestPayload();
  payload.order.sourceIdentifier = EDIT_TEST_REFERENCE;
  payload.order.tags = [EDIT_TEST_REFERENCE, "CARTWALA TEST - DO NOT SHIP"];
  payload.order.note = "TEST ONLY. Simulated online receipt 130; initial advance goods 80 + shipping 50. Later same-order edit adds 320. No real payment, customer, stock or shipment. Not a native gateway payment proof.";
  payload.order.lineItems = [{ title: "Advance goods value — TEST ONLY", quantity:1,
    priceSet:{shopMoney:{amount:"80.00",currencyCode:"INR"}},taxable:false,requiresShipping:false }];
  return payload;
}
async function permissions(admin: Admin) {
  const data = await graphql(admin, `query NativeEditTestPermissions { shop { myshopifyDomain }
    currentAppInstallation { app { apiKey } accessScopes { handle } } }`);
  if (data.shop?.myshopifyDomain !== EDIT_TEST_SHOP || data.currentAppInstallation?.app?.apiKey !== "3879fe641910f37451baf743e76059ee" ||
      !["write_orders", "read_orders", "write_order_edits"].every(scope => data.currentAppInstallation.accessScopes?.some((s: {handle:string}) => s.handle === scope)))
    throw new Error("Exact Cartwala app permissions required");
}
export async function readNativeEditTest(db: DB, shop: string) {
  restrict(shop);
  return await db.query<Row>(`SELECT * FROM "CodAccountingDiagnostic" WHERE "shop"=$1 AND "id" IN ($2,$3) ORDER BY "id"`,
    [shop, EDIT_TEST_REFERENCE, `${EDIT_TEST_REFERENCE}-EDIT`]);
}
async function claim(db: DB, shop: string, id: string) {
  const token = randomUUID();
  const rows = await db.query<Row>(`INSERT INTO "CodAccountingDiagnostic" ("id","shop","claimToken") VALUES ($1,$2,$3)
    ON CONFLICT ("id") DO NOTHING RETURNING *`, [id, shop, token]);
  return rows.length === 1;
}
async function link(db: DB, id: string, orderId: string) {
  const rows = await db.query<Row>(`UPDATE "CodAccountingDiagnostic" SET "orderId"=$2,"updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=$1 AND ("orderId" IS NULL OR "orderId"=$2) RETURNING *`, [id, orderId]);
  if (rows.length !== 1) throw new Error("Test order binding conflict");
}
async function record(db: DB, id: string, state: string, observed: unknown) {
  await db.query<Row>(`UPDATE "CodAccountingDiagnostic" SET "state"=$2,"observed"=$3::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 RETURNING *`,
    [id,state,JSON.stringify(observed)]);
}
async function verify(admin: Admin, id: string) {
  const order = (await graphql(admin, EDIT_TEST_READ, {id})).order;
  const expected = nativeEditTestPayload().order;
  if (!order || order.id !== id || !gid.test(id) || order.test !== true || order.cancelledAt || order.sourceIdentifier !== EDIT_TEST_REFERENCE ||
      !order.tags?.includes(EDIT_TEST_REFERENCE) || expected.customAttributes.some(e => {
        const p = order.customAttributes?.filter((x:{key:string;value:string}) => x.key === e.key);
        return p?.length !== 1 || p[0].value !== e.value;
      })) throw new Error("Original TEST identity not verified");
  const tx = order.transactions;
  if (tx?.length !== 1 || tx[0].test !== true || tx[0].kind !== "SALE" || tx[0].status !== "SUCCESS" ||
      tx[0].gateway !== "Cartwala TEST accounting (no real payment)" || inrPaise(tx[0].amountSet) !== 13000 ||
      inrPaise(order.totalReceivedSet) !== 13000 || inrPaise(order.totalRefundedSet) !== 0 ||
      inrPaise(order.totalShippingPriceSet) !== 5000 || inrPaise(order.currentTotalTaxSet) !== 0 || inrPaise(order.currentTotalDiscountsSet) !== 0)
    throw new Error("TEST payment accounting changed");
  const lines = order.lineItems?.nodes;
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 2 || lines.some(l => l.variant || l.requiresShipping || l.taxable || l.quantity !== 1 || l.currentQuantity !== 1))
    throw new Error("TEST merchandise changed");
  const initial = lines.filter(l=>l.title === expected.lineItems[0].title && inrPaise(l.originalUnitPriceSet) === 8000);
  const balance = lines.filter(l=>l.title === EDIT_TEST_BALANCE && inrPaise(l.originalUnitPriceSet) === 32000);
  const phase = initial.length === 1 && lines.length === 1 && order.displayFinancialStatus === "PAID" &&
    inrPaise(order.currentTotalPriceSet) === 13000 && inrPaise(order.totalOutstandingSet) === 0 ? "advance" :
    initial.length === 1 && balance.length === 1 && lines.length === 2 && order.displayFinancialStatus === "PARTIALLY_PAID" &&
    inrPaise(order.currentTotalPriceSet) === 45000 && inrPaise(order.totalOutstandingSet) === 32000 ? "completed" : null;
  if (!phase) throw new Error("TEST order totals do not match either accepted phase");
  return { orderId:id, phase, totalPaise:inrPaise(order.currentTotalPriceSet), receivedPaise:13000,
    outstandingPaise:inrPaise(order.totalOutstandingSet), financialStatus:String(order.displayFinancialStatus) };
}
export async function runNativeEditTest(db: DB, admin: Admin, shop: string, action: "create" | "edit" | "check") {
  restrict(shop); await permissions(admin);
  const id = EDIT_TEST_REFERENCE;
  let rows = await readNativeEditTest(db,shop), created = rows.find(x=>x.id === id), owned = false;
  try {
    if (action === "create" && !created) {
      owned = await claim(db,shop,id);
      if (owned) {
        const result = (await graphql(admin,EDIT_TEST_CREATE,nativeEditTestPayload())).orderCreate;
        if (!result?.order?.id || result.userErrors?.length) throw new Error("TEST create not confirmed");
        await link(db,id,result.order.id);
      }
    }
    rows = await readNativeEditTest(db,shop); created = rows.find(x=>x.id === id);
    if (!created) throw new Error("Create initial TEST first");
    let orderId = created.orderId;
    if (!orderId) {
      const found = (await graphql(admin,`query NativeEditTestFind($query:String!) { orders(first:2,query:$query) { nodes { id } } }`, {query:`tag:${id}`})).orders?.nodes;
      if (found?.length !== 1 || !gid.test(found[0].id)) throw new Error("Uncertain TEST create: review existing attempt");
      orderId = found[0].id; await link(db,id,orderId!);
    }
    const observed = await verify(admin,orderId!);
    await record(db,id,"confirmed",observed);
    if (action !== "edit" || observed.phase === "completed") return observed;
    // Separate durable claim deliberately has no orderId: the table permits only one row per order.
    const editId = `${id}-EDIT`;
    const editOwned = await claim(db,shop,editId);
    if (!editOwned) throw new Error("Edit already attempted; check existing order, never replay");
    try {
      const before = await verify(admin,orderId!);
      if (before.phase !== "advance") throw new Error("Initial TEST changed");
      const begin = (await graphql(admin,EDIT_TEST_BEGIN,{id:orderId})).orderEditBegin;
      const calculatedId = begin?.calculatedOrder?.id;
      if (begin?.userErrors?.length || !/^gid:\/\/shopify\/CalculatedOrder\/[1-9]\d*$/.test(calculatedId) ||
          begin.calculatedOrder.originalOrder?.id !== orderId || inrPaise(begin.calculatedOrder.totalPriceSet) !== 13000)
        throw new Error("TEST edit begin not verified");
      await record(db,editId,"processing",{calculatedId,phase:"begin"});
      const added = (await graphql(admin,EDIT_TEST_ADD,{id:calculatedId})).orderEditAddCustomItem;
      const calc = added?.calculatedOrder;
      if (added?.userErrors?.length || calc?.id !== calculatedId || calc.originalOrder?.id !== orderId ||
          inrPaise(calc.totalPriceSet) !== 45000 || inrPaise(calc.totalOutstandingSet) !== 32000 || inrPaise(calc.subtotalPriceSet) !== 40000)
        throw new Error("TEST edit calculation not verified");
      await record(db,editId,"processing",{calculatedId,phase:"added"});
      if ((await verify(admin,orderId!)).phase !== "advance") throw new Error("TEST order changed before commit");
      const result = (await graphql(admin,EDIT_TEST_COMMIT,{id:calculatedId})).orderEditCommit;
      if (result?.userErrors?.length || result?.order?.id !== orderId) throw new Error("TEST commit not confirmed");
      const final = await verify(admin,orderId!);
      if (final.phase !== "completed") throw new Error("TEST completion not verified");
      await record(db,id,"confirmed",final);
      await record(db,editId,"processing",{calculatedId,phase:"completed",orderId});
      return final;
    } catch {
      await record(db,editId,"uncertain",{phase:"review_required",orderId});
      throw new Error("TEST edit needs review. Check same order; never add balance again automatically.");
    }
  } catch {
    if (owned) await db.query<Row>(`UPDATE "CodAccountingDiagnostic" SET "state"='uncertain' WHERE "id"=$1 AND "state"='processing' RETURNING *`,[id]);
    throw new Error("TEST not confirmed. Check existing attempt; do not create another order or repeat the edit.");
  }
}
