import { beginPaytmPayment, claimPaytmStatusCheck, recordPaytmProof, type PaytmDatabase } from "./partial-cod-paytm-store.server";
import { paytmPaymentReference, type PaytmIntent, type createPaytmClient } from "./partial-cod-paytm.server";

type Gateway = ReturnType<typeof createPaytmClient>;
type Account = { mid: string; environment: "staging" | "production" };
type CheckoutRow = PaytmIntent & { attemptState: string | null; codOrderId: string | null };
export type CodCheckoutState = "not_started" | "payment_pending" | "payment_failed" | "paid_order_pending" | "order_confirmed" | "needs_review";

export async function readCodCheckout(db: PaytmDatabase, shop: string, id: string, account: Account) {
  const rows = await db.query<CheckoutRow>(`SELECT i."id",i."shop",i."state",i."currency",i."orderPaise",i."advancePercent",
      i."codFeePaise",i."payableNowPaise",i."collectPaise",i."codOrderId",a."state" AS "attemptState"
    FROM "PartialCodIntent" i LEFT JOIN "PartialCodPaytmAttempt" a ON a."intentId"=i."id"
    WHERE i."id"=$1 AND i."shop"=$2 AND (a."intentId" IS NULL OR (a."merchantId"=$3 AND a."environment"=$4))`,
  [id, shop, account.mid, account.environment]);
  if (rows.length !== 1) throw new Error("Unknown checkout");
  paytmPaymentReference(rows[0]);
  return rows[0];
}
export async function startCodCheckout(db: PaytmDatabase, gateway: Gateway, shop: string, id: string, account: Account) {
  const intent = await readCodCheckout(db, shop, id, account);
  // The durable claim below also checks quote age, price snapshot and state atomically.
  if (intent.state !== "quoted" || intent.attemptState) throw new Error("Payment already started; check its status");
  return beginPaytmPayment(db, gateway, intent, account);
}

/** Callback, customer recovery and merchant recovery share this path. No browser status is trusted. */
export async function progressCodCheckout(db: PaytmDatabase, gateway: Gateway, shop: string, id: string,
  account: Account, dispatch: (id: string) => Promise<unknown>) {
  const intent = await readCodCheckout(db, shop, id, account);
  const result = (state: CodCheckoutState) => ({ state, payableNowPaise: intent.payableNowPaise, collectPaise: intent.collectPaise });
  if (!["quoted", "awaiting_payment", "paid", "cod_order_created"].includes(intent.state)) return result("needs_review");
  if (intent.state === "cod_order_created" && intent.codOrderId) return result("order_confirmed");
  if (!intent.attemptState) return result("not_started");
  if (!await claimPaytmStatusCheck(db, id))
    return result(intent.attemptState === "paid" ? "paid_order_pending" : "payment_pending");
  // Errors are deliberately returned as uncertain by the route. Never re-initiate a payment here.
  const proof = await gateway.verify(intent);
  if (proof.status === "pending") return result("payment_pending");
  if (proof.status === "failed") {
    await db.query(`UPDATE "PartialCodPaytmAttempt" SET "state"='failed',"updatedAt"=CURRENT_TIMESTAMP
      WHERE "intentId"=$1 AND "state" IN ('initiating','ready','uncertain') AND "transactionId" IS NULL
      RETURNING "intentId"`, [id]);
    return result("payment_failed");
  }
  await recordPaytmProof(db, intent, account, proof);
  try { await dispatch(id); }
  catch { return result("paid_order_pending"); }
  const updated = await readCodCheckout(db, shop, id, account);
  return result(updated.state === "cod_order_created" && updated.codOrderId ? "order_confirmed" : "paid_order_pending");
}
