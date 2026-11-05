import assert from "node:assert/strict";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
const output = new URL("../.qa-cod-controls/", import.meta.url);
await mkdir(output, { recursive: true });
const pg = new PGlite();
const env = { PAYTM_SHOP: "test.myshopify.com", PAYTM_ENVIRONMENT: "staging", PAYTM_MID: "TESTMERCHANT1234567890",
  PAYTM_MERCHANT_KEY: "TESTONLYKEY12345", SHOPIFY_APP_URL: "https://example.test", SHOPIFY_API_SECRET: "TEST_ONLY_SIGNING_SECRET_32_CHARACTERS",
  ADVANCE_COD_STAGING_ENABLED: "true", ADVANCE_COD_SHOPIFY_SYNC_EXCLUDED: "true" };
const saved = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]));
try {
  Object.assign(process.env, env);
  for (const name of ["20261005070000_partial_cod", "20261007080000_partial_cod_settings"])
    await pg.exec(await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"));
  await pg.exec(`INSERT INTO "PartialCodSettings" ("shop","updatedAt") VALUES ('legacy.myshopify.com',CURRENT_TIMESTAMP);
    INSERT INTO "PartialCodIntent" ("id","shop","requestKey","state","orderPaise","payableNowPaise","collectPaise","lines","shippingAddress","updatedAt")
      VALUES ('legacy-intent','legacy.myshopify.com','legacy-key','paid',100000,28000,80000,'[]','{}',CURRENT_TIMESTAMP)`);
  await pg.exec(await readFile("prisma/migrations/20261105170000_partial_cod_configurable_fee/migration.sql", "utf8"));
  const original = (await pg.query('SELECT * FROM "PartialCodIntent" WHERE "id"=\'legacy-intent\'')).rows[0];
  assert.equal(original.codFeePaise, 8000); assert.equal(original.payableNowPaise, 28000);
  globalThis.__codControlDb = { partialCodSettings: {
    findUnique: async ({ where }) => (await pg.query('SELECT * FROM "PartialCodSettings" WHERE "shop"=$1', [where.shop])).rows[0] || null,
    create: async ({ data }) => {
      try { return (await pg.query(`INSERT INTO "PartialCodSettings" ("shop","enabled","advancePercent","codFeePaise","updatedAt")
        VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP) RETURNING *`, [data.shop, data.enabled, data.advancePercent, data.codFeePaise])).rows[0]; }
      catch (error) { if (error.code === "23505") throw { code: "P2002" }; throw error; }
    },
    updateMany: async ({ where, data }) => ({ count: (await pg.query(`UPDATE "PartialCodSettings" SET "enabled"=$3,
      "advancePercent"=$4,"codFeePaise"=$5,"revision"="revision"+1,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "shop"=$1 AND "revision"=$2 RETURNING "shop"`, [where.shop, where.revision, data.enabled, data.advancePercent, data.codFeePaise])).rows.length }),
  } };
  await writeFile(new URL("entry.ts", output), `export * from "../app/lib/partial-cod-settings.server";
    export * from "../app/lib/partial-cod-settings";
    export * from "../app/lib/partial-cod";
    export * from "../app/lib/partial-cod-paytm-runtime.server";`);
  await build({ entryPoints: [new URL("entry.ts", output).pathname], bundle: true, packages: "external", platform: "node", format: "esm",
    outfile: new URL("controls.mjs", output).pathname, plugins: [{ name: "control-runtime", setup(builder) {
      builder.onResolve({ filter: /(?:db|shopify)\.server$/ }, args => ({ path: args.path.includes("shopify") ? "shopify" : "db", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents: args.path === "db"
        ? "export default globalThis.__codControlDb;"
        : "export const unauthenticated={admin:()=>{throw new Error('No provider calls allowed')}};" }));
    } }] });
  const m = await import(new URL("controls.mjs", output));
  const shop = env.PAYTM_SHOP;
  assert.deepEqual(await m.loadCodSettings(shop), { enabled: false, advancePercent: 20, codFeePaise: 5000, revision: 0 });
  assert.equal((await m.loadCodSettings("legacy.myshopify.com")).codFeePaise, 8000);
  for (const [text, amount] of [["0",0],["40",4000],["50.00",5000],["80",8000],["1.23",123],["10000",1000000]])
    assert.equal(m.parseCodCharge(text), amount);
  for (const text of ["", "-1", "1.001", "1e2", "NaN", "10000.01", null]) assert.throws(() => m.parseCodCharge(text));
  for (const codFeePaise of [null, -1, 1.1, 1000001, "5000"])
    assert.throws(() => m.validateCodSettings({ enabled: false, advancePercent: 20, revision: 1, codFeePaise }));
  let current = await m.saveCodSettings(shop, { enabled: false, advancePercent: 20, codFeePaise: 5000, revision: 0 });
  assert.equal(current.revision, 1);
  assert.equal(m.codCheckoutAvailable(shop, current), false); // OFF wins even over explicit staging opt-in.
  await assert.rejects(m.saveCodSettings(shop, { ...current, enabled: true }));
  assert.equal((await m.loadCodSettings(shop)).enabled, false);
  current = await m.saveCodSettings(shop, { ...current, advancePercent: 50, codFeePaise: 4000 });
  assert.equal(current.codFeePaise, 4000); assert.equal(current.advancePercent, 50);
  await assert.rejects(m.saveCodSettings(shop, { ...current, revision: 1, codFeePaise: 8000 }));
  assert.equal((await m.loadCodSettings(shop)).codFeePaise, 4000);
  // Exercise the same switch after implementation gates become ready, in this isolated module only.
  m.COD_INTEGRATION_STATUS.forEach(item => { item.ready = true; });
  current = await m.saveCodSettings(shop, { ...current, enabled: true });
  assert.equal(m.codCheckoutAvailable(shop, current), true);
  assert.equal(m.codCheckoutAvailable("other.myshopify.com", current), false);
  m.COD_INTEGRATION_STATUS.forEach(item => { item.ready = false; });
  current = await m.saveCodSettings(shop, { ...current, enabled: false }); // OFF remains available when readiness is lost.
  assert.equal(current.enabled, false); assert.equal(current.codFeePaise, 4000);
  assert.equal(m.codCheckoutAvailable(shop, current), false);
  for (const percent of [10,20,30,50]) for (const fee of [0,4000,5000,8000,123]) {
    const amounts = m.calculatePartialCod(100000, percent, fee);
    assert.equal(amounts.payableNowPaise, percent * 1000 + fee);
    assert.equal(amounts.collectOnDeliveryPaise, 100000 - percent * 1000);
    assert.equal(amounts.totalPaise, 100000 + fee);
  }
  assert.deepEqual((await pg.query('SELECT * FROM "PartialCodIntent" WHERE "id"=\'legacy-intent\'')).rows[0], original);
  await pg.exec(`INSERT INTO "PartialCodIntent" ("id","shop","requestKey","state","orderPaise","payableNowPaise","collectPaise","lines","shippingAddress","updatedAt")
    VALUES ('new-intent','test.myshopify.com','new-key','quoted',100000,25000,80000,'[]','{}',CURRENT_TIMESTAMP)`);
  assert.equal((await pg.query('SELECT "codFeePaise" FROM "PartialCodIntent" WHERE "id"=\'new-intent\'')).rows[0].codFeePaise, 5000);
  await assert.rejects(pg.exec(`UPDATE "PartialCodIntent" SET "codFeePaise"=4000 WHERE "id"='new-intent'`));
  globalThis.__codControlActions = { load: m.loadCodSettings, save: m.saveCodSettings,
    auth: async () => ({ session: { shop } }) };
  await build({ entryPoints: ["app/routes/app.advance-cod.tsx"], bundle: true, packages: "external", platform: "node", format: "esm",
    outfile: new URL("action.mjs", output).pathname, plugins: [{ name: "admin-action", setup(builder) {
      builder.onResolve({ filter: /(?:shopify|partial-cod-settings)\.server$/ }, args => ({
        path: args.path.includes("shopify") ? "shopify" : "settings", namespace: "action-test" }));
      builder.onLoad({ filter: /.*/, namespace: "action-test" }, args => ({ contents: args.path === "shopify"
        ? "export const authenticate={admin:(...args)=>globalThis.__codControlActions.auth(...args)};"
        : "export const loadCodSettings=(...args)=>globalThis.__codControlActions.load(...args); export const saveCodSettings=(...args)=>globalThis.__codControlActions.save(...args);" }));
    } }] });
  const { action } = await import(new URL("action.mjs", output));
  const post = fields => action({ request: new Request("https://example.test/app/advance-cod", {
    method: "POST", body: new URLSearchParams(fields) }) });
  await pg.query('UPDATE "PartialCodSettings" SET "enabled"=true WHERE "shop"=$1', [shop]);
  current = await m.loadCodSettings(shop);
  const off = await post({ intent: "toggle", enabled: "false", revision: String(current.revision), codCharge: "invalid" });
  assert.equal(off.ok, true);
  current = await m.loadCodSettings(shop);
  assert.equal(current.enabled, false); assert.equal(current.codFeePaise, 4000);
  const edit = await post({ intent: "save", enabled: "true", revision: String(current.revision), advancePercent: "30", codCharge: "40.55" });
  assert.equal(edit.ok, true);
  current = await m.loadCodSettings(shop);
  assert.equal(current.enabled, false); assert.equal(current.codFeePaise, 4055); assert.equal(current.advancePercent, 30);
  assert.equal((await post({ intent: "toggle", enabled: "true", revision: String(current.revision) })).ok, false);
  assert.equal((await post({ intent: "toggle", enabled: "arbitrary", revision: String(current.revision) })).ok, false);
  globalThis.__codControlActions.auth = async () => { throw new Response("Unauthorized", { status: 401 }); };
  await assert.rejects(post({ intent: "toggle", enabled: "false", revision: String(current.revision) }), error => error.status === 401);
  console.log("Admin fee/percentage persistence, legacy migration, stale-save guards, ON/OFF readiness, OFF in staging, preserved paid amounts and variable-charge arithmetic passed. No live settings changed.");
} finally {
  for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  delete globalThis.__codControlActions;
  delete globalThis.__codControlDb; await pg.close(); await rm(output, { recursive: true, force: true });
}
