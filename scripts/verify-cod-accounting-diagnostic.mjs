import assert from "node:assert/strict";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, rm } from "node:fs/promises";
const output = new URL("../.qa-cod-diagnostic/", import.meta.url);
await mkdir(output, { recursive: true });
const money = value => ({ shopMoney: { amount: value, currencyCode: "INR" } });
async function scenario(mode) {
  const pg = new PGlite();
  try {
    await pg.exec(await readFile("prisma/migrations/20261105113000_cod_accounting_diagnostic/migration.sql", "utf8"));
    const db = { query: async (sql, params) => (await pg.query(sql, params)).rows };
    const { runCodDiagnostic, codDiagnosticPayload, COD_DIAGNOSTIC_SHOP } = await import(new URL("diagnostic.mjs", output));
    const shop = COD_DIAGNOSTIC_SHOP, payload = codDiagnosticPayload(shop);
    for (const field of ["shippingAddress", "billingAddress", "customer", "email", "phone", "financialStatus", "fulfillment"])
      assert.equal(field in payload.order, false);
    assert.equal(payload.order.test, true);
    assert.equal(payload.options.sendReceipt, false);
    assert.equal(payload.options.sendFulfillmentReceipt, false);
    assert.ok(payload.order.lineItems.every(line => !line.variantId && line.requiresShipping === false));
    let mutations = 0, created = false;
    const observedOrder = () => ({ id: "gid://shopify/Order/123", test: true, cancelledAt: null,
      sourceIdentifier: payload.order.sourceIdentifier, tags: payload.order.tags, displayFinancialStatus: "PARTIALLY_PAID",
      totalPriceSet: money("1080.00"), totalReceivedSet: money("280.00"), totalOutstandingSet: money(mode === "mismatch" ? "1080.00" : "800.00"),
      totalRefundedSet: money("0.00"), totalTaxSet: money("0.00"), totalShippingPriceSet: money("0.00"),
      transactions: [{ test: true, kind: "SALE", status: "SUCCESS", gateway: "Cartwala Paytm", amountSet: money("280.00") }],
      lineItems: { nodes: payload.order.lineItems.map(line => ({ title: line.title, quantity: 1, requiresShipping: false,
        variant: null, originalUnitPriceSet: line.priceSet })) } });
    const admin = { graphql: async (query, options) => {
      assert.equal(options.tries, 1); assert.ok(options.signal);
      if (query.includes("mutation CreateCodAccountingTest")) {
        mutations++; assert.deepEqual(options.variables, payload);
        if (mode === "reject") return Response.json({ data: { orderCreate: { order: null, userErrors: [{ field: ["lineItems"], message: "private upstream error" }] } } });
        created = true;
        if (mode === "lost") throw new Error("private network failure");
        return Response.json({ data: { orderCreate: { order: { id: "gid://shopify/Order/123" }, userErrors: [] } } });
      }
      if (query.includes("query FindCodAccountingTest"))
        return Response.json({ data: { orders: { nodes: created ? [{ id: "gid://shopify/Order/123" }] : [] } } });
      assert.ok(query.includes("query ReadCodAccountingTest"));
      return Response.json({ data: { order: observedOrder() } });
    } };
    await assert.rejects(runCodDiagnostic(db, admin, "other.myshopify.com")); assert.equal(mutations, 0);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => runCodDiagnostic(db, admin, shop)));
    assert.equal(mutations, 1);
    if (mode === "reject") {
      assert.equal(results.some(r => r.status === "fulfilled"), false);
      await assert.rejects(runCodDiagnostic(db, admin, shop), e => !e.message.includes("private"));
      assert.equal((await pg.query(`SELECT "state" FROM "CodAccountingDiagnostic"`)).rows[0].state, "rejected");
    } else {
      const retry = await runCodDiagnostic(db, admin, shop);
      assert.equal(retry.state, mode === "mismatch" ? "mismatch" : "confirmed");
      assert.equal(retry.observed.receivedPaise, 28000);
      assert.equal((await pg.query(`SELECT "orderId" FROM "CodAccountingDiagnostic"`)).rows[0].orderId, "gid://shopify/Order/123");
    }
    assert.equal(mutations, 1);
  } finally { await pg.close(); }
}
try {
  await build({ entryPoints: ["app/lib/cod-accounting-diagnostic.server.ts"], bundle: true, packages: "external",
    platform: "node", format: "esm", outfile: new URL("diagnostic.mjs", output).pathname });
  for (const mode of ["normal", "lost", "mismatch", "reject"]) await scenario(mode);
  console.log("Accounting diagnostic passed: Cartwala-only access, one test order across 12 calls, no real payment/contact/shipping/stock, explicit mismatch, lost-response recovery and no second POST.");
} finally { await rm(output, { recursive: true, force: true }); }
