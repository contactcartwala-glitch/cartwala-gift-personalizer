import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import PaytmChecksum from "paytmchecksum";
const output = new URL("../.qa-paytm/", import.meta.url);
await mkdir(output, { recursive: true });
try {
  await build({ entryPoints: ["app/lib/partial-cod-paytm.server.ts"], bundle: true,
    packages: "external", platform: "node", format: "esm", outfile: new URL("adapter.mjs", output).pathname });
  const { createPaytmClient, paytmPaymentReference } = await import(new URL("adapter.mjs", output));
  const key = "TESTONLYKEY12345";
  const config = { mid: "TESTMERCHANT1234567890", merchantKey: key,
    environment: "staging", appOrigin: "https://example.test" };
  const intent = { id: "12345678-1234-1234-1234-123456789abc", shop: "test.myshopify.com",
    state: "awaiting_payment", currency: "INR", orderPaise: 100000, advancePercent: 20,
    payableNowPaise: 28000, collectPaise: 80000 };
  const reference = paytmPaymentReference(intent);
  assert.equal(reference.orderId.length, 50);
  assert.equal(reference.amount, "280.00");
  assert.deepEqual(paytmPaymentReference({ ...intent }), reference);
  assert.notEqual(paytmPaymentReference({ ...intent, shop: "other.myshopify.com" }).orderId, reference.orderId);
  assert.equal(paytmPaymentReference({ ...intent, advancePercent: 30, payableNowPaise: 38000, collectPaise: 70000 }).amount, "380.00");
  assert.equal(paytmPaymentReference({ ...intent, orderPaise: 100003, payableNowPaise: 28001, collectPaise: 80002 }).amount, "280.01");
  for (const change of [{ payableNowPaise: 100 }, { collectPaise: 100 }, { currency: "USD" },
    { advancePercent: 9 }, { advancePercent: 51 }, { orderPaise: 0 }, { id: "untrusted-id" },
    { shop: "example.com" }, { orderPaise: 1.5 }]) assert.throws(() => paytmPaymentReference({ ...intent, ...change }));
  const signed = async body => new Response(JSON.stringify({ body,
    head: { signature: await PaytmChecksum.generateSignature(JSON.stringify(body), key) } }));
  const success = { resultInfo: { resultStatus: "TXN_SUCCESS", resultCode: "01" },
    mid: config.mid, orderId: reference.orderId, txnId: "TXN-TEST-1", txnAmount: "280.00", refundAmt: "0.00" };
  const calls = [];
  const client = createPaytmClient(config, async (url, init) => {
    calls.push({ url, init });
    const input = JSON.parse(init.body);
    assert.equal(PaytmChecksum.verifySignature(JSON.stringify(input.body), key, input.head.signature), true);
    return signed(url.includes("initiateTransaction") ? {
      resultInfo: { resultStatus: "S", resultCode: "0000" }, txnToken: "TEST_TOKEN_1234567890",
    } : success);
  });
  const checkout = await client.initiate(intent);
  assert.equal(checkout.amount, "280.00");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith("https://securestage.paytmpayments.com/"));
  assert.equal(calls[0].init.redirect, "error");
  const request = JSON.parse(calls[0].init.body).body;
  assert.equal(request.txnAmount.value, "280.00");
  assert.equal(request.websiteName, "WEBSTAGING");
  assert.equal(request.callbackUrl, "https://example.test/payments/paytm/callback");
  assert.equal(request.userInfo.custId, reference.customerId);
  assert.equal(JSON.stringify(request).includes(key), false);
  const proof = await client.verify(intent);
  assert.equal(proof.status, "paid");
  assert.equal(proof.paidPaise, 28000);
  assert.equal(proof.transactionId, success.txnId);
  assert.equal(calls.length, 2);
  for (const status of ["PENDING", "NO_RECORD_FOUND", "TXN_FAILURE"]) {
    const result = await createPaytmClient(config, async () => signed({ resultInfo: { resultStatus: status } })).verify(intent);
    assert.equal(result.status, status === "TXN_FAILURE" ? "failed" : "pending");
  }
  for (const change of [{ mid: "OTHER" }, { orderId: "OTHER" }, { txnAmount: "280e0" },
    { txnAmount: "280.001" }, { txnAmount: "280.01" }, { txnAmount: "0280.00" },
    { txnAmount: 280 }, { refundAmt: "1.00" }, { refundAmt: undefined }, { txnId: "" },
    { txnType: "PREAUTH" }, { resultInfo: { resultStatus: "TXN_SUCCESS", resultCode: "227" } }]) {
    await assert.rejects(createPaytmClient(config, async () => signed({ ...success, ...change })).verify(intent));
  }
  const corrupt = await signed(success);
  const corruptBody = await corrupt.json();
  corruptBody.body.txnAmount = "1.00";
  await assert.rejects(createPaytmClient(config, async () => new Response(JSON.stringify(corruptBody))).verify(intent), e => e.kind === "signature");
  await assert.rejects(createPaytmClient(config, async () => new Response(JSON.stringify({ body: success, head: {} }))).verify(intent), e => e.kind === "signature");
  for (const body of ["not-json", "null", "{}", "x".repeat(128001)])
    await assert.rejects(createPaytmClient(config, async () => new Response(body)).verify(intent));
  let failures = 0;
  await assert.rejects(createPaytmClient(config, async () => {
    failures++; return new Response("private provider body", { status: 429 });
  }).initiate(intent), e => e.kind === "http" && e.status === 429 && !e.message.includes("private"));
  assert.equal(failures, 1);
  await assert.rejects(createPaytmClient(config, async () => { throw new Error(key); }).initiate(intent), e => e.kind === "transport" && !e.message.includes(key));
  let liveCalls = 0;
  const live = createPaytmClient({ ...config, environment: "production" }, async () => { liveCalls++; return signed(success); });
  await assert.rejects(live.initiate(intent));
  assert.equal(liveCalls, 0);
  for (const state of ["paid", "cancelled", "refunded", "cod_order_created"])
    await assert.rejects(client.initiate({ ...intent, state }));
  for (const state of ["cancelled", "refunded"]) await assert.rejects(client.verify({ ...intent, state }));
  for (const appOrigin of ["http://example.test", "https://x:y@example.test", "https://example.test/path", "https://example.test?foo=bar"])
    assert.throws(() => createPaytmClient({ ...config, appOrigin }));
  assert.throws(() => createPaytmClient({ ...config, merchantKey: "invalid" }));
  console.log("Paytm SDK signatures, frozen amounts, status verification, tamper/refund guards, stable references, live gate and no blind retries passed.");
} finally { await rm(output, { recursive: true, force: true }); }
