import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
const output = new URL("../.qa-cod-checkout-route/", import.meta.url);
await mkdir(output, { recursive: true });
const saved = process.env.SHOPIFY_API_SECRET;
process.env.SHOPIFY_API_SECRET = "TEST_ONLY_SIGNING_SECRET_32_CHARACTERS";
const shop = "test.myshopify.com", id = "12345678-1234-1234-1234-123456789abc";
let available = false, started = 0, checked = 0, created = 0, exists = false;
globalThis.__codRouteFixture = {
  auth: async () => ({ admin: {}, session: { shop } }),
  db: { partialCodIntent: { findUnique: async () => exists ? { id } : null, count: async () => 0,
    create: async ({ data }) => { created++; return { ...data, id }; } } },
  settings: async () => ({ enabled: false, advancePercent: 20, revision: 1 }),
  quote: async () => ({ lines: [], shippingAddress: {}, accountingSnapshot: {},
    amounts: { orderPaise: 100000, payableNowPaise: 28000, collectOnDeliveryPaise: 80000 } }),
  available: () => available,
  start: async (actualShop, actualId) => { assert.equal(actualShop, shop); assert.equal(actualId, id); started++;
    return { orderId: "TESTORDER", txnToken: "TRANSIENT_TEST_TOKEN", amount: "280.00" }; },
  progress: async (actualShop, actualId) => { assert.equal(actualShop, shop); assert.equal(actualId, id); checked++;
    return { state: "payment_pending", payableNowPaise: 28000, collectPaise: 80000 }; },
};
try {
  const stubs = {
    "db.server": "export default globalThis.__codRouteFixture.db;",
    "shopify.server": "export const authenticate = {public:{appProxy:(request)=>globalThis.__codRouteFixture.auth(request)}};",
    "partial-cod-settings.server": "export const loadCodSettings=(...args)=>globalThis.__codRouteFixture.settings(...args);",
    "partial-cod-quote.server": "export const calculateCodQuote=(...args)=>globalThis.__codRouteFixture.quote(...args);",
    "partial-cod-paytm-runtime.server": `export const codCheckoutAvailable=(...args)=>globalThis.__codRouteFixture.available(...args);
      export const startConfiguredCodCheckout=(...args)=>globalThis.__codRouteFixture.start(...args);
      export const progressConfiguredCodCheckout=(...args)=>globalThis.__codRouteFixture.progress(...args);`,
  };
  await build({ entryPoints: ["app/routes/signature-day.partial-cod.ts"], bundle: true, packages: "external", platform: "node", format: "esm",
    outfile: new URL("route.mjs", output).pathname, plugins: [{ name: "test-route", setup(builder) {
      builder.onResolve({ filter: /\.server$/ }, args => {
        const key = args.path.split("/").pop();
        return stubs[key] ? { path: key, namespace: "test" } : undefined;
      });
      builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents: stubs[args.path] }));
    } }] });
  const { action, loader } = await import(new URL("route.mjs", output));
  const call = (body, type = "application/json", method = "POST") => action({ request: new Request("https://example.test/signature-day/partial-cod", {
    method, headers: { "Content-Type": type }, body: typeof body === "string" ? body : JSON.stringify(body) }) });
  assert.equal((await loader({ request: new Request("https://example.test") })).status, 200);
  assert.equal((await call({}, undefined, "PUT")).status, 405);
  assert.equal((await call({}, "application/json-extra")).status, 415);
  assert.equal((await call("é".repeat(66000))).status, 413);
  const input = { intent: "create_quote", requestKey: id };
  assert.equal((await call(input)).status, 503); assert.equal(created, 0);
  const review = await (await call({ ...input, intent: "review_quote" })).json();
  assert.equal(review.checkoutAvailable, false); assert.equal("access" in review, false);
  available = true;
  const quote = await (await call(input)).json();
  assert.equal(quote.checkoutAvailable, true); assert.equal(typeof quote.access, "string");
  exists = true; assert.equal((await call(input)).status, 409); exists = false;
  for (const access of [id, "wrong", quote.access + "tamper"])
    assert.equal((await call({ intent: "begin_payment", access })).status, 400);
  assert.equal(started, 0);
  const begin = await (await call({ intent: "begin_payment", access: quote.access, id: "attacker-id", payableNowPaise: 1 })).json();
  assert.equal(begin.checkout.amount, "280.00"); assert.equal(started, 1);
  available = false; // Recovery is independent of whether new checkout is enabled.
  assert.equal((await call({ intent: "payment_status", access: quote.access })).status, 200);
  assert.equal(checked, 1);
  globalThis.__codRouteFixture.auth = async () => ({ admin: {}, session: { shop: "other.myshopify.com" } });
  assert.equal((await call({ intent: "payment_status", access: quote.access })).status, 400); assert.equal(checked, 1);
  globalThis.__codRouteFixture.auth = async () => { throw new Response("Unauthorized", { status: 401 }); };
  await assert.rejects(call({ intent: "payment_status", access: quote.access }), error => error.status === 401);
  console.log("Checkout route app-proxy authentication, method/content/byte limits, disabled/review quotes, signed capability, cross-shop rejection, replay and browser amount/ID exclusion passed.");
} finally {
  if (saved === undefined) delete process.env.SHOPIFY_API_SECRET; else process.env.SHOPIFY_API_SECRET = saved;
  delete globalThis.__codRouteFixture; await rm(output, { recursive: true, force: true });
}
