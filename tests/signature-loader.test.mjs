import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { recoverMissingPrintDesigns, CARTWALA_SHOP } from '../app/lib/print-files-recovery.server.ts';
import { isCartwalaPhotoPrint } from '../app/lib/polaroid-print-layout.ts';
const route=fs.readFileSync('app/routes/app.print-files.tsx','utf8');
const source=route.slice(route.indexOf('export const loader ='),route.indexOf('// Shopify file properties'))
  .replace('export const loader','const loader');
const factory=new Function('authenticate','prisma','DESIGN_ATTRIBUTE','recoverMissingPrintDesigns',
  'readRecoveryPrintDesigns','orderLookupMessage','CARTWALA_SHOP','isCartwalaPhotoPrint',ts.transpileModule(source,
    {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return loader;');
const id='11111111-1111-4111-8111-111111111111';
const url=n=>`https://cdn.shopify.com/s/files/1/0000/0000/0000/files/synthetic-${n}.jpg`;
const row={id,shop:CARTWALA_SHOP,printUrls:Array.from({length:31},(_,i)=>({front:url('print'+i)})),
  previewUrls:Array.from({length:31},(_,i)=>({front:url('preview'+i)})),
  sourceUrls:Array.from({length:31},(_,i)=>url('source'+i)),shirtSizes:Array(31).fill('M'),backPrint:false};
const order=(design=true,status='PAID')=>({id:'gid://shopify/Order/1',name:'#SYNTHETIC',createdAt:'2026-01-01',
  displayFinancialStatus:status,lineItems:{nodes:[{id:'line1',title:'Signature',quantity:31,
    customAttributes:design?[{key:'design',value:id}]:[]}]}});
function setup({shop=CARTWALA_SHOP,authorized=true,orders=[order()],primary=[]}={}){
  const calls=[];
  const authenticate={admin:async()=>{
    calls.push('auth');if(!authorized)throw new Response('Unauthorized',{status:401});
    return {session:{shop},admin:{graphql:async query=>({json:async()=>query.includes('GrantedScopes')?
      {data:{currentAppInstallation:{accessScopes:[{handle:'read_orders'}]}}}:{data:{orders:{nodes:orders}}}})}};
  }};
  const prisma={signatureDayDesign:{findMany:async args=>{calls.push(['primary',args]);return primary;}}};
  const reader=async(shop,ids)=>{calls.push(['recovery',shop,ids]);return [row];};
  return {calls,loader:factory(authenticate,prisma,'design',recoverMissingPrintDesigns,reader,()=> 'Order error',CARTWALA_SHOP,isCartwalaPhotoPrint)};
}
test('actual loader denies unauthenticated access before any orders or database reads',async()=>{
  const {calls,loader}=setup({authorized:false});
  await assert.rejects(loader({request:new Request('https://test.invalid/app/print-files')}),e=>e.status===401);
  assert.deepEqual(calls,['auth']);
});
test('actual authenticated loader recovers exact ordered design and retains payment status',async()=>{
  const {calls,loader}=setup({orders:[order(true,'PARTIALLY_PAID')]});
  const result=await loader({request:new Request('https://test.invalid/app/print-files')});
  assert.equal(result.designs[id].printUrls.length,31);
  assert.equal(result.signatureOrders[0].financialStatus,'PARTIALLY_PAID');
  assert.deepEqual(calls[1][1].where,{shop:CARTWALA_SHOP,id:{in:[id]}});
  assert.deepEqual(calls[2],['recovery',CARTWALA_SHOP,[id]]);
  assert.equal(result.signatureJpgEnabled,true);
});
test('actual loader excludes recovery and ZIP UI for another authenticated shop',async()=>{
  const {calls,loader}=setup({shop:'other.myshopify.com'});
  const result=await loader({request:new Request('https://test.invalid/app/print-files')});
  assert.equal(result.signatureJpgEnabled,false);
  assert.deepEqual(result.designs,{});
  assert.equal(calls.length,2);
});
test('advance placeholder without a design never borrows a neighboring design',async()=>{
  const {calls,loader}=setup({orders:[order(false,'PARTIALLY_PAID')]});
  const result=await loader({request:new Request('https://test.invalid/app/print-files')});
  assert.deepEqual(result.designs,{});assert.deepEqual(result.signatureOrders,[]);
  assert.deepEqual(calls,['auth']);
});
test('combined loader retains both product paths without attributing a photo order to Signature',async()=>{
  const photo={...order(false),name:'#PHOTO',lineItems:{nodes:[{id:'photo1',title:'Polaroid',quantity:1,
    product:{id:'gid://shopify/Product/15411775504569'},customAttributes:[
      {key:'Print style',value:'Glossy Polaroid Prints'},{key:'Number of prints',value:'30'},
      {key:'Print files 1',value:'https://cdn.shopify.com/s/files/1/0803/7931/4361/uploads/synthetic.zip'}]}]}};
  const {loader}=setup({orders:[order(),photo]});
  const result=await loader({request:new Request('https://test.invalid/app/print-files')});
  assert.equal(result.signatureOrders.length,1);
  assert.equal(result.designs[id].printUrls.length,31);
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].cartwalaPhotoPrint,true);
  assert.equal(result.items[0].lineItemId,'photo1');
  assert.equal(result.items[0].attributes[2].key,'Print files 1');
});
