import assert from "node:assert/strict";
import { build } from "esbuild";
const compile = async path => {
  const result = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
};
const { calculatePartialCod, buildCodShipment } = await compile("app/lib/partial-cod.ts");
const { verifyDepositSnapshot } = await compile("app/lib/partial-cod-payment.ts");
const { validateCodSettings, requireCodActivation, canEnableAdvanceCod } = await compile("app/lib/partial-cod-settings.ts");
assert.equal(canEnableAdvanceCod(), false);
assert.throws(() => requireCodActivation({ enabled: true, advancePercent: 20, revision: 1 }));
requireCodActivation({ enabled: false, advancePercent: 20, revision: 1 });
for (const percent of [10, 20, 30, 50]) {
  assert.equal(validateCodSettings({ enabled: false, advancePercent: percent, revision: 0 }).advancePercent, percent);
  for (const amount of [1, 2, 5, 101, 99999, 100000, 100000000]) {
    const quote = calculatePartialCod(amount, percent);
    assert.equal(quote.advancePaise, Math.round(amount * percent / 100));
    assert.equal(quote.payableNowPaise + quote.collectOnDeliveryPaise, amount + 8000);
  }
}
for (const percent of [0, 9, 51, 100, 20.5, NaN, "20", null]) {
  assert.throws(() => calculatePartialCod(100000, percent));
  assert.throws(() => validateCodSettings({ enabled: false, advancePercent: percent, revision: 0 }));
}
assert.throws(() => validateCodSettings({ enabled: "false", advancePercent: 20, revision: 0 }));
assert.throws(() => validateCodSettings({ enabled: false, advancePercent: 20, revision: -1 }));
const frozen = calculatePartialCod(100000, 30);
const intent = {
  id: "frozen", shop: "test.myshopify.com", currency: "INR", advancePercent: 30,
  amounts: frozen, lines: [], depositOrderId: "gid://shopify/Order/1",
  state: "cod_order_created", paidTransactionId: "capture-1", codOrderId: "gid://shopify/Order/2",
};
assert.equal(buildCodShipment(intent, { excludesDepositOrders: true, supportsExplicitCodAmount: true }).collectPaise, 70000);
assert.throws(() => buildCodShipment({ ...intent, advancePercent: 20 }, { excludesDepositOrders: true, supportsExplicitCodAmount: true }));
const money = amount => ({ shopMoney: { amount, currencyCode: "INR" } });
const order = {
  id: intent.depositOrderId, cancelledAt: null, displayFinancialStatus: "PAID", test: false,
  customAttributes: [{ key: "_cartwala_order_kind", value: "partial_cod_deposit" }, { key: "_cartwala_cod_intent", value: "frozen" }],
  totalPriceSet: money("380.00"), totalReceivedSet: money("380.00"), totalRefundedSet: money("0.00"),
  transactions: [{ id: "capture-1", kind: "SALE", status: "SUCCESS", test: false, amountSet: money("380.00") }],
};
assert.equal(verifyDepositSnapshot({ intentId: "frozen", orderPaise: 100000, advancePercent: 30, linkedDraftOrderId: order.id }, order).orderId, order.id);
assert.throws(() => verifyDepositSnapshot({ intentId: "frozen", orderPaise: 100000, advancePercent: 20, linkedDraftOrderId: order.id }, order));
console.log("Advance COD settings, percentage boundaries, frozen payment and courier balances passed.");
