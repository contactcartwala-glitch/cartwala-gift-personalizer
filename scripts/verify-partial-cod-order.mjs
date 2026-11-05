import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, rm } from "node:fs/promises";
const output = new URL("../.qa-cod-order/", import.meta.url);
await mkdir(output, { recursive: true });
const pg = new PGlite();
const money = p => ({ shopMoney: { amount: (p / 100).toFixed(2), currencyCode: "INR" } });
try {
  await build({ entryPoints: ["app/lib/partial-cod-order.ts", "app/lib/partial-cod-order-store.server.ts",
    "app/lib/partial-cod-accounting.ts"], bundle: true, packages: "external", platform: "node", format: "esm",
    outdir: output.pathname, outExtension: { ".js": ".mjs" } });
  const { buildPaidCodOrder, verifyCodCreatedOrder } = await import(new URL("partial-cod-order.mjs", output));
  const { freezeCodAccounting, readCodAccounting } = await import(new URL("partial-cod-accounting.mjs", output));
  const { createCodOrderFromPaidIntent, reconcilePaidCodOrder } = await import(new URL("partial-cod-order-store.server.mjs", output));
  for (const name of ["20261005070000_partial_cod", "20261007080000_partial_cod_settings",
    "20261105095000_partial_cod_paytm_attempt", "20261105110000_partial_cod_accounting_snapshot",
    "20261105111500_partial_cod_order_attempt", "20261105170000_partial_cod_configurable_fee"])
    await pg.exec(await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"));
  const db = { query: async (sql, parameters) => (await pg.query(sql, parameters)).rows };
  const account = { mid: "TESTMERCHANT1234567890", environment: "staging" };
  const contexts = new Map();
  function fixture({ count = 1, unit = 100000, tax = 0, included = false, percent = 20, fee = 8000 } = {}) {
    const id = randomUUID(), shop = "test.myshopify.com", base = count * unit;
    const source = Array.from({ length: count }, (_, i) => ({ variantId: "gid://shopify/ProductVariant/123", quantity: 1,
      properties: [{ name: "_print_url", value: `https://example.test/artwork-${i}.png` }] }));
    const ids = source.map(() => randomUUID());
    const calculated = { currencyCode: "INR", presentmentCurrencyCode: "INR", taxesIncluded: included,
      totalPriceSet: money(base + (included ? 0 : tax)), totalTaxSet: money(tax), totalDiscountsSet: money(0),
      totalShippingPriceSet: money(0), taxLines: tax ? [{ title: "GST", rate: 0.18, priceSet: money(tax), channelLiable: null }] : [],
      lineItems: source.map((line, i) => ({ uuid: ids[i], variant: { id: line.variantId }, quantity: line.quantity,
        taxable: true, requiresShipping: true, custom: false, isGiftCard: false, components: [],
        originalUnitPriceSet: money(unit), originalTotalSet: money(unit), discountedTotalSet: money(unit),
        totalDiscountSet: money(0), customAttributes: line.properties.map(p => ({ key: p.name, value: p.value })) })) };
    const accountingSnapshot = freezeCodAccounting(calculated, source, ids), orderPaise = accountingSnapshot.orderPaise;
    const advance = Math.floor((orderPaise * percent + 50) / 100);
    const reference = "CW" + createHash("sha256").update(`${shop}:${id}`).digest("hex").slice(0, 48);
    const context = { intent: { id, shop, state: "awaiting_payment", currency: "INR", orderPaise,
      advancePercent: percent, codFeePaise: fee, payableNowPaise: advance + fee, collectPaise: orderPaise - advance,
      depositOrderId: null, codOrderId: null }, accountingSnapshot,
      shippingAddress: { firstName: "QA", lastName: "Test", address1: "Test only", address2: "", city: "Warangal",
        provinceCode: "TS", zip: "506001", phone: "+919999999999", countryCode: "IN" },
      payment: { state: "paid", environment: "staging", merchantId: account.mid, orderId: reference,
        transactionId: `TXN-${id}`, paymentFingerprint: `paytm:staging:${account.mid}:TXN-${id}`, payableNowPaise: advance + fee } };
    contexts.set(id, context);
    return { context, calculated, source, ids };
  }
  function acknowledgment(context, orderId) {
    const expected = buildPaidCodOrder(context), i = context.intent;
    return { header: { id: orderId, cancelledAt: null, test: expected.order.test, currencyCode: "INR",
      presentmentCurrencyCode: "INR", displayFinancialStatus: "PARTIALLY_PAID", sourceIdentifier: expected.order.sourceIdentifier,
      taxesIncluded: expected.snapshot.taxesIncluded, customAttributes: expected.attributes,
      tags: expected.order.tags, shippingAddress: { ...expected.order.shippingAddress, countryCodeV2: "IN" },
      taxLines: expected.snapshot.taxLines.map(t => ({ title: t.title, rate: t.rate,
        channelLiable: t.channelLiable, priceSet: money(t.paise) })),
      totalPriceSet: money(i.orderPaise + (i.codFeePaise ?? 8000)), currentTotalPriceSet: money(i.orderPaise + (i.codFeePaise ?? 8000)),
      totalReceivedSet: money(i.payableNowPaise), totalOutstandingSet: money(i.collectPaise), totalRefundedSet: money(0),
      totalShippingPriceSet: money(0), currentTotalDiscountsSet: money(0), totalTaxSet: money(expected.snapshot.taxPaise),
      transactions: [{ kind: "SALE", status: "SUCCESS", test: expected.order.test, gateway: "Cartwala Paytm", amountSet: money(i.payableNowPaise) }] },
      lines: expected.order.lineItems.map(line => ({ variant: line.variantId ? { id: line.variantId } : null,
        quantity: line.quantity, currentQuantity: line.quantity, requiresShipping: line.requiresShipping, taxable: line.taxable,
        title: line.title || "Physical merchandise", originalUnitPriceSet: line.priceSet,
        discountedTotalSet: money(Number(line.priceSet.shopMoney.amount) * line.quantity * 100),
        customAttributes: line.properties.map(p => ({ key: p.name, value: p.value })) })) };
  }
  const basic = fixture(), context = basic.context, expected = buildPaidCodOrder(context);
  assert.equal(expected.order.transactions[0].amountSet.shopMoney.amount, "280.00");
  assert.equal(expected.order.lineItems[0].priceSet.shopMoney.amount, "1000.00");
  assert.equal(expected.order.lineItems[1].priceSet.shopMoney.amount, "80.00");
  assert.equal(expected.order.lineItems[1].requiresShipping, false);
  assert.equal("financialStatus" in expected.order, false);
  assert.equal("fulfillment" in expected.order, false);
  assert.equal("customer" in expected.order, false);
  assert.equal(expected.order.test, true);
  assert.equal(expected.options.sendReceipt, false);
  assert.equal(expected.payloadHash, buildPaidCodOrder(context).payloadHash);
  const full = acknowledgment(context, "gid://shopify/Order/101");
  assert.equal(verifyCodCreatedOrder(context, full.header, full.lines).collectPaise, 80000);
  for (const percent of [10, 30, 40, 50]) {
    const x = fixture({ percent }).context, ack = acknowledgment(x, "gid://shopify/Order/102");
    assert.equal(verifyCodCreatedOrder(x, ack.header, ack.lines).receivedPaise, 8000 + percent * 1000);
  }
  for (const fee of [0, 4000, 5000, 8000, 123]) {
    const x = fixture({ fee }).context, ack = acknowledgment(x, "gid://shopify/Order/102");
    const proof = verifyCodCreatedOrder(x, ack.header, ack.lines);
    assert.equal(proof.receivedPaise, 20000 + fee);
    assert.equal(proof.collectPaise, 80000);
    const wrong = structuredClone(ack);
    wrong.lines.at(-1).originalUnitPriceSet = money(fee + 1);
    assert.throws(() => verifyCodCreatedOrder(x, wrong.header, wrong.lines));
  }
  for (const args of [{ unit: 100000, tax: 18000 }, { unit: 118000, tax: 18000, included: true }]) {
    const x = fixture(args).context, ack = acknowledgment(x, "gid://shopify/Order/103");
    assert.equal(x.intent.orderPaise, 118000);
    assert.equal(verifyCodCreatedOrder(x, ack.header, ack.lines).collectPaise, 94400);
  }
  const reordered = fixture({ count: 2, unit: 50000 });
  reordered.calculated.lineItems.reverse();
  assert.deepEqual(freezeCodAccounting(reordered.calculated, reordered.source, reordered.ids), reordered.context.accountingSnapshot);
  for (const mutate of [
    c => { c.totalDiscountsSet = money(100); }, c => { c.lineItems[0].isGiftCard = true; },
    c => { c.lineItems[0].components = [{ uuid: randomUUID() }]; }, c => { c.lineItems[0].uuid = randomUUID(); },
    c => { c.lineItems[0].customAttributes[0].value = "changed artwork"; },
    c => { c.lineItems[0].discountedTotalSet = money(1); }, c => { c.totalTaxSet = money(100); },
  ]) { const c = structuredClone(basic.calculated); mutate(c); assert.throws(() => freezeCodAccounting(c, basic.source, basic.ids)); }
  assert.throws(() => readCodAccounting(null));
  for (const mutate of [
    c => { c.payment.state = "pending"; }, c => { c.intent.depositOrderId = "gid://shopify/Order/999"; },
    c => { c.payment.payableNowPaise = 1; }, c => { c.payment.paymentFingerprint = "unverified"; },
    c => { c.intent.state = "cancelled"; }, c => { c.accountingSnapshot.orderPaise = 1; },
  ]) { const x = structuredClone(context); mutate(x); assert.throws(() => buildPaidCodOrder(x)); }
  for (const mutate of [
    h => { h.totalOutstandingSet = money(100000); }, h => { h.totalReceivedSet = money(108000); },
    h => { h.totalRefundedSet = money(1); }, h => { h.cancelledAt = new Date().toISOString(); },
    h => { h.test = false; }, h => { h.displayFinancialStatus = "PAID"; },
    h => { h.transactions[0].gateway = "unrelated"; }, h => { h.transactions.push(h.transactions[0]); },
    h => { h.customAttributes[0].value = "wrong order kind"; }, h => { h.sourceIdentifier = "wrong order"; },
    h => { h.tags = []; }, h => { h.shippingAddress.zip = "500001"; },
  ]) { const h = structuredClone(full.header); mutate(h); assert.throws(() => verifyCodCreatedOrder(context, h, full.lines)); }
  const badLines = structuredClone(full.lines); badLines[0].customAttributes[0].value = "wrong preview";
  assert.throws(() => verifyCodCreatedOrder(context, full.header, badLines));

  async function persist(x) {
    const i = x.intent, p = x.payment;
    await pg.query(`INSERT INTO "PartialCodIntent" ("id","shop","requestKey","state","currency","orderPaise","advancePercent",
      "payableNowPaise","collectPaise","lines","shippingAddress","accountingSnapshot","codFeePaise","updatedAt")
      VALUES ($1,$2,$1,'awaiting_payment','INR',$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)`,
    [i.id, i.shop, i.orderPaise, i.advancePercent, i.payableNowPaise, i.collectPaise,
      JSON.stringify(x.accountingSnapshot.lines), JSON.stringify(x.shippingAddress), JSON.stringify(x.accountingSnapshot), i.codFeePaise ?? 8000]);
    await pg.query(`INSERT INTO "PartialCodPaytmAttempt" ("intentId","orderId","environment","merchantId","payableNowPaise","state","transactionId","paymentFingerprint")
      VALUES ($1,$2,'staging',$3,$4,'paid',$5,$6)`, [i.id, p.orderId, account.mid, i.payableNowPaise, p.transactionId, p.paymentFingerprint]);
  }
  let mutations = 0, sequence = 200, mode = "normal", linePages = 0;
  const created = new Map();
  const admin = { graphql: async (query, options) => {
    assert.equal(options.tries, 1);
    if (query.includes("mutation CreatePaidCodOrder")) {
      mutations++;
      assert.equal(options.variables.options.sendReceipt, false);
      assert.equal(options.variables.options.sendFulfillmentReceipt, false);
      assert.equal(options.variables.options.inventoryBehaviour, "DECREMENT_OBEYING_POLICY");
      assert.equal(options.variables.order.test, true);
      if (mode === "reject") return Response.json({ data: { orderCreate: { order: null, userErrors: [{ field: ["lineItems"], message: "private upstream error" }] } } });
      const id = `gid://shopify/Order/${++sequence}`;
      const intentId = options.variables.order.customAttributes.find(p => p.key === "_cartwala_cod_intent").value;
      created.set(id, acknowledgment(contexts.get(intentId), id));
      if (mode === "timeout") throw new Error("private network outcome");
      return Response.json({ data: { orderCreate: { order: { id }, userErrors: [] } } });
    }
    const value = created.get(options.variables.id);
    if (!value) return Response.json({ data: { order: null } });
    if (query.includes("query ReadCodOrderLines")) {
      linePages++;
      const offset = options.variables.after ? Number(options.variables.after) : 0;
      const nodes = value.lines.slice(offset, offset + 50), next = offset + nodes.length;
      return Response.json({ data: { order: { id: options.variables.id,
        lineItems: { nodes, pageInfo: { hasNextPage: next < value.lines.length, endCursor: String(next) } } } } });
    }
    assert.ok(query.includes("query ReadCodOrderAccounting"));
    const h = structuredClone(value.header);
    if (mode === "badack") h.totalOutstandingSet = money(1);
    return Response.json({ data: { order: h } });
  } };
  const gateway = { verify: async i => {
    const p = contexts.get(i.id).payment;
    if (mode === "pending") return { status: "pending" };
    return { status: "paid", orderId: p.orderId, transactionId: p.transactionId, currency: "INR",
      paidPaise: p.payableNowPaise, fingerprint: p.paymentFingerprint };
  } };
  const run = x => createCodOrderFromPaidIntent(db, admin, gateway, x.intent.id, x.intent.shop, account,
    { shippingSyncExcluded: true });
  const state = async x => (await pg.query(`SELECT * FROM "PartialCodOrderAttempt" WHERE "intentId"=$1`, [x.intent.id])).rows[0];
  await persist(context);
  await assert.rejects(createCodOrderFromPaidIntent(db, admin, gateway, context.intent.id, context.intent.shop, account));
  assert.equal(mutations, 0);
  const concurrent = await Promise.allSettled(Array.from({ length: 12 }, () => run(context)));
  assert.equal(mutations, 1);
  assert.equal(concurrent.filter(r => r.status === "fulfilled" && !r.value.alreadyCreated).length, 1);
  assert.equal((await state(context)).state, "completed");
  assert.equal((await pg.query(`SELECT "state" FROM "PartialCodIntent" WHERE "id"=$1`, [context.intent.id])).rows[0].state, "cod_order_created");
  assert.equal((await pg.query(`SELECT COUNT(*)::int AS n FROM "PartialCodOutbox"`)).rows[0].n, 0);
  assert.equal((await run(context)).alreadyCreated, true);
  assert.equal(mutations, 1);
  const unack = fixture().context; await persist(unack); mode = "badack";
  await assert.rejects(run(unack));
  assert.equal((await state(unack)).state, "uncertain");
  const before = mutations; await assert.rejects(run(unack)); assert.equal(mutations, before);
  mode = "normal"; await reconcilePaidCodOrder(db, admin, gateway, unack.intent.id, unack.intent.shop, account);
  assert.equal((await state(unack)).state, "completed"); assert.equal(mutations, before);
  const unknown = fixture().context; await persist(unknown); mode = "timeout";
  await assert.rejects(run(unknown), e => !e.message.includes("private"));
  assert.equal((await state(unknown)).candidateOrderId, null);
  const lostId = `gid://shopify/Order/${sequence}`, afterLoss = mutations;
  mode = "normal";
  await assert.rejects(run(unknown));
  await assert.rejects(reconcilePaidCodOrder(db, admin, gateway, unknown.intent.id, unknown.intent.shop, account, "gid://shopify/Order/201"));
  await reconcilePaidCodOrder(db, admin, gateway, unknown.intent.id, unknown.intent.shop, account, lostId);
  assert.equal((await state(unknown)).state, "completed"); assert.equal(mutations, afterLoss);
  const rejected = fixture().context; await persist(rejected); mode = "reject";
  await assert.rejects(run(rejected), e => !e.message.includes("private"));
  assert.equal((await state(rejected)).state, "rejected");
  const rejectedCount = mutations; await assert.rejects(run(rejected)); assert.equal(mutations, rejectedCount);
  const pending = fixture().context; await persist(pending); mode = "pending";
  await assert.rejects(run(pending)); assert.equal(await state(pending), undefined);
  const closed = fixture().context; await persist(closed); mode = "normal";
  await pg.query(`UPDATE "PartialCodIntent" SET "state"='cancelled' WHERE "id"=$1`, [closed.intent.id]);
  await assert.rejects(run(closed)); assert.equal(await state(closed), undefined);
  await assert.rejects(createCodOrderFromPaidIntent(db, admin, gateway, pending.intent.id, "other.myshopify.com", account));
  const beforeLive = mutations;
  await assert.rejects(createCodOrderFromPaidIntent(db, admin, gateway, pending.intent.id, pending.intent.shop,
    { ...account, environment: "production" }, { shippingSyncExcluded: true }));
  assert.equal(mutations, beforeLive);
  const large = fixture({ count: 100, unit: 1000 }).context; await persist(large); const pageStart = linePages;
  await run(large); assert.equal(linePages - pageStart, 3);
  console.log("Single-order accounting passed: frozen tax/price/artwork snapshots, 10–50% advances, frozen configurable non-shipping fee, exact Shopify re-read, one-writer SQL claims, no duplicate sale/retry, uncertain-order recovery and live gate. Transport is mocked; no Shopify order was created.");
} finally { await pg.close(); await rm(output, { recursive: true, force: true }); }
