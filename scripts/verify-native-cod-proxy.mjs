import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
const dir=new URL('../.qa-native-proxy/',import.meta.url),shop='0k9icg-ns.myshopify.com',id='12345678-1234-1234-1234-123456789abc';
let existing=true,settingsOn=false,creates=0;
const f=globalThis.__nativeProxy={auth:async()=>({session:{shop}}),db:{$queryRawUnsafe:async sql=>sql.includes('SELECT "id"')&&existing?[{id}]:[]},settings:async()=>({enabled:settingsOn,advancePercent:20,codFeePaise:5000,revision:1}),link:async()=>({paid:false,url:'https://cartwala.in/80379314361/invoices/test123'}),read:async()=>({id,quote:{}}),reference:()=>({amounts:{payableNowPaise:13000}}),create:async()=>{creates++;throw Error('must never create');}};
const stubs={
 'db.server':'export default globalThis.__nativeProxy.db;',
 'shopify.server':'export const authenticate={public:{appProxy:(...a)=>globalThis.__nativeProxy.auth(...a)}},unauthenticated={admin:async()=>({admin:{}})};',
 'cod-theme-review.server':`export const COD_REVIEW_SHOP=${JSON.stringify(shop)},COD_REVIEW_THEME='188248228025',loadCodThemeReview=(...a)=>globalThis.__nativeProxy.settings(...a);`,
 'partial-cod-quote.server':'export const calculateCodQuote=()=>{throw Error("must not quote")};',
 'native-cod-plan.server':'export const prepareNativeCodPlan=()=>{};',
 'native-cod-hooks.server':'export const ensureNativeCodHooks=()=>{};',
 'native-cod-checkout.server':'export const createNativeCheckout=(...a)=>globalThis.__nativeProxy.create(...a),nativeCheckoutLink=(...a)=>globalThis.__nativeProxy.link(...a),readNativeCheckout=(...a)=>globalThis.__nativeProxy.read(...a),reconcileNativeCheckout=async()=>({state:"awaiting_payment"});',
 'native-cod-payment.server':'export const nativeCodQuoteReference=(...a)=>globalThis.__nativeProxy.reference(...a);',
 'partial-cod-access.server':'export const issueCodAccess=()=>"SIGNED_TEST_CAPABILITY",readCodAccess=()=>"12345678-1234-1234-1234-123456789abc";',
};
try{
 await mkdir(dir,{recursive:true});await build({entryPoints:['app/routes/signature-day.native-cod.ts'],bundle:true,packages:'external',platform:'node',format:'esm',outfile:new URL('route.mjs',dir).pathname,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/\.server$/},a=>{const key=a.path.split('/').pop();return stubs[key]?{path:key,namespace:'fixture'}:undefined;});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path]}));}}]});
 const {action,loader}=await import(new URL('route.mjs',dir));
 const call=body=>action({request:new Request('https://example.test/signature-day/native-cod',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
 const input={intent:'create_quote',requestKey:id,themeId:'188248228025'};
 for(const on of [false,true]){settingsOn=on;const r=await call(input);assert.equal(r.status,200);const d=await r.json();assert.equal(d.checkoutUrl,'https://cartwala.in/80379314361/invoices/test123');assert.equal(d.access,'SIGNED_TEST_CAPABILITY');}
 existing=false;assert.equal((await call(input)).status,503);assert.equal(creates,0);
 assert.equal((await (await loader({request:new Request('https://example.test')})).json()).checkoutAvailable,false);
 assert.equal((await call({intent:'payment_status',access:'TEST'})).status,200);
 f.auth=async()=>({session:{shop:'other.myshopify.com'}});assert.equal((await call(input)).status,404);
 console.log('Native proxy: existing invoice recovery while OFF or customer-gated, new checkout rejection, recoverable signed status and shop isolation passed. No external writes.');
}finally{delete globalThis.__nativeProxy;await rm(dir,{recursive:true,force:true});}
