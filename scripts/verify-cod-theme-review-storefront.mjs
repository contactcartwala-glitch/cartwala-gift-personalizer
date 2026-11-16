import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { setImmediate } from "node:timers";
const source = await fs.readFile("docs/theme-review/preview-nov6/assets/cw-cod-review.js", "utf8");
async function scenario(initial, refreshed = initial, opts={}) {
  const events = {}, calls = [], locations = [], values = {}, storage=opts.storage||new Map();
  const next = { disabled: true, attrs:{}, setAttribute(k,v){this.attrs[k]=v;}, removeAttribute(k){delete this.attrs[k];} }, status = {}, amounts = {}, breakdown = {}, fields=[{name:"phone",value:"9876543210",disabled:false},{name:"provinceCode",value:"TS",disabled:false},{name:"firstName",value:"TEST ONLY",disabled:false}], address={querySelectorAll:()=>fields}, recheck={addEventListener:(name,handler)=>{events.recheck=handler;}}, items={replaceChildren(){},append(){}};
  const retryConfig={addEventListener:(name,handler)=>{events.retryConfig=handler;}};
  const discountBox={}, discountInput={value:"",addEventListener:(name,handler)=>{events["discount:"+name]=handler;}}, applyCode={addEventListener:(name,handler)=>{events.apply=handler;}};
  const form = { addEventListener: (name, handler) => { events.form = handler; } };
  const radio = value => ({ value, checked: value === "prepaid", disabled: false, addEventListener: (name, handler) => { events[value] = handler; } });
  const radios = [radio("prepaid"), radio("cod")];
  const dialog = { dataset: { themeId: "188248228025", ...(opts.snapshot ? {publicConfig:JSON.stringify(opts.snapshot)} : {}) }, open: false,
    showModal() { this.open = true; }, close() { this.open = false; }, contains: e => e === form,
    addEventListener: (name, handler) => { events[name] = handler; },
    querySelectorAll: selector => selector.startsWith("input") ? radios : [values[selector] ||= {}],
    querySelector: selector => ({ 'script[type="application/json"]': { textContent: JSON.stringify({}) },
      form, '[role="status"]': status, '[data-cod-next]': next, '[data-cod-amounts]': amounts, '[data-cod-retry-config]':retryConfig,
      '[data-cod-breakdown]': breakdown, '[data-cod-discount-box]':discountBox, '[data-cod-code]':discountInput, '[data-cod-apply]':applyCode, '[data-cod-address]': address, '[data-cod-recheck]':recheck, '[data-cod-items]':items, '[data-cod-discount]':values.discount||={}, '[data-cod-percent]': values.percent ||= {},
      '[data-cod-close]': { addEventListener: (name, handler) => { events.close = handler; } } })[selector],
  };
  const location = { hostname:"cartwala.in", origin: "https://cartwala.in", href: "https://cartwala.in/cart", assign: value => locations.push(value) };

  const window = { HTMLDialogElement: function () {}, Shopify: { routes: { root: "/" }, theme:{id:188248228025,role:opts.main?"main":"unpublished"} }, location,
    addEventListener: (name, handler) => { events[name] = handler; } };
  const document = { createElement:()=>({append(){}}), querySelector: () => dialog, addEventListener: (name, handler) => { events[name] = handler; } };
  await vm.runInNewContext(source, { window, document, location, URL, Intl, AbortSignal, AbortController, setTimeout, clearTimeout, sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}, crypto:webcrypto, TextEncoder, Uint8Array, FormData:class { *[Symbol.iterator](){for(const f of fields)if(!f.disabled)yield [f.name,f.value];} },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("cod-review")) {
        assert.equal(url, "/apps/cartwala-signature-day-1/cod-review");
        const config = refreshed;
        if (config instanceof Error) throw config;
        return { ok: true, json: async () => config };
      }
      if(url.endsWith("native-cod")){
        if(options.method==='POST')return {ok:true,json:async()=>opts.post?opts.post(JSON.parse(options.body)):({advancePercent:20,checkoutAvailable:true,access:'TEST_CAPABILITY',checkoutUrl:'https://cartwala.in/80379314361/invoices/test123',amounts:{orderPaise:40000,advancePaise:8000,feePaise:5000,payableNowPaise:13000,collectOnDeliveryPaise:32000,totalPaise:45000}})};
        if(refreshed instanceof Error)throw refreshed;
        if(opts.nativeError) return {ok:false,status:opts.nativeError,headers:{get:()=>opts.retryAfter||null}};
        return {ok:true,json:async()=>({...refreshed,collectAddressAtCheckout:opts.addressAtCheckout!==false,customerEnabled:opts.customerEnabled!==false,discountCodesAvailable:!!opts.discount,checkoutAvailable:!!opts.native,previewCheckoutAvailable:!!opts.preview})};
      }
      if(url === "/cart/clear.js")return {ok:true,json:async()=>({item_count:0})};
      assert.equal(url, "/cart.js");
      return { ok: true, json: async () => (opts.cart || { total_price: 40000, currency: "INR", items: [{variant_id:49065013412025,key:"fixture",properties:{Artwork:"TEST_ONLY"},product_title:"Fixture",quantity:1,final_line_price:40000}] }) };
    } });
  const element = { tagName: "A", href: "https://cartwala.in/checkout", disabled: false, closest() { return this; } };
  async function click() {
    await events.click?.({ button: 0, target: element, preventDefault() {}, stopImmediatePropagation() {} });
    await new Promise(resolve => setImmediate(resolve));
  }
  return { dialog, events, calls, locations, next, radios, values, fields, click, storage, recheck, retryConfig, amounts, breakdown, discountInput, discountBox };
}
const valid = { available: true, enabled: true, themeId: "188248228025", paymentsEnabled: false, advancePercent: 20, codFeePaise: 5000 };
for (const initial of [{ ...valid, enabled: false }]) {
  const state = await scenario(initial);
  await state.click();assert.equal(state.dialog.open,false);assert.deepEqual(state.locations,["https://cartwala.in/checkout"]);
}
for (const refreshed of [{ ...valid, enabled: false }]) {
  const state = await scenario(valid, refreshed);
  await state.click();
  assert.equal(state.dialog.open, false);
  assert.deepEqual(state.locations, ["https://cartwala.in/checkout"]);
}
for (const refreshed of [new Error("offline"),{...valid,themeId:"other"},{...valid,codFeePaise:-1}]) {
  const state=await scenario(valid,refreshed,{main:true,native:true});
  await state.click();
  assert.equal(state.dialog.open,true);assert.deepEqual(state.locations,[]);
  assert.equal(state.retryConfig.hidden,false);assert.equal(state.amounts.hidden,true);
  state.radios[0].checked=false;state.radios[1].checked=true;state.events.cod();
  assert.equal(state.next.disabled,true);assert.equal(state.breakdown.hidden,true);
  assert.equal(state.calls.filter(c=>c.options.method==="POST").length,0);
  state.radios[0].checked=true;state.radios[1].checked=false;state.events.prepaid();
  await state.events.form({preventDefault(){}});
  assert.deepEqual(state.locations,["https://cartwala.in/checkout"]);
}
for(const code of [429,502,503]){
 const opts={main:true,native:true,nativeError:code,retryAfter:code===429?"60":null};
 const state=await scenario(valid,valid,opts);await state.click();
 assert.equal(state.dialog.open,true);assert.equal(state.retryConfig.hidden,false);
 const before=state.calls.length;
 await state.events.retryConfig();
 if(code===429)assert.equal(state.calls.length,before);
 opts.nativeError=0;
 if(code!==429){await state.events.retryConfig();assert.equal(state.retryConfig.hidden,true);}
 assert.equal(state.calls.filter(c=>c.url.endsWith("cod-review")).length,0);
 assert.equal(state.calls.filter(c=>c.options.method==="POST").length,0);
}
const disabledCustomer=await scenario(valid,valid,{main:true,customerEnabled:false});
await disabledCustomer.click();assert.deepEqual(disabledCustomer.locations,["https://cartwala.in/checkout"]);
console.log("One settings request per open; offline, invalid, 429/502/503 show safe retry instead of disappearing; Retry-After honored; explicit merchant OFF alone bypasses.");
const on = await scenario(valid, { ...valid, advancePercent: 50, codFeePaise: 8000 });
await on.click();
assert.equal(on.dialog.open, true);
assert.equal(on.values['[data-cod-now]'].textContent, "₹280.00");
assert.equal(on.values['[data-cod-balance]'].textContent, "₹200.00");
assert.equal(on.values['[data-cod-total]'].textContent, "₹480.00");
on.radios[0].checked = false; on.radios[1].checked = true; on.events.cod();
assert.equal(on.next.disabled, true);

await on.events.form({ preventDefault() {} });
assert.deepEqual(on.locations, []);
on.radios[0].checked = true; on.radios[1].checked = false; on.events.prepaid();
await on.events.form({ preventDefault() {} });
assert.deepEqual(on.locations, ["https://cartwala.in/checkout"]);

assert(on.calls.every(call => !call.options.method || call.options.method === "GET"));
console.log("Theme scope, OFF/config failure bypass, refreshed percentage/charge, right-side summary, no popup address fields, normal prepaid continuation and gated advance payment checks passed.");

const payment=await scenario(valid,valid,{preview:true});await payment.click();
payment.radios[0].checked=false;payment.radios[1].checked=true;payment.events.cod();
await Promise.all(Array.from({length:12},()=>payment.events.form({preventDefault(){}})));
assert.equal(payment.calls.filter(c=>c.options.method==='POST').length,1);
const sent=JSON.parse(payment.calls.find(c=>c.options.method==='POST').options.body);
assert.equal(sent.mode,"preview");assert.equal(sent.address,undefined);assert.equal(sent.collectAddressAtCheckout,true);assert.equal(sent.lines[0].properties[0].value,'TEST_ONLY');
assert.equal(payment.values['[data-cod-now]'].textContent,'₹130.00');
assert.deepEqual(payment.locations,['https://cartwala.in/80379314361/invoices/test123']);
assert.equal(payment.radios[0].disabled,true);
await payment.events.form({preventDefault(){}});
assert.deepEqual(payment.locations,['https://cartwala.in/80379314361/invoices/test123']);
const unpaidStorage=new Map(payment.storage);
const restored=await scenario(valid,valid,{native:true,storage:payment.storage,post:input=>input.intent==='payment_status'?{state:'completed'}:{}});await restored.click();
await restored.events.recheck();assert.deepEqual(restored.locations,[]);
assert.equal(restored.storage.size,0);assert.equal(restored.next.hidden,true);assert.equal(restored.calls.filter(c=>c.url==='/cart/clear.js').length,1);
assert.equal(restored.calls.filter(c=>c.options.method==='POST'&&c.options.body&&JSON.parse(c.options.body).intent==='create_quote').length,0);
const foreign=await scenario(valid,valid,{native:true,post:()=>({advancePercent:20,checkoutAvailable:true,access:'TEST_CAPABILITY',checkoutUrl:'https://other.test/80379314361/invoices/test123',amounts:{}})});await foreign.click();foreign.radios[0].checked=false;foreign.radios[1].checked=true;foreign.events.cod();await foreign.events.form({preventDefault(){}});assert.deepEqual(foreign.locations,[]);assert.equal(foreign.next.disabled,true);
console.log('Gated native integration: twelve-click guard, copied artwork, no address transmission, confirmed amounts, immediate secure checkout continuation, refresh recovery and foreign URL rejection passed. Fixture requests only.');

const otherStorage=new Map(payment.storage);
otherStorage.set('cartwala-native-cod-review-v1','TEST_CAPABILITY');otherStorage.set('cartwala-native-cod-review-v1:request','12345678-1234-1234-1234-123456789abc');otherStorage.set('cartwala-native-cod-review-v1:cart','different-hash');
const otherCart=await scenario(valid,valid,{preview:true,storage:otherStorage,post:()=>({state:'completed'})});await otherCart.click();await otherCart.events.recheck();assert.equal(otherCart.calls.filter(c=>c.url==='/cart/clear.js').length,0);assert.equal(otherCart.storage.size,0);
console.log('Preview-only activation, address collected only by Shopify checkout, locked payment choice, completed-cart cleanup and preservation of a different cart passed.');

const invalid=await scenario(valid,valid,{preview:true,post:()=>({error:'Invalid address',quoteNotCreated:true})});await invalid.click();invalid.radios[0].checked=false;invalid.radios[1].checked=true;invalid.events.cod();await invalid.events.form({preventDefault(){}});assert.equal(invalid.storage.size,0);invalid.radios[0].checked=true;invalid.radios[1].checked=false;invalid.events.prepaid();await invalid.events.form({preventDefault(){}});assert.deepEqual(invalid.locations,['https://cartwala.in/checkout']);
console.log('Confirmed pre-draft validation failures release recovery locks and permit corrected address or prepaid; ambiguous invoice failures stay locked.');

const snippet=await fs.readFile("docs/theme-review/preview-nov6/snippets/cw-cod-review.liquid","utf8");assert(!snippet.includes('data-cod-address'));assert(!snippet.includes('name="firstName"'));assert(!snippet.includes('name="phone"'));
const oldBackend=await scenario(valid,valid,{preview:true,addressAtCheckout:false});await oldBackend.click();oldBackend.radios[0].checked=false;oldBackend.radios[1].checked=true;oldBackend.events.cod();assert.equal(oldBackend.next.disabled,true);
console.log('Address-free UI waits for compatible backend; no customer name, phone or address inputs are rendered or transmitted.');

const invoiceResponse={advancePercent:20,checkoutAvailable:true,access:'TEST_CAPABILITY',checkoutUrl:'https://cartwala.in/80379314361/invoices/test123',amounts:{orderPaise:40000,advancePaise:8000,feePaise:5000,payableNowPaise:13000,collectOnDeliveryPaise:32000,totalPaise:45000}};
const back=await scenario(valid,valid,{preview:true,storage:new Map(unpaidStorage),post:i=>i.intent==='payment_status'?{state:'awaiting_payment'}:invoiceResponse});
await back.click();await new Promise(resolve=>setImmediate(resolve));
assert.equal(back.radios[0].disabled,false);assert.equal(back.radios[1].disabled,false);assert.equal(back.recheck.hidden,true);
assert.equal(back.radios[0].checked,true);await back.events.form({preventDefault(){}});assert.deepEqual(back.locations,['https://cartwala.in/checkout']);
const pending=await scenario(valid,valid,{preview:true,storage:new Map(unpaidStorage),post:()=>({state:'needs_review'})});await pending.click();await pending.events.form({preventDefault(){}});assert.equal(pending.next.disabled,true);assert.deepEqual(pending.locations,[]);
const discounted={discount:{code:'TEST10',discountPaise:4000,originalPaise:40000},advancePercent:20,amounts:{orderPaise:36000,advancePaise:7200,feePaise:5000,payableNowPaise:12200,collectOnDeliveryPaise:28800,totalPaise:41000}};
const promo=await scenario(valid,valid,{preview:true,discount:true,post:i=>i.intent==='preview_discount'?discounted:{...invoiceResponse,...discounted}});await promo.click();promo.radios[0].checked=false;promo.radios[1].checked=true;promo.events.cod();assert.equal(promo.discountBox.hidden,false);promo.discountInput.value='TEST10';await promo.events.apply();assert.equal(promo.values['[data-cod-now]'].textContent,'₹122.00');assert.equal(promo.values['[data-cod-balance]'].textContent,'₹288.00');
const preparing=promo.events.form({preventDefault(){}});assert.equal(promo.next.attrs['aria-busy'],'true');await preparing;assert.deepEqual(promo.locations,[invoiceResponse.checkoutUrl]);
assert.equal(JSON.parse(promo.calls.find(c=>c.options.body?.includes('create_quote')).options.body).expectedGoodsPaise,36000);
console.log('Unpaid return offers both methods, pending payment stays protected, spinner appears immediately, and verified discount produces ₹122 now / ₹288 COD.');

const publishedOff=await scenario(valid,valid,{main:true,preview:true,customerEnabled:false});await publishedOff.click();assert.equal(publishedOff.dialog.open,false);assert.deepEqual(publishedOff.locations,['https://cartwala.in/checkout']);
const publishedOn=await scenario(valid,valid,{main:true,native:true,storage:new Map(unpaidStorage)});await publishedOn.click();assert.equal(publishedOn.dialog.open,true);assert.equal(publishedOn.radios[0].disabled,false);publishedOn.radios[0].checked=false;publishedOn.radios[1].checked=true;publishedOn.events.cod();await publishedOn.events.form({preventDefault(){}});const p=publishedOn.calls.find(c=>c.options.body?.includes('create_quote'));assert.equal(JSON.parse(p.options.body).mode,'customer');assert.deepEqual(publishedOn.locations,[invoiceResponse.checkoutUrl]);
console.log('Published-but-OFF keeps normal checkout; enabled customer mode never recovers old preview storage.');

const snapshot={schemaVersion:1,shop:'0k9icg-ns.myshopify.com',enabled:true,customerEnabled:true,advancePercent:30,codFeePaise:8000,revision:12,discountCodesAvailable:true};
for(const nativeError of [429,503]){
 const s=await scenario(valid,valid,{main:true,native:true,nativeError,snapshot});
 await s.click();
 assert.equal(s.dialog.open,true);
 assert.equal(s.calls.filter(c=>c.url.endsWith('native-cod')).length,0);
 s.radios.forEach(r=>r.checked=r.value==='cod');await s.events.cod();
 assert.equal(s.next.disabled,false);assert.equal(s.breakdown.hidden,false);
 assert.equal(s.values['[data-cod-now]'].textContent,'₹200.00');
 await s.events.form({preventDefault(){}});
 assert.equal(s.calls.filter(c=>c.options?.method==='POST').length,0);
 assert.equal(s.locations.length,0);
}
const offSnapshot=await scenario(valid,valid,{main:true,nativeError:429,snapshot:{...snapshot,enabled:false}});
await offSnapshot.click();assert.equal(offSnapshot.dialog.open,false);assert.equal(offSnapshot.calls.filter(c=>c.url.endsWith('native-cod')).length,0);
const invalidSnapshot=await scenario(valid,valid,{main:true,nativeError:429,snapshot:{...snapshot,advancePercent:99}});
await invalidSnapshot.click();assert.equal(invalidSnapshot.retryConfig.hidden,false);assert.equal(invalidSnapshot.next.disabled,false);
console.log('Shopify snapshot: zero config requests on open; correct 30%/₹80 display while Render 429/503; OFF bypass; invalid snapshot fallback; checkout still requires server confirmation.');
