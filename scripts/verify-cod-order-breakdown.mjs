import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
const output = new URL("../.qa-cod-breakdown/", import.meta.url);
await mkdir(output, { recursive: true });
try {
  await build({ entryPoints: ["app/lib/cod-order-breakdown.ts"], bundle: true, platform: "node", format: "esm",
    outfile: new URL("breakdown.mjs", output).pathname });
  const { codOrderBreakdown } = await import(new URL("breakdown.mjs", output));
  const example = codOrderBreakdown(40000, 20, 5000);
  assert.deepEqual(Object.fromEntries(example.attributes.map(x => [x.key, x.value])), {
    "Goods value": "₹400.00", "Advance COD": "₹80.00 (20%)", "Shipping / COD charge": "₹50.00",
    "Total order value": "₹450.00", "Online amount received": "₹130.00", "Remaining COD balance": "₹320.00",
  });
  for (const [percent, fee, now, balance, total] of [
    [10, 0, 4000, 36000, 40000], [30, 4000, 16000, 28000, 44000], [50, 8000, 28000, 20000, 48000],
  ]) {
    const result = codOrderBreakdown(40000, percent, fee);
    assert.equal(result.amounts.payableNowPaise, now);
    assert.equal(result.amounts.collectOnDeliveryPaise, balance);
    assert.equal(result.amounts.totalPaise, total);
    assert.equal(now + balance, total);
    assert.equal(result.attributes.length, new Set(result.attributes.map(x => x.key)).size);
    assert.equal("financialStatus" in result, false);
    assert.equal("gateway" in result, false);
  }
  for (const args of [[0,20,5000], [40000,51,5000], [40000,20,-1]])
    assert.throws(() => codOrderBreakdown(...args));
  console.log("Shopify order breakdown: goods ₹400, advance ₹80, charge ₹50, total ₹450, received ₹130 and COD ₹320; configurable examples and no payment-status mutation passed.");
} finally { await rm(output, { recursive: true, force: true }); }
