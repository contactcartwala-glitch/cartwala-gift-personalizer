import assert from "node:assert/strict";
import { build } from "esbuild";
const compile = async path => {
  const result = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
};
const { calculatePartialCod } = await compile("app/lib/partial-cod.ts");
const { buildNimbusCodOrder, verifyNimbusCodOrder } = await compile("app/lib/partial-cod-nimbus.ts");
const { createNimbusClient } = await compile("app/lib/partial-cod-nimbus.server.ts");
const intent = { id: "intent-1", shop: "test.myshopify.com", currency: "INR", advancePercent: 20,
  amounts: calculatePartialCod(100000), lines: [], depositOrderId: "deposit-1", state: "cod_order_created",
  paidTransactionId: "payment-1", codOrderId: "order-1" };
const fulfillment = { warehouseId: "WH-1", shopifySyncExcluded: true,
  address: { firstName: "Test", lastName: "Buyer", address1: "Test street", address2: "", city: "Test City",
    provinceCode: "TS", zip: "506001", phone: "+919876543210", countryCode: "IN" },
  parcel: { weightKg: .5, lengthCm: 30, widthCm: 20, heightCm: 5 },
  items: [{ name: "Test frame", sku: "TEST", quantity: 1, unitPricePaise: 100000 }] };
const body = buildNimbusCodOrder(intent, fulfillment);
assert.equal(body.order_collectable_amount, 800);
assert.equal(body.package.weight, .5);
assert.equal(body.shipping_address.phone, 9876543210);
assert.equal(body.items[0].price, 1000);
assert.equal(buildNimbusCodOrder({ ...intent, advancePercent: 30, amounts: calculatePartialCod(100000, 30) }, fulfillment).order_collectable_amount, 700);
assert.throws(() => buildNimbusCodOrder(intent, { ...fulfillment, shopifySyncExcluded: false }));
assert.throws(() => buildNimbusCodOrder({ ...intent, state: "awaiting_payment" }, fulfillment));
assert.throws(() => buildNimbusCodOrder(intent, { ...fulfillment, items: [{ ...fulfillment.items[0], unitPricePaise: 108000 }] }));
assert.throws(() => buildNimbusCodOrder(intent, { ...fulfillment, parcel: { ...fulfillment.parcel, weightKg: 0 } }));
for (const raw of ["800.00", 800]) assert.equal(verifyNimbusCodOrder(body, { ...body, order_collectable_amount: raw }).collectPaise, 80000);
for (const raw of [1000, 1080, 280, "800e0", "", null]) assert.throws(() => verifyNimbusCodOrder(body, { ...body, order_collectable_amount: raw }));
assert.throws(() => verifyNimbusCodOrder(body, { ...body, payment_mode: "prepaid" }));
const calls = [];
const client = createNimbusClient({ apiKey: "npk_test", apiSecret: "test-secret" }, async (url, init) => {
  calls.push({ url, init });
  return new Response(JSON.stringify({ success: true, data: init.method === "POST" ? { order_id: "ORD-1" } : body }), { status: 200 });
});
assert.deepEqual(await client.createUnbookedOrder(body), { orderId: "ORD-1" });
assert.equal((await client.readAndVerify("ORD-1", body)).collectPaise, 80000);
assert.equal(calls.length, 2);
assert.equal(calls[0].init.redirect, "error");
assert.equal(calls[0].init.headers["x-api-secret"], "test-secret");
assert.equal(JSON.parse(calls[0].init.body).order_collectable_amount, 800);
let failedCalls = 0;
const rateLimited = createNimbusClient({ apiKey: "npk_test", apiSecret: "test-secret" }, async () => {
  failedCalls++; return new Response("private provider message", { status: 429, headers: { "Retry-After": "30" } });
});
await assert.rejects(rateLimited.createUnbookedOrder(body), e => e.status === 429 && e.retryAfter === 30 && !e.message.includes("private"));
assert.equal(failedCalls, 1);
console.log("NimbusPost balance mapping, unit conversion, dispatch gates, acknowledgement and no blind POST retries passed.");
