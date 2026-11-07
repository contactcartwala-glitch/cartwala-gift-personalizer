import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
const dir=new URL('../.qa-native-admin/',import.meta.url),shop='0k9icg-ns.myshopify.com',id='12345678-1234-1234-1234-123456789abc';
await mkdir(dir,{recursive:true});
let failAt='',received,creates=0;
const f=globalThis.__nativeAdminFixture={
 auth:async()=>({session:{shop}}),offline:async()=>({admin:{}}),
 settings:async()=>({enabled:true,advancePercent:20,codFeePaise:5000}),
 quote:async(_admin,input)=>{received=input;if(failAt==='quote')throw Error('private upstream payload');return {accountingSnapshot:{},shippingAddress:input.address,amounts:{totalPaise:45000,payableNowPaise:13000,collectOnDeliveryPaise:32000}};},
 plan:async()=>{if(failAt==='tax_plan')throw Error('private upstream payload');return {input:{}};},
 hooks:async()=>{if(failAt==='events')throw Error('private upstream payload');},
 create:async()=>{creates++;return {paid:false,url:'https://test.myshopify.com/invoices/test'};},
};
const stubs={
 'db.server':'export default {$queryRawUnsafe:async()=>[]};',
 'shopify.server':'export const authenticate={admin:(...a)=>globalThis.__nativeAdminFixture.auth(...a)},unauthenticated={admin:(...a)=>globalThis.__nativeAdminFixture.offline(...a)};',
 'cod-theme-review.server':`export const COD_REVIEW_SHOP=${JSON.stringify(shop)},loadCodThemeReview=(...a)=>globalThis.__nativeAdminFixture.settings(...a);`,
 'partial-cod-quote.server':'export const calculateCodQuote=(...a)=>globalThis.__nativeAdminFixture.quote(...a);',
 'native-cod-plan.server':'export const prepareNativeCodPlan=(...a)=>globalThis.__nativeAdminFixture.plan(...a);',
 'native-cod-hooks.server':'export const ensureNativeCodHooks=(...a)=>globalThis.__nativeAdminFixture.hooks(...a);',
 'native-cod-checkout.server':'export const createNativeCheckout=(...a)=>globalThis.__nativeAdminFixture.create(...a),nativeCheckoutLink=()=>{},reconcileNativeCheckout=()=>{},readNativeCheckout=()=>{};',
};
try{
 await build({entryPoints:['app/routes/app.cod-native-checkout.tsx'],bundle:true,packages:'external',platform:'node',format:'esm',outfile:new URL('route.mjs',dir).pathname,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/\.server$/},a=>{const key=a.path.split('/').pop();return stubs[key]?{path:key,namespace:'fixture'}:undefined;});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path]}));}}]});
 const {action}=await import(new URL('route.mjs',dir));
 const fields={id,intent:'create',firstName:'TEST ONLY',lastName:'',address1:'TEST ONLY',address2:'',city:'TEST ONLY',provinceCode:'ts',zip:'506342',phone:'9876543210',variantId:'gid://shopify/ProductVariant/49065013412025',quantity:'2',properties:'[]'};
 const call=(patch={})=>action({request:new Request('https://example.test/app/cod-native-checkout',{method:'POST',body:new URLSearchParams({...fields,...patch})})});
 for(const phone of ['9876543210','+919876543210','91 98765-43210','(98765) 43210']){
  const r=await call({phone});assert.equal(r.ok,true);assert.equal(received.address.phone,'+919876543210');assert.equal(received.address.provinceCode,'TS');assert.equal(received.lines[0].quantity,2);
 }
 const before=creates;
 const orig=console.error;const logs=[];console.error=(...a)=>logs.push(a);
 try{for(const stage of ['quote','tax_plan','events']){failAt=stage;const r=await call();assert.equal(r.ok,false);assert.equal(r.id,id);assert.equal(r.values.phone,fields.phone);assert.equal(r.values.quantity,'2');assert.match(r.message,new RegExp(stage));assert.ok(!JSON.stringify(r).includes('private upstream'));} }finally{console.error=orig;}
 assert.equal(creates,before);assert.ok(!JSON.stringify(logs).includes(fields.phone));
 f.auth=async()=>({session:{shop:'other.myshopify.com'}});await assert.rejects(call(),e=>e.status===404);
 console.log('Native admin phone/state normalization, retained input/reference, staged safe failures and shop isolation passed. No external requests.');
}finally{delete globalThis.__nativeAdminFixture;await rm(dir,{recursive:true,force:true});}
