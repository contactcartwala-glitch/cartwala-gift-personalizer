import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {confirmSignatureCheckout} from '../app/lib/signature-checkout-confirm.server.ts';
const shop='0k9icg-ns.myshopify.com', old='11111111-1111-4111-8111-111111111111', fresh='22222222-2222-4222-8222-222222222222';
const url=name=>'https://cdn.shopify.com/s/files/1/0000/0000/0000/files/synthetic-'+name;
const payload=()=>({previewUrls:[{front:url('mock.jpg')}],printUrls:[{front:url('print.pdf#page=2')}],sourceUrls:[url('source.jpg')],shirtSizes:['S'],backPrint:false});
const validation=fs.readFileSync('app/lib/signature-day.server.ts','utf8');
const validate=new Function(ts.transpileModule(validation.slice(validation.indexOf('export function isShopifyFileUrl'),validation.indexOf('const orderIdPattern')).replaceAll('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return validateDesign;')();
const context=vm.createContext({});vm.runInContext(fs.readFileSync('shopify-theme/assets/signature-canonical-guard.js','utf8'),context);
const ensure=context.cartwalaEnsureSignatureDesign;
function fixture({cached,canonical=false,editable=true,wrongVariant=false,artifactFailure=false,saveFailure=false,durableFailure=false,tier='1-10 shirts'}={}){
  const rows=new Map(),cache=cached?{designId:old}:{},calls=[];let saves=0;
  const row=id=>({id,shop,...payload()});if(canonical)rows.set(old,row(old));
  const options={shop,proxy:'/apps/cartwala-signature-day',cache,payload:payload(),variantIds:['1'],editableAvailable:editable,saveDraft:async()=>{},fetch:async(path,init)=>{
    calls.push(path);const input=JSON.parse(init.body);
    if(path.endsWith('/confirm-checkout'))return confirmSignatureCheckout(shop,input,validate(input),{
      find:async(s,id)=>{assert.equal(s,shop);return rows.has(id)?[rows.get(id)]:[];},
      variants:async ids=>ids.map(id=>({id,product:{handle:wrongVariant?'other-product':'signature-day-t-shirts'},selectedOptions:[{value:'S'},{value:'Front only'},{value:tier}],price:'150.00'})),
      head:async u=>{assert.equal(u,url('print.pdf'));return new Response(null,{status:artifactFailure?404:200,headers:{'content-type':'application/pdf'}});}
    });
    assert.equal(path,options.proxy);saves++;
    if(saveFailure)return Response.json({error:'failure'},{status:500});
    if(!durableFailure)rows.set(fresh,{id:fresh,shop,...input});
    return Response.json({designId:fresh});
  }};
  return {options,rows,calls,cache,get saves(){return saves;}};
}
test('published en-dash tier is accepted; a different tier still fails before save',async()=>{
  for(const tier of ['1\u201310 shirts','1-10 shirts']){const f=fixture({tier});assert.equal(await ensure(f.options),fresh);assert.equal(f.saves,1);}
  const f=fixture({tier:'11+ shirts'});await assert.rejects(ensure(f.options));assert.equal(f.saves,0);
});
test('fresh and historical-cache editable designs save once and confirm before returning cart ID',async()=>{
  for(const cached of [false,true]){const f=fixture({cached});assert.equal(await ensure(f.options),fresh);assert.equal(f.saves,1);assert.equal(f.cache.designId,fresh);assert.equal(f.calls.at(-1),f.options.proxy+'/confirm-checkout');assert.equal(await ensure(f.options),fresh);assert.equal(f.saves,1);}
});
test('canonical cached design is confirmed without a new save even without editable originals',async()=>{
  const f=fixture({cached:true,canonical:true,editable:false});assert.equal(await ensure(f.options),old);assert.equal(f.saves,0);
});
test('historical-only cache without editable artwork stops with re-open/re-save guidance',async()=>{
  const f=fixture({cached:true,editable:false});await assert.rejects(ensure(f.options),/Re-open.*Save & Preview/);assert.equal(f.saves,0);assert.equal(f.cache.designId,old);
});
test('duplicate clicks share one save, changed concurrent artwork cannot reuse the first ID',async()=>{
  const f=fixture({cached:true});const a=ensure(f.options),b=ensure(f.options);assert.equal(a,b);
  const changed={...f.options,payload:{...f.options.payload,backPrint:true}};await assert.rejects(ensure(changed),/design changed/);
  assert.deepEqual(await Promise.all([a,b]),[fresh,fresh]);assert.equal(f.saves,1);
});
test('wrong shop/variant or unsupported confirmation route cannot save or reach cart',async()=>{
  const f=fixture();await assert.rejects(ensure({...f.options,shop:'other.myshopify.com'}),/not connected/);assert.equal(f.calls.length,0);
  const v=fixture({wrongVariant:true});await assert.rejects(ensure(v.options),/could not be confirmed/);assert.equal(v.saves,0);
  const unsupported=fixture();unsupported.options.fetch=async()=>new Response('not found',{status:404});await assert.rejects(ensure(unsupported.options));assert.equal(unsupported.saves,0);
});
test('save failure, non-durable success and artifact failure never promote a new cached ID',async()=>{
  for(const key of ['saveFailure','durableFailure','artifactFailure']){const f=fixture({cached:true,[key]:true});await assert.rejects(ensure(f.options));assert.equal(f.cache.designId,old);}
});
test('artifact-failed saved ID is retried without another save',async()=>{
  const f=fixture({cached:true,artifactFailure:true});await assert.rejects(ensure(f.options));await assert.rejects(ensure(f.options));assert.equal(f.saves,1);assert.equal(f.cache.pendingCanonicalId,fresh);
});
test('canonical row with altered artwork fails closed without silently replacing it',async()=>{
  const f=fixture({cached:true,canonical:true});f.options.payload.printUrls[0].front=url('different.jpg');await assert.rejects(ensure(f.options));assert.equal(f.saves,0);
});
test('confirmation endpoint authenticates first and has no database write calls',async()=>{
  const text=fs.readFileSync('app/routes/signature-day.confirm-checkout.ts','utf8');
  const src=text.slice(text.indexOf('export const action')).replace('export const','const');
  const action=new Function('authenticate','prisma','validateDesign','confirmSignatureCheckout',ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return action;')({public:{appProxy:async()=>({})}},{signatureDayDesign:{findMany:()=>assert.fail('unauthenticated read')}},validate,confirmSignatureCheckout);
  assert.equal((await action({request:new Request('https://synthetic.invalid/signature-day/confirm-checkout',{method:'POST'})})).status,403);
  assert.doesNotMatch(text,/\.create\(|\.update\(|\.delete\(/);
  const result=await confirmSignatureCheckout('other.myshopify.com',{designId:old,variantIds:['1']},validate(payload()),{find:()=>assert.fail(),variants:()=>assert.fail(),head:()=>assert.fail()});assert.equal(result.status,403);
});
test('saved but not durable IDs stay pending on retry, without creating another design',async()=>{
  const f=fixture({durableFailure:true});await assert.rejects(ensure(f.options));await assert.rejects(ensure(f.options));assert.equal(f.saves,1);
});
test('published cart sequence with guard reaches cart only after server confirmation and deduplicates retries',async()=>{
  const source=fs.readFileSync('tests/fixtures/signature-published-cart.txt','utf8');
  const section=fs.readFileSync('shopify-theme/sections/signature-day-editor.liquid','utf8');
  const start=section.indexOf("  if(typeof globalThis.cartwalaEnsureSignatureDesign");
  const replacement=section.slice(start,section.indexOf('  const grouped=new Map();',start));
  const originalStart=source.indexOf('  let designId=printCache.designId;');
  const originalEnd=source.indexOf('  const grouped=new Map();');
  assert.ok(originalStart>=0&&originalEnd>originalStart);
  const cartGuard=section.split('\n').find(line=>line.includes('if(printCache.replacedDesignId'));
  assert.ok(cartGuard);
  const integrated=(source.slice(0,originalStart)+replacement+source.slice(originalEnd)).replace('const cart=await cartResponse.json();','const cart=await cartResponse.json();\n'+cartGuard);
  const execute=new (Object.getPrototypeOf(async function(){}).constructor)('globalThis','window','PROXY','printCache','previewUrls','printUrls','sourceUrls','people','includeBack','variantIds','fetch','saveDraft',integrated);
  for(const [editable,oldCart] of [[true,false],[false,false],[true,true]]){
    const f=fixture({cached:true,editable}),cart=oldCart?[{variant_id:'1',quantity:1,properties:{'_Cartwala Signature Day Design':old}}]:[];let adds=0,cartReads=0;
    const fetch=async(url,init)=>{
      if(url==='/cart.js'){cartReads++;assert.equal(f.cache.designId,fresh);return Response.json({items:cart});}
      if(url==='/cart/add.js'){adds++;const {items}=JSON.parse(init.body);cart.push(...items.map(i=>({...i,variant_id:i.id})));return Response.json({});}
      return f.options.fetch(url,init);
    };
    const p=f.options.payload;
    const run=()=>execute({cartwalaEnsureSignatureDesign:ensure},{Shopify:{shop}},f.options.proxy,f.cache,p.previewUrls,p.printUrls,p.sourceUrls,[{size:'S',...(editable?{sourceUrl:p.sourceUrls[0]}:{})}],false,['1'],fetch,async()=>{});
    if(oldCart){await assert.rejects(run(),/earlier saved version/);await assert.rejects(run(),/earlier saved version/);assert.equal(adds,0);assert.equal(f.saves,1);}
    else if(editable){await run();await run();assert.equal(adds,1);assert.equal(f.saves,1);}else{await assert.rejects(run(),/Re-open/);assert.equal(cartReads,0);assert.equal(adds,0);}
  }
  assert.match(section,/if\(confirming\)return/);
});
