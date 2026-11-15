import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import PaytmChecksum from "paytmchecksum";
const output = new URL("../.qa-cod-refund/", import.meta.url);
await mkdir(output, { recursive: true });
try {
  await build({ entryPoints: ["app/lib/partial-cod-refund.server.ts"], bundle: true, packages: "external",
    platform: "node", format: "esm", outfile: new URL("refund.mjs", output).pathname });
  const { codRefundReference, verifyCodRefundStatus } = await import(new URL("refund.mjs", output));
  const account = { mid: "TESTMERCHANT1234567890", merchantKey: "TESTONLYKEY12345", environment: "staging" };
  const intent = { id: "12345678-1234-1234-1234-123456789abc", shop: "test.myshopify.com", state: "paid",
    currency: "INR", orderPaise: 100000, advancePercent: 20, payableNowPaise: 28000, collectPaise: 80000 };
  const { createHash } = await import("node:crypto");
  const orderId = `CW${createHash("sha256").update(`${intent.shop}:${intent.id}`).digest("hex").slice(0,48)}`;
  const target = { intent, payment: { environment: "staging", merchantId: account.mid, orderId,
    transactionId: "ORIGINAL-TXN-1", payableNowPaise: 28000, paymentFingerprint: `paytm:staging:${account.mid}:ORIGINAL-TXN-1` } };
  const reference = codRefundReference(target, account);
  assert.equal(reference.refId.length, 50); assert.equal(reference.refundPaise, 28000);
  assert.deepEqual(codRefundReference(target, account), reference);
  for (const payment of [{ ...target.payment, transactionId: "OTHER" }, { ...target.payment, merchantId: "OTHER" },
    { ...target.payment, payableNowPaise: 108000 }, { ...target.payment, environment: "production" },
    { ...target.payment, orderId: "OTHER" }]) assert.throws(() => codRefundReference({ ...target, payment }, account));
  const signed = async body => ({ body, head: { signature: await PaytmChecksum.generateSignature(JSON.stringify(body), account.merchantKey) } });
  const original = { mid: account.mid, orderId, refId: reference.refId, txnId: target.payment.transactionId,
    refundId: "REFUND-1", txnAmount: "280.00", refundAmount: "280.00", totalRefundAmount: "280.00",
    resultInfo: { resultStatus: "TXN_SUCCESS", resultCode: "10" },
    refundDetailInfoList: [{ maskedBankAccountNumber: "PRIVATE-NOT-RETURNED" }] };
  const proof = verifyCodRefundStatus(await signed(original), target, account);
  assert.equal(proof.status, "refunded"); assert.equal(proof.refundedPaise, 28000);
  assert.equal(JSON.stringify(proof).includes("PRIVATE"), false);
  // Independently sign each mismatched payload so identity/amount tests cannot pass only because of a bad signature.
  for (const patch of [{ mid: "OTHER" }, { orderId: "OTHER" }, { txnId: "OTHER" }, { refId: "OTHER" },
    { refundAmount: "1080.00" }, { refundAmount: "200.00" }, { txnAmount: "1080.00" },
    { totalRefundAmount: "560.00" }, { refundId: "" }, { totalRefundAmount: undefined },
    { refundAmount: "2.8e2" }, { resultInfo: { resultStatus: "TXN_SUCCESS", resultCode: "601" } }]) {
    const raw = await signed({ ...original, ...patch });
    assert.throws(() => verifyCodRefundStatus(raw, target, account));
  }
  const valid = await signed(original);
  assert.throws(() => verifyCodRefundStatus({ ...valid, head: {} }, target, account));
  assert.throws(() => verifyCodRefundStatus({ ...valid, body: { ...original, refundAmount: "1.00" } }, target, account));
  for (const [resultStatus, resultCode, expected] of [["PENDING", "601", "pending"], ["TXN_FAILURE", "602", "failed"],
    ["NO_RECORD_FOUND", "631", "not_found"], ["TXN_FAILURE", "631", "not_found"]]) {
    const result = verifyCodRefundStatus(await signed({ ...original, resultInfo: { resultStatus, resultCode } }), target, account);
    assert.equal(result.status, expected); assert.equal("refundedPaise" in result, false);
  }
  console.log("Refund reference/account binding, real SDK signatures, exact full-advance amounts, pending/failure/not-found states, mismatch/tampering rejection and provider-PII exclusion passed. No refund request was sent.");
} finally { await rm(output, { recursive: true, force: true }); }
