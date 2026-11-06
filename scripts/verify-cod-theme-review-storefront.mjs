import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { setImmediate } from "node:timers";
const source = await fs.readFile("docs/theme-review/preview-nov6/assets/cw-cod-review.js", "utf8");
async function scenario(initial, refreshed = initial, opts={}) {
  const events = {}, calls = [], locations = [], values = {}, storage=opts.storage||new Map();
  const next = { disabled: true }, status = {}, amounts = {}, breakdown = {}, fields=[{disabled:false}], address={querySelectorAll:()=>fields}, recheck={addEventListener:(name,handler)=>{events.recheck=handler;}}, items={replaceChildren(){},append(){}};
  const form = { addEventListener: (name, handler) => { events.form = handler; } };
  const radio = value => ({ value, checked: value === "prepaid", disabled: false, addEventListener: (name, handler) => { events[value] = handler; } });
  const radios = [radio("prepaid"), radio("cod")];
  const dialog = { dataset: { themeId: "188248228025" }, open: false,
    showModal() { this.open = true; }, close() { this.open = false; }, contains: e => e === form,
    addEventListener: (name, handler) => { events[name] = handler; },
    querySelectorAll: selector => selector.startsWith("input") ? radios : [values[selector] ||= {}],
    querySelector: selector => ({ 'script[type="application/json"]': { textContent: JSON.stringify({}) },
      form, '[role="status"]': status, '[data-cod-next]': next, '[data-cod-amounts]': amounts,
      '[data-cod-breakdown]': breakdown, '[data-cod-address]': address, '[data-cod-recheck]':recheck, '[data-cod-items]':items, '[data-cod-discount]':values.discount||={}, '[data-cod-percent]': values.percent ||= {},
      '[data-cod-close]': { addEventListener: (name, handler) => { events.close = handler; } } })[selector],
  };
  const location = { hostname:"cartwala.in", origin: "https://cartwala.in", href: "https://cartwala.in/cart", assign: value => locations.push(value) };

  const window = { HTMLDialogElement: function () {}, Shopify: { routes: { root: "/" } }, location,
    addEventListener: (name, handler) => { events[name] = handler; } };
  const document = { createElement:()=>({append(){}}), querySelector: () => dialog, addEventListener: (name, handler) => { events[name] = handler; } };
  await vm.runInNewContext(source, { window, document, location, URL, Intl, AbortSignal, AbortController, setTimeout, clearTimeout, sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}, crypto:webcrypto, TextEncoder, Uint8Array, FormData:class { *[Symbol.iterator](){yield ["phone","9876543210"];yield ["provinceCode","TS"];yield ["firstName","TEST ONLY"];} },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("cod-review")) {
        assert.equal(url, "/apps/cartwala-signature-day-1/cod-review");
        const config = refreshed;
        if (config instanceof Error) throw config;
        return { ok: true, json: async () => config };
      }
      if(url.endsWith("native-cod")){
        if(options.method==='POST')return {ok:true,json:async()=>opts.post?opts.post(JSON.parse(options.body)):({checkoutAvailable:true,access:'TEST_CAPABILITY',checkoutUrl:'https://cartwala.in/80379314361/invoices/test123',amounts:{orderPaise:40000,advancePaise:8000,feePaise:5000,payableNowPaise:13000,collectOnDeliveryPaise:32000,totalPaise:45000}})};
        return {ok:true,json:async()=>({checkoutAvailable:!!opts.native,enabled:true,revision:initial.revision,advancePercent:refreshed.advancePercent,codFeePaise:refreshed.codFeePaise})};
      }
      assert.equal(url, "/cart.js");
      return { ok: true, json: async () => ({ total_price: 40000, currency: "INR", items: [{variant_id:49065013412025,key:"fixture",properties:{Artwork:"TEST_ONLY"},product_title:"Fixture",quantity:1,final_line_price:40000}] }) };
    } });
  const element = { tagName: "A", href: "https://cartwala.in/checkout", disabled: false, closest() { return this; } };
  async function click() {
    events.click?.({ button: 0, target: element, preventDefault() {}, stopImmediatePropagation() {} });
    await new Promise(resolve => setImmediate(resolve));
  }
  return { dialog, events, calls, locations, next, radios, values, fields, click, storage };
}
const valid = { available: true, enabled: true, themeId: "188248228025", paymentsEnabled: false, advancePercent: 20, codFeePaise: 5000 };
for (const initial of [{ ...valid, enabled: false }, { ...valid, themeId: "other" }, { ...valid, codFeePaise: -1 }, new Error("offline")]) {
  const state = await scenario(initial);
  await state.click();assert.equal(state.dialog.open,false);assert.deepEqual(state.locations,["https://cartwala.in/checkout"]);
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
assert.equal(on.fields[0].disabled,false);
await on.events.form({ preventDefault() {} });
assert.deepEqual(on.locations, []);
on.radios[0].checked = true; on.radios[1].checked = false; on.events.prepaid();
await on.events.form({ preventDefault() {} });
assert.deepEqual(on.locations, ["https://cartwala.in/checkout"]);
assert.equal(on.fields[0].disabled,true);
assert(on.calls.every(call => !call.options.method || call.options.method === "GET"));
console.log("Theme scope, OFF/config failure bypass, refreshed percentage/charge, right-side summary, address field validity, normal prepaid continuation and gated advance payment checks passed.");

const payment=await scenario(valid,valid,{native:true});await payment.click();
payment.radios[0].checked=false;payment.radios[1].checked=true;payment.events.cod();
await Promise.all(Array.from({length:12},()=>payment.events.form({preventDefault(){}})));
assert.equal(payment.calls.filter(c=>c.options.method==='POST').length,1);
const sent=JSON.parse(payment.calls.find(c=>c.options.method==='POST').options.body);
assert.equal(sent.address.phone,'+919876543210');assert.equal(sent.lines[0].properties[0].value,'TEST_ONLY');
assert.equal(payment.values['[data-cod-now]'].textContent,'₹130.00');
assert.deepEqual(payment.locations,[]);
await payment.events.form({preventDefault(){}});
assert.deepEqual(payment.locations,['https://cartwala.in/80379314361/invoices/test123']);
const restored=await scenario(valid,valid,{native:true,storage:payment.storage,post:input=>input.intent==='payment_status'?{state:'completed'}:{}});await restored.click();
await restored.events.recheck();assert.deepEqual(restored.locations,[]);
assert.equal(restored.calls.filter(c=>c.options.method==='POST'&&JSON.parse(c.options.body).intent==='create_quote').length,0);
const foreign=await scenario(valid,valid,{native:true,post:()=>({checkoutAvailable:true,access:'TEST_CAPABILITY',checkoutUrl:'https://other.test/80379314361/invoices/test123',amounts:{}})});await foreign.click();foreign.radios[0].checked=false;foreign.radios[1].checked=true;foreign.events.cod();await foreign.events.form({preventDefault(){}});assert.deepEqual(foreign.locations,[]);assert.equal(foreign.next.disabled,true);
console.log('Gated native integration: twelve-click guard, copied artwork, normalized phone, confirmed amounts, explicit invoice continuation, refresh recovery and foreign URL rejection passed. Fixture requests only.');
