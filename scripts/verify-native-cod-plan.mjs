import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {build} from 'esbuild';
const built=await build({entryPoints:['app/lib/native-cod-plan.server.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {allocateNativeAdvance,prepareNativeCodPlan}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const bag=p=>({shopMoney:{amount:(p/100).toFixed(2),currencyCode:'INR'}});
const frozen={version:1,orderPaise:40000,taxesIncluded:true,taxPaise:6102,taxLines:[{title:'GST',rate:0.18,paise:6102,channelLiable:null}],lines:[{variantId:'gid://shopify/ProductVariant/1',quoteLineId:'11111111-1111-1111-1111-111111111111',quantity:1,unitPaise:40000,taxable:true,requiresShipping:true,properties:[{name:'Artwork',value:'saved-photo-reference'}]}]};
for(const percent of [10,20,30,50]){
 const amount=Math.round(frozen.orderPaise*percent/100),lines=allocateNativeAdvance(frozen,amount);
 assert.equal(lines.reduce((n,l)=>n+l.unitPaise*l.quantity,0),amount);assert.equal(lines.reduce((n,l)=>n+l.quantity,0),1);assert.ok(lines.every(l=>l.attributes.some(a=>a.key==='Artwork'&&a.value==='saved-photo-reference')));
}
const quantities={...structuredClone(frozen),orderPaise:39999,taxPaise:0,taxLines:[],lines:[{...frozen.lines[0],unitPaise:13333,quantity:3,taxable:false}]};
const split=allocateNativeAdvance(quantities,8000);assert.equal(split.reduce((n,l)=>n+l.unitPaise*l.quantity,0),8000);assert.equal(split.reduce((n,l)=>n+l.quantity,0),3);assert.equal(split.length,2);
const address={firstName:'Merchant',lastName:'',address1:'Test address',address2:'',city:'Test city',provinceCode:'TS',zip:'506342',phone:'+919876543210',countryCode:'IN'};
const source={id:'22222222-2222-2222-2222-222222222222',shop:'example.myshopify.com',appClientId:'a'.repeat(32),accounting:frozen,address,percent:20,feePaise:5000};
for(const mode of ['normal','address_free','rounding','wrong_tax_rate','wrong_tax_amount','wrong_price','wrong_artwork','discount']){
 let calls=0;
 const admin={graphql:async(q,{variables:{input},tries,signal})=>{
  if(mode==='address_free'){assert.equal(input.shippingAddress,undefined);assert.equal(input.useCustomerDefaultAddress,false);}
  assert.ok(q.includes('NativeCodCalculate'));assert.equal(tries,1);assert.ok(signal);calls++;
  const native=input.lineItems.map(l=>({uuid:l.uuid,variant:l.variantId?{id:l.variantId}:null,quantity:l.quantity,taxable:true,requiresShipping:!!l.variantId,
   customAttributes:mode==='wrong_artwork'&&calls===2?[]:l.customAttributes??[],originalUnitPriceSet:bag(Math.round(Number(l.priceOverride?.amount??l.originalUnitPriceWithCurrency.amount)*100)),
   discountedTotalSet:bag(Math.round(Number(l.priceOverride?.amount??l.originalUnitPriceWithCurrency.amount)*100)*l.quantity),taxLines:[{title:'GST',rate:mode==='wrong_tax_rate'&&calls===3?0.05:0.18}]}));
  return Response.json({data:{draftOrderCalculate:{userErrors:[],calculatedDraftOrder:{currencyCode:'INR',presentmentCurrencyCode:'INR',taxesIncluded:true,
   totalPriceSet:bag(mode==='wrong_price'&&calls===2?13001:calls===2?13000:45000),totalShippingPriceSet:bag(5000),totalDiscountsSet:bag(mode==='discount'?100:0),
   taxLines:[{title:'GST',rate:mode==='wrong_tax_rate'&&calls===3?0.05:0.18}],totalTaxSet:bag(calls===2?1983:calls===3&&mode==='rounding'?6864:calls===3&&mode==='wrong_tax_amount'?6800:6865),lineItems:native}}}});
 }};
 if(['normal','address_free','rounding'].includes(mode)){
  const plan=await prepareNativeCodPlan(admin,mode==='address_free'?{...source,address:undefined,collectAddressAtCheckout:true}:source);
  if(mode==='address_free')assert.equal(plan.address,undefined);assert.equal(calls,3);assert.equal(plan.quote.goodsPaise,40000);assert.equal(plan.quote.shippingPaise,5000);
  assert.equal(plan.quote.completedTaxPaise,mode==='rounding'?6864:6865);assert.equal(plan.input.lineItems[0].priceOverride.amount,'80.00');assert.equal(plan.input.lineItems[0].quantity,1);
  assert.equal('appliedDiscount' in plan.input,false);assert.equal('gateway' in plan.input,false);assert.equal('transactions' in plan.input,false);
  assert.ok(plan.input.customAttributes.some(p=>p.key==='Remaining COD balance'&&p.value==='₹320.00'));
 }else await assert.rejects(()=>prepareNativeCodPlan(admin,source));
}
await assert.rejects(()=>prepareNativeCodPlan({graphql:()=>{throw Error('must reject before calculating');}},{...source,address:{...address,countryCode:'US'}}));
assert.throws(()=>allocateNativeAdvance({...frozen,taxesIncluded:false,orderPaise:46102},8000));
console.log('Native plan: paise allocation preserves quantities/artwork, native shipping and percentage, zero discounts, Shopify tax preflight, bounded native tax rounding and rejection of changed rate/price/artwork/discount/foreign address passed.');

await assert.rejects(()=>prepareNativeCodPlan({graphql:()=>{throw Error('must reject before calculating');}},{...source,address:undefined}));
await assert.rejects(()=>prepareNativeCodPlan({graphql:()=>{throw Error('must reject before calculating');}},{...source,address:undefined,collectAddressAtCheckout:true,accounting:{...frozen,taxesIncluded:false}}));
console.log('Native address-free checkout preserves tax/price/artwork checks, omits address and customer defaults, and rejects tax-exclusive carts; legacy address validation remains required.');
