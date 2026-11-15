import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdir,rm} from 'node:fs/promises';
const output=new URL('../.qa-native-cod-edit/',import.meta.url);
await mkdir(output,{recursive:true});
const bag=p=>({shopMoney:{amount:(p/100).toFixed(2),currencyCode:'INR'}});
try{
 await build({entryPoints:['app/lib/native-cod-edit-test.server.ts'],bundle:true,platform:'node',format:'esm',outfile:new URL('test.mjs',output).pathname});
 const api=await import(new URL('test.mjs',output));
 for(const mode of ['normal','create_lost','begin_lost','add_lost','commit_lost','bad_calculation','missing_scope','wrong_app']){
  const pg=new PGlite();
  try{
   await pg.exec(await readFile('prisma/migrations/20261105113000_cod_accounting_diagnostic/migration.sql','utf8'));
   const db={query:async(sql,p)=>(await pg.query(sql.replace(/\$(\d+)/g,(_,n)=>typeof p[+n-1]==='string'?`($${n}::text)`:`$${n}`),p)).rows};
   const payload=api.nativeEditTestPayload(),orderId='gid://shopify/Order/777',calcId='gid://shopify/CalculatedOrder/888';
   assert.equal(payload.order.test,true);assert.equal(payload.order.lineItems[0].priceSet.shopMoney.amount,'80.00');
   assert.equal(payload.options.sendReceipt,false);assert.equal(payload.options.inventoryBehaviour,'BYPASS');
   for(const k of ['email','phone','customer','shippingAddress','billingAddress'])assert.equal(k in payload.order,false);
   let exists=false,completed=false;const calls={create:0,begin:0,add:0,commit:0};
   const line=(title,p)=>({title,quantity:1,currentQuantity:1,requiresShipping:false,taxable:false,variant:null,originalUnitPriceSet:bag(p)});
   const order=()=>({id:orderId,test:true,cancelledAt:null,sourceIdentifier:api.EDIT_TEST_REFERENCE,tags:payload.order.tags,customAttributes:payload.order.customAttributes,
    displayFinancialStatus:completed?'PARTIALLY_PAID':'PAID',currentTotalPriceSet:bag(completed?45000:13000),totalReceivedSet:bag(13000),totalOutstandingSet:bag(completed?32000:0),totalRefundedSet:bag(0),totalShippingPriceSet:bag(5000),currentTotalTaxSet:bag(0),currentTotalDiscountsSet:bag(0),
    transactions:[{test:true,kind:'SALE',status:'SUCCESS',gateway:'Cartwala TEST accounting (no real payment)',amountSet:bag(13000)}],
    lineItems:{nodes:[line(payload.order.lineItems[0].title,8000),...(completed?[line(api.EDIT_TEST_BALANCE,32000)]:[])]}});
   const admin={graphql:async(q,{variables,tries,signal})=>{
    assert.equal(tries,1);assert.ok(signal);let data;
    if(q.includes('NativeEditTestPermissions'))data={shop:{myshopifyDomain:api.EDIT_TEST_SHOP},currentAppInstallation:{app:{apiKey:mode==='wrong_app'?'other':'3879fe641910f37451baf743e76059ee'},accessScopes:(mode==='missing_scope'?['read_orders','write_orders']:['read_orders','write_orders','write_order_edits']).map(handle=>({handle}))}};
    else if(q.includes('NativeEditTestCreate')){calls.create++;assert.deepEqual(variables,payload);exists=true;if(mode==='create_lost')throw Error('private failure');data={orderCreate:{order:{id:orderId},userErrors:[]}};}
    else if(q.includes('NativeEditTestFind'))data={orders:{nodes:exists?[{id:orderId}]:[]}};
    else if(q.includes('NativeEditTestRead')){assert.equal(variables.id,orderId);data={order:order()};}
    else if(q.includes('NativeEditTestBegin')){calls.begin++;if(mode==='begin_lost')throw Error('private failure');data={orderEditBegin:{calculatedOrder:{id:calcId,originalOrder:{id:orderId},totalPriceSet:bag(13000)},userErrors:[]}};}
    else if(q.includes('NativeEditTestAdd')){calls.add++;assert.equal(variables.id,calcId);if(mode==='add_lost')throw Error('private failure');data={orderEditAddCustomItem:{calculatedOrder:{id:calcId,originalOrder:{id:orderId},totalPriceSet:bag(mode==='bad_calculation'?46000:45000),totalOutstandingSet:bag(32000),subtotalPriceSet:bag(40000)},userErrors:[]}};}
    else if(q.includes('NativeEditTestCommit')){calls.commit++;assert.equal(variables.id,calcId);completed=true;if(mode==='commit_lost')throw Error('private failure');data={orderEditCommit:{order:{id:orderId},userErrors:[]}};}
    else throw Error('unexpected query');
    return Response.json({data});
   }};
   await assert.rejects(()=>api.runNativeEditTest(db,admin,'wrong.myshopify.com','create'));assert.equal(calls.create,0);
   await Promise.allSettled(Array.from({length:10},()=>api.runNativeEditTest(db,admin,api.EDIT_TEST_SHOP,'create')));
   if(['missing_scope','wrong_app'].includes(mode)){assert.equal(calls.create,0);continue;}
   assert.equal(calls.create,1);
   assert.equal((await api.runNativeEditTest(db,admin,api.EDIT_TEST_SHOP,'check')).phase,'advance');
   await Promise.allSettled(Array.from({length:10},()=>api.runNativeEditTest(db,admin,api.EDIT_TEST_SHOP,'edit')));
   assert.equal(calls.begin,1);assert.ok(calls.add<=1);assert.ok(calls.commit<=1);
   const final=await api.runNativeEditTest(db,admin,api.EDIT_TEST_SHOP,'check');
   const success=['normal','create_lost','commit_lost'].includes(mode);
   assert.equal(final.phase,success?'completed':'advance');
   const before={...calls};await Promise.allSettled([api.runNativeEditTest(db,admin,api.EDIT_TEST_SHOP,'create'),api.runNativeEditTest(db,admin,api.EDIT_TEST_SHOP,'edit')]);assert.deepEqual(calls,before);
   if(mode==='bad_calculation')assert.equal(calls.commit,0);
  }finally{await pg.close();}
 }
 console.log('Same-order edit TEST: initial 130 PAID → final 450 / received 130 / COD 320; 10 concurrent creates/edits, permission identity, lost-response recovery, wrong calculation and no duplicate mutations passed.');
}finally{await rm(output,{recursive:true,force:true});}
