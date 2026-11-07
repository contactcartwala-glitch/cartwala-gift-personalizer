import { randomUUID } from "node:crypto";
import { readCodAccounting, type FrozenCodAccounting } from "./partial-cod-accounting";
import { buildCodQuoteInput, type CodAddress } from "./partial-cod-quote";
import { inrPaise } from "./partial-cod-payment";
import { codOrderBreakdown } from "./cod-order-breakdown";
import { nativeCodGraphql, nativeCodQuoteReference, NATIVE_COD_BALANCE_TITLE,
  type NativeCodAdmin, type NativeCodContext, type NativeAdvanceLine, type NativeCodDiscount } from "./native-cod-payment.server";
export type NativeCodQuote = Omit<NativeCodContext,"draftId"|"orderId">;
export type NativeCodPlan = {quote:NativeCodQuote;address:CodAddress | undefined;input:Record<string,unknown>};
const rupees=(p:number)=>(p/100).toFixed(2);
export const NATIVE_CALCULATE = `mutation NativeCodCalculate($input:DraftOrderInput!) { draftOrderCalculate(input:$input) {
 userErrors {field message} calculatedDraftOrder { currencyCode presentmentCurrencyCode taxesIncluded
 totalPriceSet {shopMoney {amount currencyCode}} totalTaxSet {shopMoney {amount currencyCode}} taxLines {title rate}
 totalDiscountsSet {shopMoney {amount currencyCode}} totalShippingPriceSet {shopMoney {amount currencyCode}}
 lineItems {uuid variant {id} quantity taxable requiresShipping customAttributes {key value}
 originalUnitPriceSet {shopMoney {amount currencyCode}} discountedTotalSet {shopMoney {amount currencyCode}}}
 } } }`;
const attrs=(v:Array<{key:string;value:string}>)=>JSON.stringify([...v].sort((a,b)=>a.key.localeCompare(b.key)));
/** Allocate whole paise across quantities without losing a unit or an artwork property. */
export function allocateNativeAdvance(frozen:FrozenCodAccounting,advancePaise:number):NativeAdvanceLine[]{
 const source=readCodAccounting(frozen);
 if(!source.taxesIncluded&&source.taxPaise!==0)throw new Error("Tax-exclusive native advance is unsupported");
 let allocated=0, goodsSoFar=0;
 return source.lines.flatMap((l,index)=>{
  if(l.properties.length>97)throw new Error("Too many artwork properties");
  goodsSoFar+=l.unitPaise*l.quantity;
  const budget=(index===source.lines.length-1?advancePaise:Math.floor(advancePaise*goodsSoFar/source.orderPaise))-allocated;
  allocated+=budget;
  const low=Math.floor(budget/l.quantity),highQuantity=budget%l.quantity;
  return [{unitPaise:low,quantity:l.quantity-highQuantity,chunk:"base"},{unitPaise:low+1,quantity:highQuantity,chunk:"rounding"}]
   .filter(x=>x.quantity>0).map(x=>({variantId:l.variantId,title:"Personalized goods",quantity:x.quantity,unitPaise:x.unitPaise,
    requiresShipping:l.requiresShipping,taxable:l.taxable,attributes:[...l.properties.map(p=>({key:p.name,value:p.value})),
     {key:"_cartwala_cod_line",value:`${l.quoteLineId}:${x.chunk}`},{key:"Full item unit price",value:`₹${rupees(l.unitPaise)}`}]}));
 });
}
const draftLines=(lines:NativeAdvanceLine[])=>lines.map(l=>({uuid:randomUUID(),variantId:l.variantId,quantity:l.quantity,
 priceOverride:{amount:rupees(l.unitPaise),currencyCode:"INR"},customAttributes:l.attributes}));
async function calculate(admin:NativeCodAdmin,input:Record<string,unknown>,expected:number,shipping:number,lines:NativeAdvanceLine[],balance?:{paise:number;taxable:boolean}){
 const data=await nativeCodGraphql(admin,NATIVE_CALCULATE,{input}),result=data.draftOrderCalculate,c=result?.calculatedDraftOrder;
 if(!c||!Array.isArray(result.userErrors)||result.userErrors.length||c.currencyCode!=="INR"||c.presentmentCurrencyCode!=="INR"||
  inrPaise(c.totalPriceSet)!==expected||inrPaise(c.totalShippingPriceSet)!==shipping||inrPaise(c.totalDiscountsSet)!==0||
  !Array.isArray(c.lineItems)||c.lineItems.length!==lines.length+(balance?1:0))throw new Error("Native totals cannot be confirmed");
 const remaining=[...c.lineItems];
 if(!Array.isArray(c.taxLines))throw new Error("Native tax breakdown missing");
 const signatures=[JSON.stringify(c.taxLines.map((t:{title:string;rate:number})=>({title:t.title,rate:t.rate})).sort((a:{title:string},b:{title:string})=>a.title.localeCompare(b.title)))];
 const rates=c.taxLines.map((t:{rate:number})=>t.rate);

 for(const l of lines){const i=remaining.findIndex(x=>x.variant?.id===l.variantId&&x.quantity===l.quantity&&attrs(x.customAttributes)===attrs(l.attributes)&&inrPaise(x.originalUnitPriceSet)===l.unitPaise);
  if(i<0)throw new Error("Native merchandise changed");const [x]=remaining.splice(i,1);
  if(x.taxable!==l.taxable||x.requiresShipping!==l.requiresShipping||inrPaise(x.discountedTotalSet)!==l.unitPaise*l.quantity)throw new Error("Native artwork or price changed");}
 if(balance){const l=remaining[0];if(l.variant||l.quantity!==1||l.requiresShipping||l.taxable!==balance.taxable||inrPaise(l.originalUnitPriceSet)!==balance.paise||inrPaise(l.discountedTotalSet)!==balance.paise)throw new Error("Native balance changed");}
 return {taxPaise:inrPaise(c.totalTaxSet),taxesIncluded:c.taxesIncluded as boolean,signatures,rates};
}
/** All source prices come from authenticated Shopify calculations, never browser prices. */
export async function prepareNativeCodPlan(admin:NativeCodAdmin,source:{id:string;shop:string;appClientId:string;accounting:FrozenCodAccounting;address?:CodAddress;collectAddressAtCheckout?:boolean;discount?:NativeCodDiscount;percent:number;feePaise:number}):Promise<NativeCodPlan>{
 const frozen=readCodAccounting(source.accounting),breakdown=codOrderBreakdown(frozen.orderPaise,source.percent,source.feePaise),a=breakdown.amounts;
 if(source.collectAddressAtCheckout && !frozen.taxesIncluded)throw new Error("Address-free checkout requires tax-inclusive pricing");
 const address=buildCodQuoteInput({address:source.address,lines:frozen.lines.map(l=>({variantId:l.variantId,quantity:l.quantity,properties:l.properties}))},source.collectAddressAtCheckout).shippingAddress;
 const common={presentmentCurrencyCode:"INR",acceptAutomaticDiscounts:false,allowDiscountCodesInCheckout:false,...(address?{shippingAddress:address}:{useCustomerDefaultAddress:false}),
  shippingLine:{title:"Shipping / COD charge",priceWithCurrency:{amount:rupees(source.feePaise),currencyCode:"INR"}}};
 const original:NativeAdvanceLine[]=frozen.lines.map(l=>({variantId:l.variantId,title:"Personalized goods",quantity:l.quantity,unitPaise:l.unitPaise,requiresShipping:l.requiresShipping,taxable:l.taxable,attributes:l.properties.map(p=>({key:p.name,value:p.value}))}));
 const full=await calculate(admin,{...common,lineItems:draftLines(original)},a.totalPaise,source.feePaise,original);
 if(full.taxesIncluded!==frozen.taxesIncluded)throw new Error("Native tax setting changed");
 // One remainder line can only represent one merchandise tax treatment. Mixed rates use prepaid.
 if(new Set(frozen.lines.map(l=>l.taxable)).size!==1||new Set(full.rates).size>1)throw new Error("Mixed native tax treatments are unsupported");
 const lines=allocateNativeAdvance(frozen,a.advancePaise);
 if(lines.length>100)throw new Error("Too many native checkout lines");
 const items=draftLines(lines);
 const initial=await calculate(admin,{...common,lineItems:items},a.payableNowPaise,source.feePaise,lines);
 const balanceTaxable=frozen.lines.some(l=>l.taxable);
 const completed=await calculate(admin,{...common,lineItems:[...items,{title:NATIVE_COD_BALANCE_TITLE,quantity:1,requiresShipping:false,taxable:balanceTaxable,
  originalUnitPriceWithCurrency:{amount:rupees(a.collectOnDeliveryPaise),currencyCode:"INR"}}]},a.totalPaise,source.feePaise,lines,{paise:a.collectOnDeliveryPaise,taxable:balanceTaxable});
 const roundingAllowance=Math.max(1,lines.length+1-original.length);
 if(initial.taxesIncluded!==full.taxesIncluded||completed.taxesIncluded!==full.taxesIncluded||
  [...initial.signatures,...completed.signatures].some(signature=>signature!==full.signatures[0])||
  Math.abs(completed.taxPaise-full.taxPaise)>roundingAllowance)
  throw new Error("Deferred balance tax differs from full goods invoice; use prepaid");
 const quote:NativeCodQuote={id:source.id,shop:source.shop,appClientId:source.appClientId,test:false,...(source.discount?{discount:source.discount}:{}),goodsPaise:a.orderPaise,advancePercent:source.percent,
  shippingPaise:source.feePaise,taxesIncluded:full.taxesIncluded,initialTaxPaise:initial.taxPaise,completedTaxPaise:completed.taxPaise,balanceTaxable,lines};
 const reference=nativeCodQuoteReference(quote);
 return {quote,address,input:{...common,lineItems:items,tags:[`CW-NATIVE-${source.id}`,"Advance COD"],
  customAttributes:[...(source.discount?[{key:"Discount code",value:source.discount.code},
   {key:"Discount amount",value:`₹${rupees(source.discount.discountPaise)}`},
   {key:"Original goods amount",value:`₹${rupees(source.discount.originalPaise)}`}]:[]),...breakdown.attributes.filter(p=>p.key!=="Online amount received"),{key:"Pay now",value:`₹${rupees(a.payableNowPaise)}`},...reference.attributes],
  note:`Advance COD: full order ₹${rupees(a.totalPaise)}. Pay ₹${rupees(a.payableNowPaise)} now, including ₹${rupees(source.feePaise)} shipping/COD charge. Pay ₹${rupees(a.collectOnDeliveryPaise)} on delivery. This is a partial payment, not a discount.`}};
}
