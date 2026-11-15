import { createHash } from "node:crypto";
import PaytmChecksum from "paytmchecksum";
import { paytmPaymentReference, type PaytmIntent } from "./partial-cod-paytm.server";

type RefundAccount = { mid: string; merchantKey: string; environment: "staging" | "production" };
export type CodRefundTarget = {
  intent: PaytmIntent;
  payment: { environment: "staging" | "production"; merchantId: string; transactionId: string;
    orderId: string; payableNowPaise: number; paymentFingerprint: string };
};
function money(value: unknown) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(value)) throw new Error("Invalid refund amount");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid refund response");
  return value as Record<string, unknown>;
}

/** Full advance only, including the COD fee. This constructs no provider request and moves no money. */
export function codRefundReference(target: CodRefundTarget, account: RefundAccount) {
  const reference = paytmPaymentReference(target.intent), p = target.payment;
  if (!["staging", "production"].includes(account.environment) || !/^[A-Za-z0-9]{10,40}$/.test(account.mid) ||
      Buffer.byteLength(account.merchantKey, "utf8") !== 16 || /[\r\n]/.test(account.merchantKey) ||
      p.environment !== account.environment || p.merchantId !== account.mid || p.orderId !== reference.orderId ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(p.transactionId) || p.payableNowPaise !== target.intent.payableNowPaise ||
      p.paymentFingerprint !== `paytm:${account.environment}:${account.mid}:${p.transactionId}`)
    throw new Error("Refund does not match the original verified advance");
  const digest = createHash("sha256").update(JSON.stringify([
    "full-advance-refund-v1", target.intent.shop, target.intent.id, account.environment, account.mid, p.transactionId,
  ])).digest("hex");
  return { orderId: reference.orderId, refId: `CWR${digest.slice(0, 47)}`, transactionId: p.transactionId,
    refundPaise: target.intent.payableNowPaise };
}

/** A signed status response supplies proof only after all original payment identifiers and amounts agree. */
export function verifyCodRefundStatus(raw: unknown, target: CodRefundTarget, account: RefundAccount) {
  const expected = codRefundReference(target, account), response = object(raw), body = object(response.body), head = object(response.head);
  let valid = false;
  if (typeof head.signature === "string" && head.signature.length <= 1024) {
    try { valid = PaytmChecksum.verifySignature(JSON.stringify(body), account.merchantKey, head.signature); }
    catch { /* Fail closed without logging the response. */ }
  }
  if (!valid) throw new Error("Refund response signature is invalid");
  const info = object(body.resultInfo), status = info.resultStatus;
  // Missing records never authorize another refund submission, and never prove money was returned.
  if (status === "NO_RECORD_FOUND" || (status === "TXN_FAILURE" && info.resultCode === "631")) {
    if ((body.mid !== undefined && body.mid !== account.mid) ||
        (body.orderId !== undefined && body.orderId !== expected.orderId) ||
        (body.refId !== undefined && body.refId !== expected.refId)) throw new Error("Refund record belongs to another request");
    return { status: "not_found" as const, refId: expected.refId };
  }
  if (body.mid !== account.mid || body.orderId !== expected.orderId || body.refId !== expected.refId ||
      body.txnId !== expected.transactionId) throw new Error("Refund response belongs to another payment");
  if (status === "PENDING") return { status: "pending" as const, refId: expected.refId };
  if (status === "TXN_FAILURE") return { status: "failed" as const, refId: expected.refId };
  if (status !== "TXN_SUCCESS" || info.resultCode !== "10" ||
      typeof body.refundId !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(body.refundId) ||
      money(body.txnAmount) !== expected.refundPaise || money(body.refundAmount) !== expected.refundPaise ||
      money(body.totalRefundAmount) !== expected.refundPaise)
    throw new Error("Refund success does not acknowledge the exact original advance");
  // No destination/card/phone/bank data from the provider is returned or persisted.
  return { status: "refunded" as const, refId: expected.refId, refundId: body.refundId, refundedPaise: expected.refundPaise };
}
