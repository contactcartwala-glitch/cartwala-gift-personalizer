/* global globalThis */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(await fs.readFile("prisma/migrations/20261106060000_cod_theme_review/migration.sql", "utf8"));
globalThis.codReviewTest = { shop: "0k9icg-ns.myshopify.com", authorized: true,
  query: async (sql, values) => (await db.query(sql, values)).rows };
async function compile(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm", plugins: [{
    name: "review-test-dependencies", setup(b) {
      b.onResolve({ filter: /(?:db|shopify)\.server$/ }, args => ({ path: args.path, namespace: "review-test" }));
      b.onLoad({ filter: /.*/, namespace: "review-test" }, args => ({ contents: args.path.includes("db.server")
        ? 'export default { $queryRawUnsafe: (sql,...values) => globalThis.codReviewTest.query(sql,values) };'
        : 'async function auth(){if(!globalThis.codReviewTest.authorized)throw new Response("Unauthorized",{status:401});return {session:{shop:globalThis.codReviewTest.shop}}} export const authenticate={admin:auth,public:{appProxy:auth}};', loader: "js" }));
      b.onResolve({ filter: /^react-router$/ }, () => ({ path: "router", namespace: "review-router" }));
      b.onLoad({ filter: /.*/, namespace: "review-router" }, () => ({ contents: 'export const Form=()=>null; export const useLoaderData=()=>({}); export const useActionData=()=>({}); export const useNavigation=()=>({state:"idle"});', loader: "js" }));
    } }] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const settings = await compile("app/lib/cod-theme-review.server.ts");
const route = await compile("app/routes/app.cod-theme-review.tsx");
const proxy = await compile("app/routes/signature-day.cod-review.ts");
const request = values => new Request("https://app.test/app/cod-theme-review", {
  method: "POST", body: new URLSearchParams(values),
});
const act = values => route.action({ request: request(values) });
const shop = settings.COD_REVIEW_SHOP;
assert.deepEqual(await settings.loadCodThemeReview(shop), { enabled: false, advancePercent: 20, codFeePaise: 5000, revision: 0 });
for (const [input, expected] of [["0",0],["40",4000],["50",5000],["80",8000],["1.23",123]])
  assert.equal(settings.parseReviewCharge(input), expected);
for (const bad of ["", "-1", "1.001", "1e2", "10000.01", null]) assert.throws(() => settings.parseReviewCharge(bad));
assert.equal((await act({ intent: "save", revision: "0", advancePercent: "30", codCharge: "80" })).ok, true);
assert.deepEqual(await settings.loadCodThemeReview(shop), { enabled: false, advancePercent: 30, codFeePaise: 8000, revision: 1 });
assert.equal((await act({ intent: "toggle", enabled: "true", revision: "1", advancePercent: "bad", codCharge: "bad" })).ok, true);
assert.deepEqual(await settings.loadCodThemeReview(shop), { enabled: true, advancePercent: 30, codFeePaise: 8000, revision: 2 });
assert.equal((await act({ intent: "save", revision: "1", advancePercent: "20", codCharge: "50" })).ok, false);
for (const [advancePercent, codCharge] of [["9","50"],["51","50"],["20.5","50"],["20","1.001"]])
  assert.equal((await act({ intent: "save", revision: "2", advancePercent, codCharge })).ok, false);
assert.equal((await act({ intent: "toggle", enabled: "false", revision: "2" })).ok, true);
const off = await settings.loadCodThemeReview(shop);
assert.deepEqual(off, { enabled: false, advancePercent: 30, codFeePaise: 8000, revision: 3 });
const response = await proxy.loader({ request: new Request("https://app.test/signature-day/cod-review") });
assert.equal(response.headers.get("Cache-Control"), "no-store");
assert.deepEqual(await response.json(), { available: true, themeId: "188248228025", ...off, paymentsEnabled: false });
globalThis.codReviewTest.authorized = false;
await assert.rejects(() => route.loader({ request: new Request("https://app.test/app/cod-theme-review") }), e => e.status === 401);
await assert.rejects(() => act({ intent: "toggle", enabled: "true", revision: "3" }), e => e.status === 401);
globalThis.codReviewTest.authorized = true;
globalThis.codReviewTest.shop = "other.myshopify.com";
await assert.rejects(() => route.loader({ request: new Request("https://app.test/app/cod-theme-review") }), e => e.status === 404);
assert.equal((await proxy.loader({ request: new Request("https://app.test/signature-day/cod-review") })).status, 404);
globalThis.codReviewTest.shop = shop;
await assert.rejects(() => route.action({ request: new Request("https://app.test/app/cod-theme-review", { method: "PUT" }) }), e => e.status === 405);
assert.equal((await db.query('SELECT count(*)::int AS count FROM "CodThemeReviewSettings"')).rows[0].count, 1);
await db.close();
delete globalThis.codReviewTest;
console.log("Isolated preview defaults, persistence, OFF, fee/percentage validation, stale saves, auth, shop scope and non-payment proxy checks passed.");
