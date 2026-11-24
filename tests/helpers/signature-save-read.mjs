// Execute real JSON writer, validator and staff loader with synthetic persistence/auth only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {createRecoveryReader,recoverMissingPrintDesigns,CARTWALA_SHOP} from '../../app/lib/print-files-recovery.server.ts';
import {isCartwalaPhotoPrint} from '../../app/lib/polaroid-print-layout.ts';
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
export async function saveAndReadSyntheticDesign(design){
  const id='44444444-4444-4444-8444-444444444444',rows=[];
  const validation=fs.readFileSync('app/lib/signature-day.server.ts','utf8');
  const validate=new Function(compile(validation.slice(validation.indexOf('export function isShopifyFileUrl'),validation.indexOf('const orderIdPattern')).replaceAll('export ',''))+';return validateDesign;')();
  const prisma={signatureDayDesign:{create:async({data})=>{rows.push({id,...data});return rows[0];},findMany:async({where})=>{assert.equal(where.shop,CARTWALA_SHOP);assert.deepEqual(where.id.in,[id]);return rows;}}};
  const writer=fs.readFileSync('app/routes/signature-day.ts','utf8');
  const action=new Function('authenticate','prisma','validateDesign',compile(writer.slice(writer.indexOf('export const action')).replace('export const','const'))+';return action;')({public:{appProxy:async()=>({admin:{},session:{shop:CARTWALA_SHOP}})}},prisma,validate);
  const payload={...design,backPrint:design.printUrls.every(p=>!!p.back),previewUrls:design.printUrls.map(()=>({front:'https://cdn.shopify.com/s/files/1/0000/0000/0000/files/synthetic-mock.jpg',...(design.printUrls.every(p=>!!p.back)?{back:'https://cdn.shopify.com/s/files/1/0000/0000/0000/files/synthetic-back-mock.jpg'}:{})})),sourceUrls:design.printUrls.map(()=> 'https://cdn.shopify.com/s/files/1/0000/0000/0000/files/synthetic-source.jpg')};
  const saved=await action({request:new Request('https://synthetic.invalid/signature-day',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})});
  assert.equal(saved.status,200);assert.deepEqual(await saved.json(),{designId:id});
  const order={id:'gid://shopify/Order/1',name:'#SYNTHETIC',createdAt:'2026-01-01',displayFinancialStatus:'PAID',lineItems:{nodes:[{id:'line',title:'Signature',quantity:design.printUrls.length,customAttributes:[{key:'design',value:id}]}]}};
  const authenticate={admin:async()=>({session:{shop:CARTWALA_SHOP},admin:{graphql:async q=>({json:async()=>q.includes('GrantedScopes')?{data:{currentAppInstallation:{accessScopes:[{handle:'read_orders'}]}}}:{data:{orders:{nodes:[order]}}}})}})};
  const source=fs.readFileSync('app/routes/app.print-files.tsx','utf8');
  const loader=new Function('authenticate','prisma','DESIGN_ATTRIBUTE','recoverMissingPrintDesigns','readRecoveryPrintDesigns','orderLookupMessage','CARTWALA_SHOP','isCartwalaPhotoPrint',compile(source.slice(source.indexOf('export const loader ='),source.indexOf('// Shopify file properties')).replace('export const','const'))+';return loader;')(authenticate,prisma,'design',recoverMissingPrintDesigns,createRecoveryReader({},()=>assert.fail('Historical DB connection')),()=>'',CARTWALA_SHOP,isCartwalaPhotoPrint);
  const loaded=await loader({request:new Request('https://synthetic.invalid/app/print-files')});
  assert.deepEqual(loaded.designs[id].printUrls,design.printUrls);
  return loaded.designs[id];
}
