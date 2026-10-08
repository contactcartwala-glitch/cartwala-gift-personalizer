import assert from "node:assert/strict";
import { calculatePartialCod, acceptDeposit, buildDepositLine, buildCodShipment } from "../app/lib/partial-cod.ts";

const amounts = calculatePartialCod(100000);
assert.deepEqual(amounts, {
  orderPaise: 100000, advancePaise: 20000, feePaise: 8000,
  payableNowPaise: 28000, collectOnDeliveryPaise: 80000, totalPaise: 108000,
});
for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
  assert.throws(() => calculatePartialCod(value));
}
for (const value of [1, 2, 3, 4, 5, 24999, 99999, 100001, 100_000_000]) {
  const quote = calculatePartialCod(value);
  assert.equal(quote.payableNowPaise + quote.collectOnDeliveryPaise, quote.totalPaise);
  assert.equal(quote.advancePaise + quote.collectOnDeliveryPaise, value);
}
const intent = {
  id: "intent-1", shop: "test.myshopify.com", currency: "INR", amounts,
  depositOrderId: "deposit-1", state: "awaiting_payment",
  lines: [{ variantId: "variant-1", quantity: 2,
    properties: [{ name: "Photo", value: "https://example.test/photo.png" }, { name: "Text", value: "Happy birthday" }] }],
};
const proof = {
  shop: intent.shop, orderId: intent.depositOrderId, intentId: intent.id,
  transactionId: "transaction-1", currency: "INR", paidPaise: 28000, status: "paid",
};
assert.equal(buildDepositLine(intent).requiresShipping, false);
assert.equal(buildDepositLine(intent).amountPaise, 28000);
for (const change of [
  { shop: "another.shop" }, { orderId: "another-order" }, { intentId: "another-intent" },
  { currency: "USD" }, { paidPaise: 27999 }, { paidPaise: 28001 },
  { status: "pending" }, { status: "failed" }, { status: "refunded" }, { transactionId: "" },
]) assert.throws(() => acceptDeposit(intent, { ...proof, ...change }));
const paid = acceptDeposit(intent, proof);
assert.equal(paid.state, "paid");
assert.equal(acceptDeposit(paid, proof), paid);
assert.throws(() => acceptDeposit(paid, { ...proof, transactionId: "different" }));
for (const state of ["cancelled", "refunded"]) assert.throws(() => acceptDeposit({ ...intent, state }, proof));
const capabilities = { excludesDepositOrders: true, supportsExplicitCodAmount: true };
assert.throws(() => buildCodShipment(intent, capabilities));
assert.throws(() => buildCodShipment(paid, capabilities));
const linked = { ...paid, state: "cod_order_created", codOrderId: "cod-order-1" };
for (const flags of [{ ...capabilities, excludesDepositOrders: false }, { ...capabilities, supportsExplicitCodAmount: false }]) {
  assert.throws(() => buildCodShipment(linked, flags));
}
const shipment = buildCodShipment(linked, capabilities);
assert.equal(shipment.paymentType, "COD");
assert.equal(shipment.collectPaise, 80000);
assert.equal(shipment.prepaidPaise, 28000);
assert.equal(shipment.orderId, "cod-order-1");
assert.deepEqual(shipment.lines, intent.lines);
assert.notEqual(shipment.lines[0].properties, intent.lines[0].properties);
assert.equal(buildCodShipment(linked, capabilities).idempotencyKey, shipment.idempotencyKey);
assert.equal(buildCodShipment({ ...linked, amounts: Object.fromEntries(Object.entries(amounts).reverse()) }, capabilities).collectPaise, 80000);
assert.throws(() => buildCodShipment({ ...linked, amounts: { ...amounts, collectOnDeliveryPaise: 100000 } }, capabilities));
console.log("Partial COD policy, payment matching, shipping gating and artwork preservation checks passed.");
