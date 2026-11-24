import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRecoveryReader, recoverMissingPrintDesigns, CARTWALA_SHOP } from '../app/lib/print-files-recovery.server.ts';
import { isCartwalaPhotoPrint } from '../app/lib/polaroid-print-layout.ts';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('.')&&context.parentURL){const url=new URL(specifier+'.ts',context.parentURL);if(fs.existsSync(url))return {shortCircuit:true,url:url.href};}
  return next(specifier,context);
}});
const { signatureJpgPlan } = await import('../app/lib/signature-day-jpg-plan.ts');
const compile = source => ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const validation=fs.readFileSync('app/lib/signature-day.server.ts','utf8');
const validateDesign=new Function(compile(validation.slice(validation.indexOf('export function isShopifyFileUrl'),validation.indexOf('const orderIdPattern')).replaceAll('export ',''))+';return validateDesign;')();
const writer=fs.readFileSync('app/routes/signature-day.ts','utf8');
const writerFactory=new Function('authenticate','prisma','validateDesign',compile(writer.slice(writer.indexOf('export const action')).replace('export const','const'))+';return action;');
const staff=fs.readFileSync('app/routes/app.print-files.tsx','utf8');
const loaderFactory=new Function('authenticate','prisma','DESIGN_ATTRIBUTE','recoverMissingPrintDesigns','readRecoveryPrintDesigns','orderLookupMessage','CARTWALA_SHOP','isCartwalaPhotoPrint',compile(staff.slice(staff.indexOf('export const loader ='),staff.indexOf('// Shopify file properties')).replace('export const','const'))+';return loader;');
const id='22222222-2222-4222-8222-222222222222';
const url=name=>`https://cdn.shopify.com/s/files/1/0000/0000/0000/files/synthetic-${name}`;
function fixture(back=true) {
  const sizes=Array.from({length:30},(_,i)=>['M','S','XXL','L','XL'][i%5]);
  return {shirtSizes:sizes,backPrint:back,printUrls:sizes.map((_,i)=>({front:url(`shared.pdf#page=${i+1}`),...(back?{back:url(`shared.pdf#page=${i+31}`)}:{})})),previewUrls:sizes.map(()=>({front:url('mock.jpg'),...(back?{back:url('mock-back.jpg')}:{})})),sourceUrls:sizes.map(()=>url('source.jpg'))};
}
function setup() {
  const rows=[]; let writes=0; let proxyAuthorized=true;
  const prisma={signatureDayDesign:{create:async({data})=>{writes++;const row={id,...data};rows.push(row);return row;},findMany:async({where})=>rows.filter(r=>r.shop===where.shop&&where.id.in.includes(r.id))}};
  const action=writerFactory({public:{appProxy:async()=>proxyAuthorized?{admin:{},session:{shop:CARTWALA_SHOP}}:{}}},prisma,validateDesign);
  const recovery=createRecoveryReader({},()=>{throw Error('Historical connection must never occur');});
  async function load(design=id,shop=CARTWALA_SHOP) {
    const orders=[{id:'gid://shopify/Order/1',name:'#SYNTHETIC',createdAt:'2026-01-01',displayFinancialStatus:'PAID',lineItems:{nodes:[{id:'line1',title:'Signature',quantity:30,customAttributes:[{key:'design',value:design}]}]}}];
    const authenticate={admin:async()=>({session:{shop},admin:{graphql:async query=>({json:async()=>query.includes('GrantedScopes')?{data:{currentAppInstallation:{accessScopes:[{handle:'read_orders'}]}}}:{data:{orders:{nodes:orders}}}})}})};
    return loaderFactory(authenticate,prisma,'design',recoverMissingPrintDesigns,recovery,()=>'',CARTWALA_SHOP,isCartwalaPhotoPrint)({request:new Request('https://synthetic.invalid/app/print-files')});
  }
  return {rows,load,get writes(){return writes;},deny(){proxyAuthorized=false;},save:data=>action({request:new Request('https://synthetic.invalid/signature-day',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)})})};
}
for(const back of [true,false]) test(`canonical actual save to staff loader, recovery OFF, ${back?'60 front/back':'30 front-only'} export references`,async()=>{
  const f=setup(),input=fixture(back),response=await f.save(input);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{designId:id});
  const result=await f.load();assert.deepEqual(result.designs[id].printUrls,input.printUrls);
  assert.equal(result.signatureOrders[0].financialStatus,'PAID');
  const pages=signatureJpgPlan(result.designs[id]);assert.equal(pages.length,back?60:30);
  assert.deepEqual([...new Set(pages.map(p=>p.filename.split('_')[1]))],['S','M','L','XL','XXL']);
  assert.equal(f.writes,1);
  assert.deepEqual((await f.load()).designs,result.designs);assert.equal(f.writes,1,'cached canonical ID needs no second save');
  assert.deepEqual((await f.load(id,'other.myshopify.com')).designs,{});
  assert.deepEqual((await f.load('33333333-3333-4333-8333-333333333333')).designs,{});
});
test('cached historical-only ID cannot become printable merely because the order is new',async()=>{
  const f=setup();assert.deepEqual((await f.load()).designs,{});assert.equal(f.writes,0);
});
test('missing ordered back and uninstalled proxy cannot create canonical designs',async()=>{
  const f=setup(),input=fixture(true);delete input.printUrls[0].back;
  assert.equal((await f.save(input)).status,400);assert.equal(f.writes,0);
  f.deny();assert.equal((await f.save(fixture())).status,503);assert.equal(f.writes,0);
});
