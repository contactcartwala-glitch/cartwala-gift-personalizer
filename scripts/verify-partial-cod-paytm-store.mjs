import assert from "node:assert/strict";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, rm } from "node:fs/promises";
const output = new URL("../.qa-paytm-store/", import.meta.url);
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
  await build({ entryPoints: ["app/lib/partial-cod-paytm-store.server.ts"], bundle: true,
    packages: "external", platform: "node", format: "esm", outfile: new URL("store.mjs", output).pathname });
  const { loadPaytmIntent, beginPaytmPayment, claimPaytmAttempt, recordPaytmProof } = await import(new URL("store.mjs", output));
  const account = { mid: "TESTMERCHANT1234567890", environment: "staging" };
  const base = { id: "12345678-1234-1234-1234-123456789abc", shop: "test.myshopify.com",
    state: "quoted", currency: "INR", orderPaise: 100000, advancePercent: 20,
    payableNowPaise: 28000, collectPaise: 80000 };
  const insert = async (intent, age = "0 minutes") => {
    await pg.query(`INSERT INTO "PartialCodIntent" VALUES ($1,$2,'request-secret',$3,$4,$5,$6,$7,$8,
      CURRENT_TIMESTAMP - $9::interval, CURRENT_TIMESTAMP)`, [intent.id, intent.shop, intent.state,
      intent.currency, intent.orderPaise, intent.advancePercent, intent.payableNowPaise, intent.collectPaise, age]);
  };
  await insert(base);
  assert.deepEqual(await loadPaytmIntent(db, base.shop, base.id, "request-secret"), base);
  await assert.rejects(loadPaytmIntent(db, "other.myshopify.com", base.id, "request-secret"));
  await assert.rejects(loadPaytmIntent(db, base.shop, base.id, "wrong-secret"));
  let requests = 0;
  const gateway = { initiate: async intent => {
    requests++;
    assert.equal(intent.state, "awaiting_payment");
    const row = (await pg.query(`SELECT * FROM "PartialCodPaytmAttempt" WHERE "intentId"=$1`, [intent.id])).rows[0];
    assert.equal(row.state, "initiating");
    return { orderId: row.orderId, mid: account.mid, environment: account.environment, txnToken: "test-only-token" };
  } };
  const starts = await Promise.allSettled(Array.from({ length: 12 }, () => beginPaytmPayment(db, gateway, base, account)));
  assert.equal(starts.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(requests, 1);
  let attempt = (await pg.query(`SELECT * FROM "PartialCodPaytmAttempt"`)).rows[0];
  assert.equal(attempt.state, "ready");
  assert.equal("txnToken" in attempt, false);
  const proof = { status: "paid", orderId: attempt.orderId, transactionId: "TXN-1", paidPaise: 28000,
    currency: "INR", fingerprint: `paytm:staging:${account.mid}:TXN-1` };
  await Promise.all(Array.from({ length: 8 }, () => recordPaytmProof(db, base, account, proof)));
  attempt = (await pg.query(`SELECT * FROM "PartialCodPaytmAttempt"`)).rows[0];
  assert.equal(attempt.state, "paid");
  assert.equal(attempt.transactionId, "TXN-1");
  assert.equal((await pg.query(`SELECT "state" FROM "PartialCodIntent"`)).rows[0].state, "awaiting_payment");
  await assert.rejects(recordPaytmProof(db, base, account, { ...proof, transactionId: "TXN-2", fingerprint: `paytm:staging:${account.mid}:TXN-2` }));
  await assert.rejects(recordPaytmProof(db, base, account, { ...proof, paidPaise: 1 }));
  await assert.rejects(recordPaytmProof(db, base, { ...account, environment: "production" }, proof));
  const second = { ...base, id: "22345678-1234-1234-1234-123456789abc" };
  await insert(second);
  await beginPaytmPayment(db, gateway, second, account);
  const secondAttempt = (await pg.query(`SELECT * FROM "PartialCodPaytmAttempt" WHERE "intentId"=$1`, [second.id])).rows[0];
  await assert.rejects(recordPaytmProof(db, second, account, { ...proof, orderId: secondAttempt.orderId }));
  const uncertain = { ...base, id: "32345678-1234-1234-1234-123456789abc" };
  await insert(uncertain);
  let uncertainCalls = 0;
  const broken = { initiate: async () => { uncertainCalls++; throw new Error("unknown network outcome"); } };
  await assert.rejects(beginPaytmPayment(db, broken, uncertain, account));
  await assert.rejects(beginPaytmPayment(db, broken, uncertain, account));
  assert.equal(uncertainCalls, 1);
  const uncertainAttempt = (await pg.query(`SELECT * FROM "PartialCodPaytmAttempt" WHERE "intentId"=$1`, [uncertain.id])).rows[0];
  assert.equal(uncertainAttempt.state, "uncertain");
  await recordPaytmProof(db, uncertain, account, { ...proof, orderId: uncertainAttempt.orderId,
    transactionId: "TXN-3", fingerprint: `paytm:staging:${account.mid}:TXN-3` });
  const expired = { ...base, id: "42345678-1234-1234-1234-123456789abc" };
  await insert(expired, "31 minutes");
  await assert.rejects(claimPaytmAttempt(db, expired, account));
  await pg.query(`UPDATE "PartialCodIntent" SET "state"='cancelled' WHERE "id"=$1`, [base.id]);
  await assert.rejects(recordPaytmProof(db, base, account, proof));
  await assert.rejects(pg.query(`UPDATE "PartialCodPaytmAttempt" SET "transactionId"=NULL WHERE "intentId"=$1`, [base.id]));
  console.log("PostgreSQL-backed Paytm single-writer claims, duplicate/replay guards, cross-order uniqueness, expiry, uncertain recovery and closed-order protection passed.");
} finally { await pg.close(); await rm(output, { recursive: true, force: true }); }
