import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const translations = JSON.parse(await readFile("extensions/cartwala-personalizer/locales/en.default.json", "utf8")).advance_cod.messages;
const code = await readFile("extensions/cartwala-personalizer/assets/cartwala-advance-cod.js", "utf8");
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
async function fixture({ saved = "", available = true, brokenStorage = false } = {}) {
  const element = () => ({ hidden: false, disabled: false, textContent: "", listeners: {},
    addEventListener(name, fn) { this.listeners[name] = fn; } });
  const form = element(), status = element(), pay = element(), recheck = element(), submit = element();
  const root = { ...element(), hidden: true, dataset: {}, setAttribute() {}, removeAttribute() {},
    querySelector: selector => ({ "[data-cw-cod-i18n]": { textContent: JSON.stringify(translations).replaceAll("{{ balance }}", "__BALANCE__").replaceAll("{{ now }}", "__NOW__") }, form, "[data-cw-cod-status]": status, "[data-cw-cod-pay]": pay,
      "[data-cw-cod-recheck]": recheck })[selector], querySelectorAll: () => [submit, pay, recheck] };
  pay.hidden = true; recheck.hidden = true;
  const storage = new Map(saved ? [["cartwala-advance-cod-v1", saved]] : []);
  const calls = []; let invocations = 0, checkoutConfig, release;
  const checkoutWait = new Promise(resolve => { release = resolve; });
  const window = { Shopify: { routes: { root: "/" } }, Paytm: { CheckoutJS: {
    onLoad(fn) { fn(); }, async init(config) { checkoutConfig = config; }, invoke() { invocations++; },
  } } };
  const ctx = {
    window, Intl, Promise, Object, String, setTimeout, clearTimeout, crypto: { randomUUID },
    FormData: class { *[Symbol.iterator]() { yield* Object.entries({ firstName: "Test", lastName: "", address1: "Test street",
      address2: "", city: "Test city", provinceCode: "TS", zip: "500001", phone: "9000000000" }); } },
    sessionStorage: { getItem: key => storage.get(key) || null,
      setItem: (key, value) => { if (brokenStorage) throw new Error(); storage.set(key, value); } },
    document: { querySelector: () => root, createElement: () => ({}), head: { append: script => { script.onload(); } } },
    fetch: async (url, options) => {
      const body = options?.body ? JSON.parse(options.body) : null;
      calls.push({ url, body });
      let value = { checkoutAvailable: available };
      if (url === "/cart.js") value = { total_discount: 0, items: [{ variant_id: 123, quantity: 1,
        properties: { _preview: "https://example.test/preview.png" } }] };
      if (body?.intent === "create_quote") value = { checkoutAvailable: true, access: "TEST_CAPABILITY",
        amounts: { payableNowPaise: 28000, collectOnDeliveryPaise: 80000 } };
      if (body?.intent === "begin_payment") {
        await checkoutWait;
        value = { checkout: { mid: "TESTMERCHANT1234567890", environment: "staging", orderId: "TESTORDER",
          txnToken: "TEST_ONLY_TRANSIENT_TOKEN", amount: "280.00" } };
      }
      if (body?.intent === "payment_status") value = { state: "order_confirmed", payableNowPaise: 28000, collectPaise: 80000 };
      return { ok: true, json: async () => value };
    },
  };
  vm.runInNewContext(code, ctx); await flush();
  return { root, form, status, pay, recheck, storage, calls, release,
    invoked: () => invocations, config: () => checkoutConfig };
}
const f = await fixture();
assert.equal(f.root.hidden, false);
f.form.listeners.submit({ preventDefault() {} }); await flush();
assert.match(f.status.textContent, /280/); assert.match(f.status.textContent, /800/);
assert.equal(f.form.hidden, true);
const quote = f.calls.find(x => x.body?.intent === "create_quote").body;
assert.equal(quote.address.phone, "+919000000000");
assert.equal(quote.lines[0].properties[0].name, "_preview");
for (let i = 0; i < 12; i++) f.pay.listeners.click();
await flush();
assert.equal(f.calls.filter(x => x.body?.intent === "begin_payment").length, 1);
assert.equal(f.storage.get("cartwala-advance-cod-v1"), "TEST_CAPABILITY");
f.release(); await flush();
assert.equal(f.invoked(), 1);
assert.equal(f.config().merchant.redirect, false);
assert.equal(f.config().data.tokenType, "TXN_TOKEN");
// A spoofed browser status supplies no proof: it only triggers our server status endpoint.
f.config().handler.transactionStatus({ STATUS: "TXN_SUCCESS", TXNAMOUNT: "0.01" }); await flush();
assert.match(f.status.textContent, /order is confirmed/);
assert.equal(f.calls.filter(x => x.body?.intent === "begin_payment").length, 1);
assert.equal([...f.storage.values()].some(x => x.includes("TRANSIENT_TOKEN")), false);
const resumed = await fixture({ saved: "TEST_CAPABILITY", available: false });
assert.equal(resumed.root.hidden, false); assert.equal(resumed.form.hidden, true);
assert.equal(resumed.calls.filter(x => x.body?.intent === "payment_status").length, 1);
assert.equal(resumed.calls.some(x => x.body?.intent === "begin_payment"), false);
assert.equal((await fixture({ available: false })).root.hidden, true);
const noStorage = await fixture({ brokenStorage: true });
noStorage.form.listeners.submit({ preventDefault() {} }); await flush();
assert.equal(noStorage.pay.hidden, true);
assert.equal(noStorage.calls.some(x => x.body?.intent === "begin_payment"), false);
console.log("Storefront totals/artwork, immediate busy guard, 12-click single initiation, transient Paytm token, server-only confirmation, refresh recovery and unavailable/storage guards passed.");
