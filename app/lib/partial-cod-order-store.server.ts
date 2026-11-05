import { randomUUID } from "node:crypto";
import { buildPaidCodOrder, type PaidCodOrderContext } from "./partial-cod-order";
import { createPaidCodOrderOnce, readAndVerifyCodOrder, CodOrderRejected, type CodOrderAdmin } from "./partial-cod-order.server";
import { recordPaytmProof, type PaytmDatabase } from "./partial-cod-paytm-store.server";
import type { createPaytmClient } from "./partial-cod-paytm.server";

type Account = { mid: string; environment: "staging" | "production" };
type Gateway = Pick<ReturnType<typeof createPaytmClient>, "verify">;
type OrderAttempt = { intentId: string; orderReference: string; paymentFingerprint: string;
  payloadHash: string; state: string; claimToken: string; candidateOrderId: string | null };

export async function loadPaidCodOrderContext(db: PaytmDatabase, intentId: string, shop: string, account: Account) {
  const rows = await db.query<PaidCodOrderContext["intent"] & {
    accountingSnapshot: unknown; shippingAddress: unknown; payment: PaidCodOrderContext["payment"];
  }>(`SELECT i."id", i."shop", i."state", i."currency", i."orderPaise", i."advancePercent", i."payableNowPaise",
      i."collectPaise", i."depositOrderId", i."codOrderId", i."accountingSnapshot", i."shippingAddress",
      jsonb_build_object('state', p."state", 'environment', p."environment", 'merchantId', p."merchantId",
        'orderId', p."orderId", 'transactionId', p."transactionId", 'paymentFingerprint', p."paymentFingerprint",
        'payableNowPaise', p."payableNowPaise") AS payment
    FROM "PartialCodIntent" i JOIN "PartialCodPaytmAttempt" p ON p."intentId"=i."id"
    WHERE i."id"=$1 AND i."shop"=$2 AND p."merchantId"=$3 AND p."environment"=$4
      AND i."depositOrderId" IS NULL AND i."depositDraftId" IS NULL AND p."state"='paid'`,
  [intentId, shop, account.mid, account.environment]);
  if (rows.length !== 1) throw new Error("No verified Paytm merchandise intent for this shop/account");
  const { accountingSnapshot, shippingAddress, payment, ...intent } = rows[0];
  const context: PaidCodOrderContext = { intent, accountingSnapshot, shippingAddress, payment };
  buildPaidCodOrder(context);
  return context;
}

async function existingAttempt(db: PaytmDatabase, intentId: string) {
  const rows = await db.query<OrderAttempt>(`SELECT * FROM "PartialCodOrderAttempt" WHERE "intentId"=$1`, [intentId]);
  return rows[0] ?? null;
}
async function freshPayment(db: PaytmDatabase, gateway: Gateway, context: PaidCodOrderContext, account: Account) {
  const proof = await gateway.verify(context.intent);
  if (proof.status !== "paid" || proof.fingerprint !== context.payment.paymentFingerprint)
    throw new Error("Paytm advance must be reverified before order creation or recovery");
  await recordPaytmProof(db, context.intent, account, proof);
}
function requireSameAttempt(attempt: OrderAttempt, context: PaidCodOrderContext) {
  const expected = buildPaidCodOrder(context);
  if (attempt.paymentFingerprint !== context.payment.paymentFingerprint || attempt.payloadHash !== expected.payloadHash ||
      attempt.orderReference !== expected.order.sourceIdentifier) throw new Error("Recorded order attempt changed; reconcile manually");
}
async function claimOrder(db: PaytmDatabase, context: PaidCodOrderContext) {
  const expected = buildPaidCodOrder(context), claimToken = randomUUID();
  const rows = await db.query<OrderAttempt>(`INSERT INTO "PartialCodOrderAttempt"
      ("intentId", "orderReference", "paymentFingerprint", "payloadHash", "claimToken")
    SELECT i."id", $2, $3, $4, $5 FROM "PartialCodIntent" i
      JOIN "PartialCodPaytmAttempt" p ON p."intentId"=i."id"
    WHERE i."id"=$1 AND i."shop"=$6 AND i."state" IN ('awaiting_payment','paid')
      AND i."codOrderId" IS NULL AND i."depositOrderId" IS NULL AND i."depositDraftId" IS NULL
      AND i."accountingSnapshot" IS NOT NULL AND p."state"='paid' AND p."paymentFingerprint"=$3
      AND p."payableNowPaise"=i."payableNowPaise"
      AND p."updatedAt" > CURRENT_TIMESTAMP - INTERVAL '5 minutes'
    ON CONFLICT ("intentId") DO NOTHING RETURNING *`, [context.intent.id, expected.order.sourceIdentifier,
    context.payment.paymentFingerprint, expected.payloadHash, claimToken, context.intent.shop]);
  if (rows.length !== 1) throw new Error("Order already started or closed; reconcile it instead of creating another order");
  return rows[0];
}
async function rememberOrder(db: PaytmDatabase, attempt: OrderAttempt, orderId: string) {
  const rows = await db.query<OrderAttempt>(`UPDATE "PartialCodOrderAttempt" SET "candidateOrderId"=$3, "updatedAt"=CURRENT_TIMESTAMP
    WHERE "intentId"=$1 AND "claimToken"=$2 AND "state" IN ('processing','uncertain')
      AND ("candidateOrderId" IS NULL OR "candidateOrderId"=$3) RETURNING *`, [attempt.intentId, attempt.claimToken, orderId]);
  if (rows.length !== 1) throw new Error("Shopify order candidate could not be recorded");
}
async function finishOrder(db: PaytmDatabase, context: PaidCodOrderContext, attempt: OrderAttempt, orderId: string) {
  const rows = await db.query<OrderAttempt>(`WITH eligible AS MATERIALIZED (
      SELECT i."id" FROM "PartialCodIntent" i JOIN "PartialCodOrderAttempt" a ON a."intentId"=i."id"
      WHERE i."id"=$1 AND i."shop"=$4 AND i."state" IN ('awaiting_payment','paid') AND i."codOrderId" IS NULL
        AND i."depositOrderId" IS NULL AND a."claimToken"=$2 AND a."candidateOrderId"=$3
        AND a."state" IN ('processing','uncertain') AND a."payloadHash"=$5 AND a."paymentFingerprint"=$6
      FOR UPDATE OF i,a
    ), finished AS (
      UPDATE "PartialCodOrderAttempt" a SET "state"='completed', "updatedAt"=CURRENT_TIMESTAMP
      FROM eligible e WHERE a."intentId"=e."id" RETURNING a.*
    ), updated AS (
      UPDATE "PartialCodIntent" i SET "state"='cod_order_created', "codOrderId"=$3, "updatedAt"=CURRENT_TIMESTAMP
      FROM eligible e WHERE i."id"=e."id" RETURNING i."id"
    ) SELECT f.* FROM finished f JOIN updated u ON u."id"=f."intentId"`, [context.intent.id, attempt.claimToken, orderId,
    context.intent.shop, attempt.payloadHash, context.payment.paymentFingerprint]);
  if (rows.length !== 1) throw new Error("Order could not be linked; reconcile before courier processing");
}

/** Durable one-writer entry point. An uncertain mutation is never automatically submitted again. */
export async function createCodOrderFromPaidIntent(db: PaytmDatabase, admin: CodOrderAdmin, gateway: Gateway,
  intentId: string, shop: string, account: Account,
  options: { allowLiveOrders?: boolean; shippingSyncExcluded?: boolean } = {}) {
  if (options.shippingSyncExcluded !== true)
    throw new Error("Exclude these orders from automatic shipping sync before creating any order");
  if (account.environment === "production" && options.allowLiveOrders !== true) throw new Error("Live order creation is not enabled");
  const context = await loadPaidCodOrderContext(db, intentId, shop, account);
  const prior = await existingAttempt(db, intentId);
  if (prior) {
    requireSameAttempt(prior, context);
    if (prior.state === "completed" && prior.candidateOrderId === context.intent.codOrderId)
      return { orderId: prior.candidateOrderId!, alreadyCreated: true };
    throw new Error("Order has an existing attempt; reconcile it without creating another order");
  }
  await freshPayment(db, gateway, context, account);
  const attempt = await claimOrder(db, context);
  try {
    const orderId = await createPaidCodOrderOnce(admin, context, options.allowLiveOrders);
    await rememberOrder(db, attempt, orderId);
    await readAndVerifyCodOrder(admin, context, orderId);
    await finishOrder(db, context, attempt, orderId);
    return { orderId, alreadyCreated: false };
  } catch (error) {
    await db.query<OrderAttempt>(`UPDATE "PartialCodOrderAttempt" SET "state"=$3, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "intentId"=$1 AND "claimToken"=$2 AND "state"='processing' RETURNING *`,
    [intentId, attempt.claimToken, error instanceof CodOrderRejected ? "rejected" : "uncertain"]);
    throw new Error("Order was not acknowledged. Reconcile this paid advance; do not create another order.");
  }
}

/** Read-only provider recovery plus local linking. It never calls orderCreate. */
export async function reconcilePaidCodOrder(db: PaytmDatabase, admin: CodOrderAdmin, gateway: Gateway,
  intentId: string, shop: string, account: Account, candidateOrderId?: string) {
  const context = await loadPaidCodOrderContext(db, intentId, shop, account), attempt = await existingAttempt(db, intentId);
  if (!attempt || attempt.state !== "uncertain") throw new Error("No uncertain order attempt to reconcile");
  requireSameAttempt(attempt, context);
  const orderId = attempt.candidateOrderId ?? candidateOrderId;
  if (!orderId || (candidateOrderId && orderId !== candidateOrderId)) throw new Error("Find the original Shopify order before recovery");
  await freshPayment(db, gateway, context, account);
  await readAndVerifyCodOrder(admin, context, orderId);
  await rememberOrder(db, attempt, orderId);
  await finishOrder(db, context, attempt, orderId);
  return { orderId };
}
