import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
const output = new URL("../.qa-native-cod-preview/", import.meta.url);
await mkdir(output, { recursive: true });
try {
  await build({ entryPoints: ["app/lib/native-cod-preview.ts"], bundle: true, packages: "external",
    platform: "node", format: "esm", outfile: new URL("preview.mjs", output).pathname });
  const { buildNativeCodPreview } = await import(new URL("preview.mjs", output));
  for (const [percent, fee, now, balance] of [
    [20, 0, 8000, 32000], [20, 5000, 13000, 32000], [10, 8000, 12000, 36000],
    [30, 4000, 16000, 28000], [50, 123, 20123, 20000],
  ]) {
    const result = buildNativeCodPreview(40000, percent, fee);
    assert.equal(result.amounts.payableNowPaise, now);
    assert.equal(result.amounts.collectOnDeliveryPaise, balance);
    assert.equal(result.input.lineItems.reduce((n, x) => n + Math.round(Number(x.originalUnitPriceWithCurrency.amount) * 100), 0), now);
    assert.equal(result.input.lineItems.length, fee ? 2 : 1);
    assert.equal(result.input.acceptAutomaticDiscounts, false);
    assert.equal(result.input.allowDiscountCodesInCheckout, false);
    const text = JSON.stringify(result.input);
    assert.doesNotMatch(text, /appliedDiscount|discountCodes|merchantKey|txnToken|gateway|Paytm|Razorpay|PhonePe/);
    assert(result.input.lineItems.every(x => x.quantity === 1 && !x.requiresShipping && !x.taxable && !x.variantId));
    assert.match(result.input.note, /Do not pay/);
    assert.equal(result.amounts.payableNowPaise + balance, 40000 + fee);
  }
  for (const args of [[0, 20, 5000], [40000, 9, 5000], [40000, 51, 5000], [40000, 20, -1], [40000, 20, 1.2]])
    assert.throws(() => buildNativeCodPreview(...args));
  console.log("Native advance preview: exact amount and balance, zero/configurable fee, no discount or gateway credentials, and no products/contacts/stock passed. No payment/order API was called.");
} finally { await rm(output, { recursive: true, force: true }); }
