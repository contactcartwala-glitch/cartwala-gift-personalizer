import assert from "node:assert/strict";
import { build } from "esbuild";
const compiled = await build({ entryPoints: ["app/lib/partial-cod-quote.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { buildCodQuoteInput, verifyCodQuote } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const request = {
  lines: [{ variantId: "gid://shopify/ProductVariant/123", quantity: 2,
    properties: [{ name: "_print_url", value: "https://example.com/artwork.png" }], price: "0.01" }],
  address: { firstName: "Test", address1: "Test street", city: "Warangal", provinceCode: "TS",
    zip: "506001", phone: "+919999999999", countryCode: "IN" },
  discountCodes: ["TEST"], total: "0.01", taxExempt: true,
};
const prepared = buildCodQuoteInput(request);
assert.equal(prepared.input.lineItems[0].originalUnitPrice, undefined);
assert.equal(prepared.input.taxExempt, undefined);
assert.equal(prepared.input.lineItems[0].customAttributes[0].value, request.lines[0].properties[0].value);
assert.equal(prepared.input.shippingLine.priceWithCurrency.amount, "0.00");
assert.deepEqual(prepared.input.discountCodes, ["TEST"]);
for (const mutate of [
  x => { x.lines[0].quantity = -1; }, x => { x.lines[0].quantity = 1.5; },
  x => { x.lines[0].variantId = "gid://shopify/Product/123"; },
  x => { x.address.countryCode = "US"; }, x => { x.address.zip = "000000"; },
  x => { x.address.phone = "9999999999"; }, x => { x.address.address1 = ""; },
  x => { x.lines[0].properties.push({ name: "_cartwala_cod_intent", value: "forged" }); },
  x => { x.lines[0].properties.push(x.lines[0].properties[0]); },
]) { const invalid = structuredClone(request); mutate(invalid); assert.throws(() => buildCodQuoteInput(invalid)); }
const money = amount => ({ shopMoney: { amount, currencyCode: "INR" } });
const calculated = { currencyCode: "INR", presentmentCurrencyCode: "INR",
  totalPriceSet: money("1000.00"), totalShippingPriceSet: money("0.00") };
assert.equal(verifyCodQuote(calculated).payableNowPaise, 28000);
assert.equal(verifyCodQuote(calculated).collectOnDeliveryPaise, 80000);
assert.throws(() => verifyCodQuote({ ...calculated, totalShippingPriceSet: money("80.00") }));
assert.throws(() => verifyCodQuote({ ...calculated, presentmentCurrencyCode: "USD" }));
assert.throws(() => verifyCodQuote({ ...calculated, totalPriceSet: money("0.00") }));
console.log("Partial COD quote validation passed: trusted pricing input, artwork preservation, address and currency checks.");
