import assert from "node:assert/strict";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, rm } from "node:fs/promises";
const output = new URL("../.qa-cod-checkout/", import.meta.url);
await mkdir(output, { recursive: true });
const pg = new PGlite();
try {
  for (const file of ["partial-cod-access.server", "partial-cod-checkout.server"]) {
    await build({ entryPoints: [`app/lib/${file}.ts`], bundle: true, packages: "external", platform: "node", format: "esm",
      outfile: new URL(`${file}.mjs`, output).pathname });
  }
  const { issueCodAccess, readCodAccess } = await import(new URL("partial-cod-access.server.mjs", output));
  const { startCodCheckout, progressCodCheckout, readCodCheckout } = await import(new URL("partial-cod-checkout.server.mjs", output));
  const shop = "test.myshopify.com", id = "12345678-1234-1234-1234-123456789abc", secret = "test-only-signing-secret-32-characters", now = 1700000000000;
  const token = issueCodAccess(shop, id, secret, now);
  assert.equal(readCodAccess(token, shop, secret, now), id);
  for (const bad of [token.replace(/.$/, token.endsWith("a") ? "b" : "a"), "", "a".repeat(1025)])
    assert.throws(() => readCodAccess(bad, shop, secret, now));
  assert.throws(() => readCodAccess(token, "other.myshopify.com", secret, now));
  assert.throws(() => readCodAccess(token, shop, secret + "wrong", now));
  assert.throws(() => readCodAccess(token, shop, secret, now + 7 * 86400 * 1000));
  assert.throws(() => issueCodAccess(shop, id, "short", now));
  await pg.exec(`CREATE TABLE "PartialCodIntent" (
    "id" TEXT PRIMARY KEY,"shop" TEXT NOT NULL,"state" TEXT NOT NULL,"currency" TEXT NOT NULL,
    "orderPaise" INTEGER NOT NULL,"advancePercent" INTEGER NOT NULL,"payableNowPaise" INTEGER NOT NULL,
    "collectPaise" INTEGER NOT NULL,"codOrderId" TEXT,"accountingSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await pg.exec(await readFile("prisma/migrations/20261105095000_partial_cod_paytm_attempt/migration.sql", "utf8"));
  // Match Prisma's typed TEXT bindings, rather than relying on PostgreSQL inferred types.
  const db = { query: async (sql, parameters) => (await pg.query(sql.replace(/\$(\d+)/g, (_, n) =>
    typeof parameters[Number(n) - 1] === "string" ? `($${n}::text)` : `$${n}`), parameters)).rows };
  const account = { mid: "TESTMERCHANT1234567890", environment: "staging" };
  const snapshot = { version: 1, orderPaise: 100000, taxesIncluded: true, taxPaise: 0, taxLines: [],
    lines: [{ quoteLineId: id, variantId: "gid://shopify/ProductVariant/123", quantity: 1, unitPaise: 100000,
      taxable: false, requiresShipping: true, properties: [] }] };
  await pg.query(`INSERT INTO "PartialCodIntent" ("id","shop","state","currency","orderPaise","advancePercent","payableNowPaise","collectPaise","accountingSnapshot")
    VALUES ($1,$2,'quoted','INR',100000,20,28000,80000,$3)`, [id, shop, JSON.stringify(snapshot)]);
  let initiations = 0, verifications = 0, dispatches = 0, mode = "pending", providerOrder;
  const gateway = {
    initiate: async intent => {
      initiations++;
      providerOrder = (await pg.query('SELECT "orderId" FROM "PartialCodPaytmAttempt" WHERE "intentId"=$1', [intent.id])).rows[0].orderId;
      return { orderId: providerOrder, mid: account.mid, environment: account.environment, amount: "280.00", txnToken: "TEST_ONLY_NOT_PERSISTED" };
    },
    verify: async () => {
      verifications++;
      if (mode === "error") throw new Error("provider unavailable");
      if (mode !== "paid") return { status: mode };
      return { status: "paid", orderId: providerOrder, transactionId: "TESTTXN", paidPaise: 28000, currency: "INR",
        fingerprint: `paytm:staging:${account.mid}:TESTTXN` };
    },
  };
  const dispatch = async () => {
    dispatches++;
    await pg.query(`UPDATE "PartialCodIntent" SET "state"='cod_order_created',"codOrderId"='gid://shopify/Order/123' WHERE "id"=$1`, [id]);
  };
  const progress = (fn = dispatch) => progressCodCheckout(db, gateway, shop, id, account, fn);
  assert.equal((await progress()).state, "not_started");
  assert.equal(verifications, 0);
  await assert.rejects(readCodCheckout(db, "other.myshopify.com", id, account));
  const starts = await Promise.allSettled(Array.from({ length: 12 }, () => startCodCheckout(db, gateway, shop, id, account)));
  assert.equal(starts.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(initiations, 1);
  const polls = await Promise.all(Array.from({ length: 12 }, () => progress()));
  assert(polls.every(x => x.state === "payment_pending"));
  assert.equal(verifications, 1); assert.equal(dispatches, 0);
  const unlock = () => pg.exec('UPDATE "PartialCodPaytmAttempt" SET "lastCheckedAt"=NULL');
  await unlock(); mode = "failed";
  assert.equal((await progress()).state, "payment_failed");
  assert.equal(dispatches, 0);
  await unlock(); mode = "error";
  await assert.rejects(progress()); assert.equal(dispatches, 0);
  await unlock(); mode = "paid";
  const held = await progress(async () => { throw new Error("shipping exclusion not confirmed"); });
  assert.equal(held.state, "paid_order_pending");
  assert.equal((await pg.query('SELECT "state" FROM "PartialCodPaytmAttempt"')).rows[0].state, "paid");
  await unlock();
  assert.equal((await progress()).state, "order_confirmed");
  assert.equal(dispatches, 1);
  await Promise.all(Array.from({ length: 12 }, () => progress()));
  assert.equal(dispatches, 1); assert.equal(initiations, 1);
  await assert.rejects(startCodCheckout(db, gateway, shop, id, account));
  await pg.exec(`UPDATE "PartialCodIntent" SET "state"='cancelled'`);
  assert.equal((await progress()).state, "needs_review");
  await assert.rejects(readCodCheckout(db, shop, id, { ...account, mid: "OTHER" }));
  console.log("Signed checkout access, cross-shop/account rejection, 12 concurrent starts/polls, pending/failed/uncertain/paid recovery, dispatch hold and no duplicate payment/order passed.");
} finally { await pg.close(); await rm(output, { recursive: true, force: true }); }
