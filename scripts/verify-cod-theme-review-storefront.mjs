import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { setImmediate } from "node:timers";
const source = await fs.readFile("docs/theme-review/preview-nov6/assets/cw-cod-review.js", "utf8");
async function scenario(initial, refreshed = initial) {
  const events = {}, calls = [], locations = [], values = {};
  const next = { disabled: true }, status = {}, amounts = {}, breakdown = {};
  const form = { addEventListener: (name, handler) => { events.form = handler; } };
  const radio = value => ({ value, checked: value === "prepaid", disabled: false, addEventListener: (name, handler) => { events[value] = handler; } });
  const radios = [radio("prepaid"), radio("cod")];
  const dialog = { dataset: { themeId: "188248228025" }, open: false,
    showModal() { this.open = true; }, close() { this.open = false; }, contains: e => e === form,
    addEventListener: (name, handler) => { events[name] = handler; },
    querySelectorAll: selector => selector.startsWith("input") ? radios : [values[selector] ||= {}],
    querySelector: selector => ({ 'script[type="application/json"]': { textContent: JSON.stringify({}) },
      form, '[role="status"]': status, '[data-cod-next]': next, '[data-cod-amounts]': amounts,
      '[data-cod-breakdown]': breakdown, '[data-cod-percent]': values.percent ||= {},
      '[data-cod-close]': { addEventListener: (name, handler) => { events.close = handler; } } })[selector],
  };
  const location = { origin: "https://cartwala.in", href: "https://cartwala.in/cart", assign: value => locations.push(value) };
  let configurations = 0;
  const window = { HTMLDialogElement: function () {}, Shopify: { routes: { root: "/" } }, location,
    addEventListener: (name, handler) => { events[name] = handler; } };
  const document = { querySelector: () => dialog, addEventListener: (name, handler) => { events[name] = handler; } };
  await vm.runInNewContext(source, { window, document, location, URL, Intl, AbortSignal, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("cod-review")) {
        assert.equal(url, "/apps/cartwala-signature-day-1/cod-review");
        const config = configurations++ ? refreshed : initial;
        if (config instanceof Error) throw config;
        return { ok: true, json: async () => config };
      }
      assert.equal(url, "/cart.js");
      return { ok: true, json: async () => ({ total_price: 40000, currency: "INR", items: [{}] }) };
    } });
  const element = { tagName: "A", href: "https://cartwala.in/checkout", disabled: false, closest() { return this; } };
  async function click() {
    events.click?.({ button: 0, target: element, preventDefault() {}, stopImmediatePropagation() {} });
    await new Promise(resolve => setImmediate(resolve));
  }
  return { dialog, events, calls, locations, next, radios, values, click };
}
const valid = { available: true, enabled: true, themeId: "188248228025", paymentsEnabled: false, advancePercent: 20, codFeePaise: 5000 };
for (const initial of [{ ...valid, enabled: false }, { ...valid, themeId: "other" }, { ...valid, paymentsEnabled: true }, { ...valid, codFeePaise: -1 }, new Error("offline")]) {
  const state = await scenario(initial);
  assert.equal(state.events.click, undefined);
}
for (const refreshed of [{ ...valid, enabled: false }, new Error("offline")]) {
  const state = await scenario(valid, refreshed);
  await state.click();
  assert.equal(state.dialog.open, false);
  assert.deepEqual(state.locations, ["https://cartwala.in/checkout"]);
}
const on = await scenario(valid, { ...valid, advancePercent: 50, codFeePaise: 8000 });
await on.click();
assert.equal(on.dialog.open, true);
assert.equal(on.values['[data-cod-now]'].textContent, "₹280.00");
assert.equal(on.values['[data-cod-balance]'].textContent, "₹200.00");
assert.equal(on.values['[data-cod-total]'].textContent, "₹480.00");
on.radios[0].checked = false; on.radios[1].checked = true; on.events.cod();
assert.equal(on.next.disabled, true);
on.events.form({ preventDefault() {} });
assert.deepEqual(on.locations, []);
on.radios[0].checked = true; on.radios[1].checked = false; on.events.prepaid();
on.events.form({ preventDefault() {} });
assert.deepEqual(on.locations, ["https://cartwala.in/checkout"]);
assert(on.calls.every(call => !call.options.method || call.options.method === "GET"));
console.log("Theme restriction, central settings, fresh OFF/config-failure bypass, changed amounts, prepaid continuation and disabled payment checks passed.");
