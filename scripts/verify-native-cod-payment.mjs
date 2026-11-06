import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';
const compiled = await build({ entryPoints: ['app/lib/native-cod-payment.server.ts'], bundle: true, platform:'node', format:'esm', write:false });
const { nativeCodReference, nativeCodQuoteReference, verifyNativeCodPayment, readNativeCodOrder, nativeCodPermissions } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const context = { id:'12345678-1234-1234-1234-123456789abc',shop:'example.myshopify.com',appClientId:'a'.repeat(32),draftId:'gid://shopify/DraftOrder/1',orderId:'gid://shopify/Order/2',test:true,goodsPaise:40000,advancePercent:20,shippingPaise:5000,taxesIncluded:true,initialTaxPaise:0,completedTaxPaise:0,balanceTaxable:false,lines:[{variantId:'gid://shopify/ProductVariant/3',title:'Personalized merchandise',quantity:1,unitPaise:8000,requiresShipping:true,taxable:false,attributes:[{key:'Artwork',value:'asset-reference'}]}]};
const money = p => ({shopMoney:{amount:(p/100).toFixed(2),currencyCode:'INR'}});
const reference = nativeCodReference(context);
const nativeLine = { ...context.lines[0],currentQuantity:1,amountSet:money(8000),totalSet:money(8000) };
const advance = {id:context.orderId,test:true,cancelledAt:null,displayFinancialStatus:'PAID',currencyCode:'INR',taxesIncluded:true,customAttributes:reference.attributes,currentTotalPriceSet:money(13000),totalReceivedSet:money(13000),totalOutstandingSet:money(0),totalRefundedSet:money(0),totalShippingPriceSet:money(5000),currentTotalDiscountsSet:money(0),currentTotalTaxSet:money(0),transactions:[{id:'gid://shopify/OrderTransaction/4',test:true,kind:'SALE',status:'SUCCESS',manualPaymentGateway:false,gateway:'Any native online provider',amountSet:money(13000)}],lines:[nativeLine]};
const completed = {...structuredClone(advance),displayFinancialStatus:'PARTIALLY_PAID',currentTotalPriceSet:money(45000),totalOutstandingSet:money(32000),lines:[structuredClone(nativeLine),{variantId:null,title:'Remaining goods value — pay on delivery',quantity:1,currentQuantity:1,requiresShipping:false,taxable:false,attributes:[],amountSet:money(32000),totalSet:money(32000)}]};
assert.equal(verifyNativeCodPayment(context,advance,'advance').paidPaise,13000);
assert.equal(verifyNativeCodPayment(context,completed,'completed').collectPaise,32000);
assert.equal(nativeCodReference({...context,orderId:'gid://shopify/Order/99',draftId:'gid://shopify/DraftOrder/99'}).hash,reference.hash);
const quote = {...context}; delete quote.orderId; delete quote.draftId;
assert.equal(nativeCodQuoteReference(quote).hash,reference.hash);
assert.notEqual(nativeCodQuoteReference({...quote,shippingPaise:6000}).hash,reference.hash);
for (const provider of ['Paytm','Razorpay','PhonePe']) {
  const order = structuredClone(advance); order.transactions[0].gateway=provider;
  assert.equal(verifyNativeCodPayment(context,order,'advance').paidPaise,13000);
}
const badOrders = [
  x=>x.transactions[0].manualPaymentGateway=true,
  x=>x.transactions[0].test=false,
  x=>x.transactions[0].status='PENDING',
  x=>x.transactions[0].amountSet=money(12999),
  x=>x.transactions.push({...x.transactions[0]}),
  x=>x.transactions.push({...x.transactions[0],id:'gid://shopify/OrderTransaction/5',kind:'REFUND'}),
  x=>x.totalReceivedSet=money(0), x=>x.totalShippingPriceSet=money(0),
  x=>x.currentTotalDiscountsSet=money(32000), x=>x.currentTotalTaxSet=money(100),
  x=>x.cancelledAt='2026-11-06T00:00:00Z',x=>x.test=false,
  x=>x.lines[0].attributes=[],x=>x.lines[0].currentQuantity=0,
  x=>x.lines[0].amountSet=money(40000),
  x=>x.customAttributes.push({key:'_cartwala_cod_intent',value:'other'}),
];
for(const mutate of badOrders){const order=structuredClone(advance);mutate(order);assert.throws(()=>verifyNativeCodPayment(context,order,'advance'));}
for(const mutate of [x=>x.lines[1].requiresShipping=true,x=>x.lines[1].amountSet=money(31999),x=>x.lines.push(structuredClone(x.lines[1])),x=>x.totalOutstandingSet=money(0),x=>x.displayFinancialStatus='PAID']){
  const order=structuredClone(completed);mutate(order);assert.throws(()=>verifyNativeCodPayment(context,order,'completed'));
}
assert.throws(()=>nativeCodReference({...context,orderId:'gid://shopify/Order/0'}));
assert.throws(()=>nativeCodQuoteReference({...quote,test:false,lines:[{...quote.lines[0],variantId:null}]}));
const graphql = async(query,options)=>{
  assert.equal(options.tries,1);assert.ok(options.signal instanceof AbortSignal);
  assert.ok(query.trim().startsWith('query '),'Read-only helper must never mutate Shopify');
  return new Response(JSON.stringify({data:{shop:{myshopifyDomain:context.shop},currentAppInstallation:{app:{apiKey:context.appClientId},accessScopes:[{handle:'read_orders'},{handle:'write_orders'}]}}}));
};
assert.deepEqual(await nativeCodPermissions({graphql},context),['write_order_edits']);
await assert.rejects(()=>nativeCodPermissions({graphql}, {...context,shop:'other.myshopify.com'}));
let receiptReads=0;
const fixture = structuredClone(advance);
const readAdmin = changed => ({graphql:async(query)=>{
  if(query.includes('ReadNativeCodReceipt')) {
    receiptReads++;
    return new Response(JSON.stringify({data:{draftOrder:{id:context.draftId,order:{id:context.orderId}},order:{...fixture,updatedAt:changed && receiptReads>1?'changed':'original'}}}));
  }
  return new Response(JSON.stringify({data:{order:{id:context.orderId,lineItems:{nodes:[{...nativeLine,variant:{id:nativeLine.variantId},customAttributes:nativeLine.attributes,originalUnitPriceSet:nativeLine.amountSet,discountedTotalSet:nativeLine.totalSet}],pageInfo:{hasNextPage:false,endCursor:null}}}}}));
}});
assert.equal((await readNativeCodOrder(readAdmin(false),context)).lines.length,1);
receiptReads=0;
await assert.rejects(()=>readNativeCodOrder(readAdmin(true),context),/changed during verification/);
console.log('Native payment verification: configurable provider names, exact accounting, artwork, nonmanual captures, frozen reference, missing permission and concurrent-change rejection passed. No Shopify writes or payment performed.');
