import assert from "node:assert/strict";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import PaytmChecksum from "paytmchecksum";
import { mkdir, readFile, rm } from "node:fs/promises";
const output = new URL("../.qa-paytm-callback/", import.meta.url);
await mkdir(output, { recursive: true });
const pg = new PGlite();
try {
  await pg.exec(`CREATE TABLE "PartialCodIntent" (
    "id" TEXT PRIMARY KEY, "shop" TEXT NOT NULL, "requestKey" TEXT NOT NULL,
    "state" TEXT NOT NULL, "currency" TEXT NOT NULL, "orderPaise" INTEGER NOT NULL,
    "advancePercent" INTEGER NOT NULL, "payableNowPaise" INTEGER NOT NULL,
    "collectPaise" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pg.exec(await readFile("prisma/migrations/20261105095000_partial_cod_paytm_attempt/migration.sql", "utf8"));
  const db = { query: async (sql, parameters) => (await pg.query(sql, parameters)).rows };
  await build({ entryPoints: ["app/lib/partial-cod-checkout.server.ts"], bundle: true,
    packages: "external", platform: "node", format: "esm", outfile: new URL("checkout.mjs", output).pathname });
  const { progressCodCheckout } = await import(new URL("checkout.mjs", output));
  await build({ entryPoints: ["app/routes/payments.paytm.callback.ts"], bundle: true,
    packages: "external", platform: "node", format: "esm", outfile: new URL("callback.mjs", output).pathname,
    plugins: [{ name: "test-runtime", setup(builder) {
      builder.onResolve({ filter: /partial-cod-paytm-runtime\.server$/ }, () => ({ path: "runtime", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: `
        export const paytmDatabase = globalThis.__paytmCallbackFixture.db;
        export function configuredPaytm() { return globalThis.__paytmCallbackFixture.connection(); }
        export function progressConfiguredCodCheckout(shop, id) { return globalThis.__paytmCallbackFixture.progress(shop, id); }
      ` }));
    } }] });
  const config = { mid: "TESTMERCHANT1234567890", merchantKey: "TESTONLYKEY12345", environment: "staging" };
  const shop = "test.myshopify.com", orderId = "CW" + "a".repeat(48);
  let calls = 0, mode = "pending";
  globalThis.__paytmCallbackFixture = { db, connection: () => ({ shop, config, gateway: {
    verify: async intent => { calls++; if (mode === "throw") throw new Error("private provider error");
      if (mode !== "paid") return { status: mode };
      return { status: "paid", orderId: reference, transactionId: "CALLBACK-TXN", currency: "INR",
        paidPaise: intent.payableNowPaise, fingerprint: `paytm:staging:${config.mid}:CALLBACK-TXN` };
    }
  } }) };
  globalThis.__paytmCallbackFixture.progress = (shop, id) => progressCodCheckout(db,
    globalThis.__paytmCallbackFixture.connection().gateway, shop, id, config, async () => { throw new Error("order dispatch unavailable"); });
  const { action, loader } = await import(new URL("callback.mjs", output));
  const call = (body, contentType = "application/x-www-form-urlencoded", method = "POST") =>
    action({ request: new Request("https://example.test/payments/paytm/callback", {
      method, headers: { "content-type": contentType }, body
    }) });
  assert.equal(loader().status, 405);
  assert.equal((await call("", undefined, "PUT")).status, 405);
  assert.equal((await call("{}", "application/json")).status, 415);
  assert.equal((await call("", "application/x-www-form-urlencoded-extra")).status, 415);
  assert.equal((await call("x".repeat(32769))).status, 400);
  assert.equal((await call("MID=untrusted")).status, 400);
  const signed = async id => {
    const fields = { MID: config.mid, ORDERID: id, STATUS: "TXN_SUCCESS", TXNAMOUNT: "280.00" };
    return new URLSearchParams({ ...fields, CHECKSUMHASH: await PaytmChecksum.generateSignature(fields, config.merchantKey) }).toString();
  };
  assert.equal((await call(await signed(orderId))).status, 503);
  assert.equal(calls, 0);
  // Derive the same persisted reference as the real initiation path, then simulate its ready state.
  const { createHash } = await import("node:crypto");
  const id = "12345678-1234-1234-1234-123456789abc";
  const reference = "CW" + createHash("sha256").update(`${shop}:${id}`).digest("hex").slice(0,48);
  await pg.query(`INSERT INTO "PartialCodIntent" VALUES ($1,$2,'request-key','awaiting_payment','INR',100000,20,28000,80000,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [id, shop]);
  await pg.query(`INSERT INTO "PartialCodPaytmAttempt" ("intentId","orderId","environment","merchantId","payableNowPaise","state") VALUES ($1,$2,'staging',$3,28000,'ready')`, [id, reference, config.mid]);
  await pg.exec('ALTER TABLE "PartialCodIntent" ADD COLUMN "codOrderId" TEXT, ADD COLUMN "codFeePaise" INTEGER NOT NULL DEFAULT 8000');
  const form = await signed(reference);
  const pending = await call(form);
  assert.equal(pending.status, 200);
  assert.match(await pending.text(), /pending/);
  assert.equal((await pg.query(`SELECT "state" FROM "PartialCodPaytmAttempt"`)).rows[0].state, "ready");
  assert.equal((await call(form)).status, 200);
  assert.equal(calls, 1);
  const unlock = () => pg.exec(`UPDATE "PartialCodPaytmAttempt" SET "lastCheckedAt"=NULL`);
  await unlock(); mode = "throw";
  const unavailable = await call(form);
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.text()).includes("private provider error"), false);
  await unlock(); mode = "paid";
  const paid = await call(form);
  assert.equal(paid.status, 202);
  assert.equal(paid.headers.get("cache-control"), "no-store");
  assert.match(await paid.text(), /Payment recorded/);
  assert.equal((await pg.query(`SELECT "state" FROM "PartialCodPaytmAttempt"`)).rows[0].state, "paid");
  await unlock();
  assert.equal((await call(form)).status, 202);
  assert.equal((await pg.query(`SELECT COUNT(*)::int AS count FROM "PartialCodPaytmAttempt"`)).rows[0].count, 1);
  globalThis.__paytmCallbackFixture.connection = () => { throw new Error("missing configuration"); };
  assert.equal((await call(form)).status, 503);
  console.log("Paytm callback HTTP boundaries, signatures, account binding, status re-read, pending/replay, durable paid proof and sanitized failure responses passed.");
} finally {
  delete globalThis.__paytmCallbackFixture;
  await pg.close(); await rm(output, { recursive: true, force: true });
}
