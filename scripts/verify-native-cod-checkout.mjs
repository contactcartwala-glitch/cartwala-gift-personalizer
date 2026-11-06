import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
const bundle=async path=>{const b=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);};
const api=await bundle('app/lib/native-cod-checkout.server.ts'),{nativeCodQuoteReference}=await bundle('app/lib/native-cod-payment.server.ts');
const bag=p=>({shopMoney:{amount:(p/100).toFixed(2),currencyCode:'INR'}});
for(const mode of ['normal','create_lost','begin_lost','add_lost','commit_lost','wrong_calculation','manual','wrong_amount','foreign','refund','cancel']){
 const pg=new PGlite();
 try{
  await pg.exec(await readFile('prisma/migrations/20261106090000_native_cod_checkout/migration.sql','utf8'));
  const db={query:async(sql,p)=>(await pg.query(sql.replace(/\$(\d+)/g,(_,n)=>typeof p[+n-1]==='string'?`($${n}::text)`:`$${n}`),p)).rows};
  const quote={id:'11111111-1111-1111-1111-111111111111',shop:'example.myshopify.com',appClientId:'a'.repeat(32),test:false,goodsPaise:40000,advancePercent:20,shippingPaise:5000,taxesIncluded:true,initialTaxPaise:0,completedTaxPaise:0,balanceTaxable:false,
   lines:[{variantId:'gid://shopify/ProductVariant/1',title:'Gift',quantity:1,unitPaise:8000,requiresShipping:true,taxable:false,attributes:[{key:'Artwork',value:'saved-original'}]}]};
  const reference=nativeCodQuoteReference(quote),draftId='gid://shopify/DraftOrder/2',orderId='gid://shopify/Order/3',calcId='gid://shopify/CalculatedOrder/4';
  const calls={create:0,begin:0,add:0,commit:0};let exists=false,paid=false,done=false,refund=false,cancel=false;let orderAttributes=reference.attributes;
  const line={...quote.lines[0],currentQuantity:1,amountSet:bag(8000),totalSet:bag(8000)};
  const order=()=>({id:orderId,updatedAt:'stable',test:false,cancelledAt:cancel?'cancelled':null,displayFinancialStatus:done?'PARTIALLY_PAID':'PAID',currencyCode:'INR',taxesIncluded:true,shippingAddress:{countryCodeV2:mode==='foreign'?'US':'IN'},customAttributes:orderAttributes,
   currentTotalPriceSet:bag(done?45000:13000),totalReceivedSet:bag(mode==='wrong_amount'?12000:13000),totalOutstandingSet:bag(done?32000:0),totalRefundedSet:bag(refund?13000:0),totalShippingPriceSet:bag(5000),currentTotalDiscountsSet:bag(0),currentTotalTaxSet:bag(0),
   transactions:[{id:'gid://shopify/OrderTransaction/5',test:false,kind:'SALE',status:'SUCCESS',manualPaymentGateway:mode==='manual',gateway:'Any Shopify online provider',amountSet:bag(13000)}]});
  const admin={graphql:async(q,{variables,tries,signal})=>{
   assert.equal(tries,1);assert.ok(signal);let data;
   if(q.includes('NativeCodPermissions'))data={shop:{myshopifyDomain:quote.shop},currentAppInstallation:{app:{apiKey:quote.appClientId},accessScopes:['read_orders','write_orders','write_order_edits','write_draft_orders'].map(handle=>({handle}))}};
   else if(q.includes('NativeCodCreateDraft')){calls.create++;exists=true;if(mode==='create_lost')throw Error('private lost');data={draftOrderCreate:{draftOrder:{id:draftId},userErrors:[]}};}
   else if(q.includes('NativeCodFindDraft'))data={draftOrders:{nodes:exists?[{id:draftId}]:[]}};
   else if(q.includes('NativeCodDraft'))data={draftOrder:{id:draftId,order:paid?{id:orderId}:null,invoiceUrl:'https://example.myshopify.com/123/invoices/abc123',customAttributes:reference.attributes,totalPriceSet:bag(13000),totalTaxSet:bag(0),totalDiscountsSet:bag(0),totalShippingPriceSet:bag(5000),
    lineItems:{pageInfo:{hasNextPage:false},nodes:[{...line,variant:{id:line.variantId},customAttributes:line.attributes,originalUnitPriceSet:line.amountSet}]}}};
   else if(q.includes('ReadNativeCodReceipt'))data={draftOrder:{id:draftId,order:{id:orderId}},order:order()};
   else if(q.includes('ReadNativeCodLines'))data={order:{id:orderId,lineItems:{pageInfo:{hasNextPage:false},nodes:[{...line,variant:{id:line.variantId},customAttributes:line.attributes,originalUnitPriceSet:line.amountSet,discountedTotalSet:line.totalSet},...(done?[{title:'Remaining goods value — pay on delivery',variant:null,quantity:1,currentQuantity:1,requiresShipping:false,taxable:false,customAttributes:[],originalUnitPriceSet:bag(32000),discountedTotalSet:bag(32000)}]:[])]}}};
   else if(q.includes('NativeCodBeginEdit')){calls.begin++;if(mode==='begin_lost')throw Error('lost');data={orderEditBegin:{calculatedOrder:{id:calcId,originalOrder:{id:orderId},totalPriceSet:bag(13000)},userErrors:[]}};}
   else if(q.includes('NativeCodAddBalance')){calls.add++;assert.equal(variables.price.amount,'320.00');if(mode==='add_lost')throw Error('lost');data={orderEditAddCustomItem:{calculatedOrder:{id:calcId,originalOrder:{id:orderId},totalPriceSet:bag(mode==='wrong_calculation'?46000:45000),totalOutstandingSet:bag(32000),taxLines:[]},userErrors:[]}};}
   else if(q.includes('NativeCodOrderDetails')){orderAttributes=variables.input.customAttributes;data={orderUpdate:{order:{id:orderId},userErrors:[]}};}
   else if(q.includes('NativeCodCommitEdit')){calls.commit++;done=true;if(mode==='commit_lost')throw Error('lost');data={orderEditCommit:{order:{id:orderId},userErrors:[]}};}
   else throw Error('Unexpected operation');
   return Response.json({data});
  }};
  const plan={quote,address:{},input:{}};
  await Promise.allSettled(Array.from({length:8},()=>api.createNativeCheckout(db,admin,plan)));
  assert.equal(calls.create,1);assert.equal((await api.nativeCheckoutLink(db,admin,quote.shop,quote.id)).paid,false);
  assert.equal((await api.reconcileNativeCheckout(db,admin,quote.shop,quote.id)).state,'awaiting_payment');
  paid=true;
  await Promise.allSettled(Array.from({length:8},()=>api.reconcileNativeCheckout(db,admin,quote.shop,quote.id)));
  assert.ok(calls.begin<=1);assert.ok(calls.add<=1);assert.ok(calls.commit<=1);
  let final=await api.reconcileNativeCheckout(db,admin,quote.shop,quote.id);
  assert.equal(final.state,['normal','create_lost','commit_lost','refund','cancel'].includes(mode)?'completed':'needs_review');
  const before={...calls};await api.reconcileNativeCheckout(db,admin,quote.shop,quote.id);assert.deepEqual(calls,before);
  if(['manual','wrong_amount','foreign'].includes(mode))assert.equal(calls.begin,0);
  if(mode==='wrong_calculation')assert.equal(calls.commit,0);
  if(mode==='refund'||mode==='cancel'){
   refund=mode==='refund';cancel=mode==='cancel';
   final=await api.reconcileNativeCheckout(db,admin,quote.shop,quote.id);assert.equal(final.state,'needs_review');assert.deepEqual(calls,before);
  }
  await assert.rejects(()=>api.readNativeCheckout(db,'other.myshopify.com',quote.id));
 }finally{await pg.close();}
}
console.log('Native checkout: single draft and same-order edit across 8 concurrent callers, genuine nonmanual capture checks, country, tax/amount failure, lost create/begin/add/commit recovery, no duplicate payment/order/courier mutations, refund/cancellation review and shop isolation passed.');
