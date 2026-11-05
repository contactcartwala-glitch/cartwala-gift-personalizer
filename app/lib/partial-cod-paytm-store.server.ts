import { randomUUID } from "node:crypto";
import { paytmPaymentReference, type PaytmIntent, type createPaytmClient } from "./partial-cod-paytm.server";
import { readCodAccounting } from "./partial-cod-accounting";

/** Parameterized SQL only. Implement with Prisma $queryRawUnsafe(sql, ...parameters). */
export type PaytmDatabase = { query<T>(sql: string, parameters: unknown[]): Promise<T[]> };
type Gateway = ReturnType<typeof createPaytmClient>;
type Account = { mid: string; environment: "staging" | "production" };
type PaidProof = Extract<Awaited<ReturnType<Gateway["verify"]>>, { status: "paid" }>;
type Attempt = { intentId: string; orderId: string; state: string; transactionId: string | null };

export async function findPaytmCallbackIntent(db: PaytmDatabase, orderId: string, shop: string, account: Account) {
  const rows = await db.query<PaytmIntent>(
    `SELECT i."id", i."shop", i."state", i."currency", i."orderPaise", i."advancePercent", i."payableNowPaise", i."collectPaise"
     FROM "PartialCodIntent" i JOIN "PartialCodPaytmAttempt" a ON a."intentId" = i."id"
     WHERE a."orderId" = $1 AND i."shop" = $2 AND a."merchantId" = $3 AND a."environment" = $4
       AND a."state" <> 'created'`, [orderId, shop, account.mid, account.environment]);
  if (rows.length !== 1) throw new Error("Unknown Paytm callback order");
  if (paytmPaymentReference(rows[0]).orderId !== orderId) throw new Error("Invalid Paytm callback reference");
  return rows[0];
}

/** Limits signed callback replay across workers, without storing the callback body or PII. */
export async function claimPaytmStatusCheck(db: PaytmDatabase, intentId: string) {
  const rows = await db.query<Attempt>(
    `UPDATE "PartialCodPaytmAttempt" SET "lastCheckedAt" = CURRENT_TIMESTAMP
     WHERE "intentId" = $1 AND "state" <> 'created'
       AND ("lastCheckedAt" IS NULL OR "lastCheckedAt" < CURRENT_TIMESTAMP - INTERVAL '10 seconds') RETURNING *`, [intentId]);
  return rows.length === 1;
}

export async function loadPaytmIntent(db: PaytmDatabase, shop: string, id: string, requestKey: string) {
  const rows = await db.query<PaytmIntent>(
    `SELECT "id", "shop", "state", "currency", "orderPaise", "advancePercent", "payableNowPaise", "collectPaise"
     FROM "PartialCodIntent" WHERE "id" = $1 AND "shop" = $2 AND "requestKey" = $3`, [id, shop, requestKey]);
  if (rows.length !== 1) throw new Error("Unknown Paytm quote");
  paytmPaymentReference(rows[0]);
  return rows[0];
}

/** A durable single-writer claim is committed before any request can reach Paytm. */
export async function claimPaytmAttempt(db: PaytmDatabase, intent: PaytmIntent, account: Account) {
  const reference = paytmPaymentReference(intent);
  const priced = await db.query<{ accountingSnapshot: unknown }>(
    `SELECT "accountingSnapshot" FROM "PartialCodIntent" WHERE "id"=$1 AND "shop"=$2 AND "currency"=$3
       AND "orderPaise"=$4 AND "advancePercent"=$5 AND "payableNowPaise"=$6 AND "collectPaise"=$7
       AND "state"='quoted' AND "createdAt" > CURRENT_TIMESTAMP - INTERVAL '30 minutes'`,
    [intent.id, intent.shop, intent.currency, intent.orderPaise, intent.advancePercent, intent.payableNowPaise, intent.collectPaise]);
  if (priced.length !== 1) throw new Error("Payment quote changed, expired or already started");
  readCodAccounting(priced[0].accountingSnapshot, intent.orderPaise);
  await db.query<Attempt>(
    `INSERT INTO "PartialCodPaytmAttempt" ("intentId", "orderId", "environment", "merchantId", "payableNowPaise")
     SELECT "id", $2, $3, $4, $5 FROM "PartialCodIntent"
     WHERE "id" = $1 AND "shop" = $6 AND "state" = 'quoted' AND "payableNowPaise" = $5
       AND "createdAt" > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
     ON CONFLICT ("intentId") DO NOTHING RETURNING *`,
    [intent.id, reference.orderId, account.environment, account.mid, intent.payableNowPaise, intent.shop]);
  const claimToken = randomUUID();
  const rows = await db.query<Attempt>(
    `WITH claimed AS (
       UPDATE "PartialCodPaytmAttempt" a SET "state" = 'initiating', "claimToken" = $7, "updatedAt" = CURRENT_TIMESTAMP
       FROM "PartialCodIntent" i
       WHERE a."intentId" = $1 AND a."intentId" = i."id" AND i."shop" = $6
         AND i."state" = 'quoted' AND i."createdAt" > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
         AND a."state" = 'created' AND a."orderId" = $2 AND a."environment" = $3
         AND a."merchantId" = $4 AND a."payableNowPaise" = $5 AND i."payableNowPaise" = $5
       RETURNING a.*
     ), updated_intent AS (
       UPDATE "PartialCodIntent" SET "state" = 'awaiting_payment', "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" IN (SELECT "intentId" FROM claimed) RETURNING "id"
     ) SELECT c.* FROM claimed c JOIN updated_intent i ON i."id" = c."intentId"`,
    [intent.id, reference.orderId, account.environment, account.mid, intent.payableNowPaise, intent.shop, claimToken]);
  if (rows.length !== 1) throw new Error("Paytm payment already started, quote expired or account changed; reconcile status before retrying");
  return claimToken;
}

export async function beginPaytmPayment(db: PaytmDatabase, gateway: Gateway, intent: PaytmIntent, account: Account) {
  const claimToken = await claimPaytmAttempt(db, intent, account);
  try {
    const result = await gateway.initiate({ ...intent, state: "awaiting_payment" });
    if (result.orderId !== paytmPaymentReference(intent).orderId || result.mid !== account.mid ||
        result.environment !== account.environment) throw new Error("Paytm checkout account mismatch");
    const changed = await db.query<Attempt>(
      `UPDATE "PartialCodPaytmAttempt" SET "state" = 'ready', "updatedAt" = CURRENT_TIMESTAMP
       WHERE "intentId" = $1 AND "claimToken" = $2 AND "state" = 'initiating' RETURNING *`, [intent.id, claimToken]);
    // A status callback may already have recorded paid. Do not overwrite it or return another checkout.
    if (changed.length !== 1) throw new Error("Paytm payment changed while checkout was starting");
    return result;
  } catch {
    await db.query<Attempt>(
      `UPDATE "PartialCodPaytmAttempt" SET "state" = 'uncertain', "updatedAt" = CURRENT_TIMESTAMP
       WHERE "intentId" = $1 AND "claimToken" = $2 AND "state" = 'initiating' RETURNING *`, [intent.id, claimToken]);
    throw new Error("Paytm checkout could not be confirmed; reconcile this payment before retrying");
  }
}

/** Records gateway proof only; does not enqueue the old deposit-order pipeline. */
export async function recordPaytmProof(db: PaytmDatabase, intent: PaytmIntent, account: Account, proof: PaidProof) {
  const reference = paytmPaymentReference(intent);
  if (proof.orderId !== reference.orderId || proof.paidPaise !== intent.payableNowPaise || proof.currency !== "INR" ||
      proof.fingerprint !== `paytm:${account.environment}:${account.mid}:${proof.transactionId}`)
    throw new Error("Paytm proof does not match this quote");
  let rows: Attempt[];
  try {
    rows = await db.query<Attempt>(
      `UPDATE "PartialCodPaytmAttempt" a SET "state" = 'paid', "transactionId" = $7,
         "paymentFingerprint" = $8, "updatedAt" = CURRENT_TIMESTAMP
       FROM "PartialCodIntent" i WHERE a."intentId" = $1 AND a."intentId" = i."id" AND i."shop" = $6
         AND i."state" IN ('awaiting_payment', 'paid', 'cod_order_created')
         AND a."orderId" = $2 AND a."environment" = $3 AND a."merchantId" = $4 AND a."payableNowPaise" = $5
         AND i."payableNowPaise" = $5 AND a."state" IN ('initiating', 'ready', 'uncertain', 'failed', 'paid')
         AND (a."transactionId" IS NULL OR (a."transactionId" = $7 AND a."paymentFingerprint" = $8)) RETURNING a.*`,
      [intent.id, reference.orderId, account.environment, account.mid, intent.payableNowPaise, intent.shop,
        proof.transactionId, proof.fingerprint]);
  } catch { throw new Error("Paytm proof conflicts with an existing payment"); }
  if (rows.length !== 1) throw new Error("Paytm payment is closed or conflicts with recorded proof");
  return rows[0];
}

