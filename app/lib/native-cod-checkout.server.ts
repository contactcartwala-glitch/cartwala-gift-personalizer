import {codOrderBreakdown} from "./cod-order-breakdown";
import { randomUUID } from "node:crypto";
import { nativeCodGraphql, nativeCodPermissions, nativeCodQuoteReference, nativeCodReference,
 readNativeCodOrder, verifyNativeCodPayment, NATIVE_COD_BALANCE_TITLE, type NativeCodAdmin, type NativeCodContext } from "./native-cod-payment.server";
import type {NativeCodPlan,NativeCodQuote} from "./native-cod-plan.server";
import {inrPaise} from "./partial-cod-payment";
export type NativeCodDatabase={query<T>(sql:string,params:unknown[]):Promise<T[]>};
type Row={id:string;shop:string;quote:NativeCodQuote;state:string;draftId:string|null;orderId:string|null;editClaim:string|null;calculatedId:string|null;fingerprint:string|null};
export const CREATE_NATIVE_DRAFT=`mutation NativeCodCreateDraft($input:DraftOrderInput!) {draftOrderCreate(input:$input) {draftOrder {id} userErrors {field message}}}`;
export const READ_NATIVE_DRAFT=`query NativeCodDraft($id:ID!) {draftOrder(id:$id) {id invoiceUrl order {id}
 customAttributes {key value} totalPriceSet {shopMoney {amount currencyCode}} totalTaxSet {shopMoney {amount currencyCode}}
 totalDiscountsSet {shopMoney {amount currencyCode}} totalShippingPriceSet {shopMoney {amount currencyCode}}
 lineItems(first:100) {nodes {variant {id} quantity taxable requiresShipping customAttributes {key value}
 originalUnitPriceSet {shopMoney {amount currencyCode}}} pageInfo {hasNextPage}}
}}`;
const orderId=/^gid:\/\/shopify\/Order\/[1-9]\d*$/;
const draftId=/^gid:\/\/shopify\/DraftOrder\/[1-9]\d*$/;
export async function readNativeCheckout(db:NativeCodDatabase,shop:string,id:string){
 const rows=await db.query<Row>(`SELECT * FROM "NativeCodCheckout" WHERE "id"=$1 AND "shop"=$2`,[id,shop]);
 if(rows.length!==1)throw new Error("Unknown native checkout");
 const row=rows[0];
 if(row.id!==row.quote?.id||row.shop!==row.quote?.shop)throw new Error("Native checkout quote binding failed");
 nativeCodQuoteReference(row.quote);return row;
}
async function review(db:NativeCodDatabase,shop:string,id:string){
 await db.query(`UPDATE "NativeCodCheckout" SET "state"='needs_review',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "shop"=$2 RETURNING "id"`,[id,shop]);
}
async function readDraft(admin:NativeCodAdmin,row:Row){
 if(!row.draftId||!draftId.test(row.draftId))throw new Error("Native draft not bound");
 const draft=(await nativeCodGraphql(admin,READ_NATIVE_DRAFT,{id:row.draftId})).draftOrder;
 if(draft?.id!==row.draftId)throw new Error("Native draft not found");
 return draft;
}
function draftIdentity(row:Row,draft:Record<string,unknown>){
 const reference=nativeCodQuoteReference(row.quote);
 const properties=draft.customAttributes as Array<{key:string;value:string}>;
 if(!Array.isArray(properties)||reference.attributes.some(a=>{const matches=properties.filter(p=>p.key===a.key);return matches.length!==1||matches[0].value!==a.value;}))throw new Error("Native draft identity changed");
}
async function readyDraft(admin:NativeCodAdmin,row:Row){
 const draft=await readDraft(admin,row);draftIdentity(row,draft);
 if(draft.order)return {paid:true as const,orderId:draft.order.id};
 const a=nativeCodQuoteReference(row.quote).amounts;
 if(inrPaise(draft.totalPriceSet)!==a.payableNowPaise||inrPaise(draft.totalTaxSet)!==row.quote.initialTaxPaise||
  inrPaise(draft.totalShippingPriceSet)!==row.quote.shippingPaise||inrPaise(draft.totalDiscountsSet)!==0||
  draft.lineItems?.pageInfo?.hasNextPage!==false||draft.lineItems.nodes?.length!==row.quote.lines.length)throw new Error("Native draft prices changed");
 const remaining=[...draft.lineItems.nodes];
 for(const line of row.quote.lines){const props=(p:Array<{key:string;value:string}>)=>JSON.stringify([...p].sort((a,b)=>a.key.localeCompare(b.key)));
  const index=remaining.findIndex(x=>x.variant?.id===line.variantId&&x.quantity===line.quantity&&x.taxable===line.taxable&&x.requiresShipping===line.requiresShipping&&
   inrPaise(x.originalUnitPriceSet)===line.unitPaise&&props(x.customAttributes)===props(line.attributes));
  if(index<0)throw new Error("Native draft artwork changed");remaining.splice(index,1);}
 const url=new URL(draft.invoiceUrl);
 if(url.protocol!=="https:"||![row.shop,"cartwala.in"].includes(url.hostname)||url.username||url.password||!/^\/[1-9]\d*\/invoices\/[a-z0-9]+$/.test(url.pathname))throw new Error("Invalid native checkout URL");
 return {paid:false as const,url:url.toString()};
}
/** A single durable claim precedes draft creation; uncertain creates are found by tag, never repeated. */
export async function createNativeCheckout(db:NativeCodDatabase,admin:NativeCodAdmin,plan:NativeCodPlan){
 nativeCodQuoteReference(plan.quote);
 if(plan.quote.test)throw new Error("This checkout uses native online payment, not a fabricated test transaction");
 const permissions=await nativeCodPermissions(admin,plan.quote as NativeCodContext);
 if(permissions.length)throw new Error("Native order permissions missing");
 const inserted=await db.query<Row>(`INSERT INTO "NativeCodCheckout" ("id","shop","quote") VALUES ($1,$2,$3::jsonb) ON CONFLICT ("id") DO NOTHING RETURNING *`,
  [plan.quote.id,plan.quote.shop,JSON.stringify(plan.quote)]);
 try{
  if(inserted.length===1){
   const result=(await nativeCodGraphql(admin,CREATE_NATIVE_DRAFT,{input:plan.input})).draftOrderCreate;
   if(!result?.draftOrder?.id||!Array.isArray(result.userErrors)||result.userErrors.length||!draftId.test(result.draftOrder.id))throw new Error("Native draft creation unconfirmed");
   await db.query(`UPDATE "NativeCodCheckout" SET "draftId"=$3,"state"='ready',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "shop"=$2 AND "draftId" IS NULL RETURNING "id"`,[plan.quote.id,plan.quote.shop,result.draftOrder.id]);
  }
  return await nativeCheckoutLink(db,admin,plan.quote.shop,plan.quote.id);
 }catch{if(inserted.length===1)await review(db,plan.quote.shop,plan.quote.id);throw new Error("Native checkout needs review; do not start another payment");}
}
export async function nativeCheckoutLink(db:NativeCodDatabase,admin:NativeCodAdmin,shop:string,id:string){
 let row=await readNativeCheckout(db,shop,id);
 if(!row.draftId){
  const found=(await nativeCodGraphql(admin,`query NativeCodFindDraft($query:String!) {draftOrders(first:2,query:$query) {nodes {id}}}`,{query:`tag:CW-NATIVE-${id}`})).draftOrders?.nodes;
  if(found?.length!==1||!draftId.test(found[0].id))throw new Error("Native draft outcome uncertain; review existing attempt");
  const matches=await db.query(`UPDATE "NativeCodCheckout" SET "draftId"=$3,"state"='ready',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "shop"=$2 AND "draftId" IS NULL RETURNING "id"`,[id,shop,found[0].id]);
  if(matches.length!==1)throw new Error("Native draft binding changed");row=await readNativeCheckout(db,shop,id);
 }
 const link=await readyDraft(admin,row);
 if(!link.paid&&row.state==="needs_review"&&!row.editClaim&&!row.orderId)await db.query(`UPDATE "NativeCodCheckout" SET "state"='ready',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "shop"=$2 AND "editClaim" IS NULL AND "orderId" IS NULL RETURNING "id"`,[id,shop]);
 return link;
}
export const NATIVE_EDIT_BEGIN=`mutation NativeCodBeginEdit($id:ID!) {orderEditBegin(id:$id) {calculatedOrder {id originalOrder {id} totalPriceSet {shopMoney {amount currencyCode}}} userErrors {field message}}}`;
export const NATIVE_EDIT_ADD=`mutation NativeCodAddBalance($id:ID!,$price:MoneyInput!,$taxable:Boolean!) {orderEditAddCustomItem(id:$id,title:"Remaining goods value — pay on delivery",price:$price,quantity:1,requiresShipping:false,taxable:$taxable) {
 calculatedOrder {id originalOrder {id} totalPriceSet {shopMoney {amount currencyCode}} totalOutstandingSet {shopMoney {amount currencyCode}} taxLines {priceSet {shopMoney {amount currencyCode}}}}
 userErrors {field message}}}`;
export const NATIVE_EDIT_COMMIT=`mutation NativeCodCommitEdit($id:ID!) {orderEditCommit(id:$id,notifyCustomer:false,staffNote:"Advance COD: native online payment verified; remaining goods balance due on delivery.") {order {id} userErrors {field message}}}`;
/** The same order retains the genuine gateway receipt; this never creates a second order or a courier record. */
export async function reconcileNativeCheckout(db:NativeCodDatabase,admin:NativeCodAdmin,shop:string,id:string,expectedOrderId?:string){
 const row=await readNativeCheckout(db,shop,id);
 const draft=await readDraft(admin,row);draftIdentity(row,draft);
 if(!draft.order)return {state:"awaiting_payment"};
 if(!orderId.test(draft.order.id)||(expectedOrderId&&draft.order.id!==expectedOrderId)||(row.orderId&&row.orderId!==draft.order.id))throw new Error("Native order binding changed");
 const context:NativeCodContext={...row.quote,draftId:row.draftId!,orderId:draft.order.id};
 const a=nativeCodReference(context).amounts;
 const complete=async()=>{
  const finalOrder=await readNativeCodOrder(admin,context);
  const verified=verifyNativeCodPayment(context,finalOrder,"completed");
  const fields=codOrderBreakdown(context.goodsPaise,context.advancePercent,context.shippingPaise).attributes;
  if(fields.some(field=>{const values=finalOrder.customAttributes.filter(p=>p.key===field.key);return values.length!==1||values[0].value!==field.value;})){
   const keys=new Set([...fields.map(f=>f.key),"Pay now"]);
   const result=(await nativeCodGraphql(admin,`mutation NativeCodOrderDetails($input:OrderInput!) {orderUpdate(input:$input) {order {id} userErrors {field message}}}`,{input:{id:context.orderId,customAttributes:[...finalOrder.customAttributes.filter(p=>!keys.has(p.key)),...fields]}})).orderUpdate;
   if(result?.order?.id!==context.orderId||!Array.isArray(result.userErrors)||result.userErrors.length)throw new Error("Order details update unconfirmed");
   const confirmed=await readNativeCodOrder(admin,context);verifyNativeCodPayment(context,confirmed,"completed");
   if(fields.some(f=>confirmed.customAttributes.filter(p=>p.key===f.key&&p.value===f.value).length!==1))throw new Error("Order detail verification failed");
  }
  await db.query(`UPDATE "NativeCodCheckout" SET "orderId"=$3,"fingerprint"=$4,"state"='completed',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "shop"=$2 AND ("orderId" IS NULL OR "orderId"=$3) RETURNING "id"`,[id,shop,context.orderId,verified.fingerprint]);
  return {state:"completed",orderId:context.orderId,payableNowPaise:a.payableNowPaise,collectPaise:a.collectOnDeliveryPaise};
 };
 try{
  // This also recovers a successful commit whose response was lost. It performs no new mutations.
  const order=await readNativeCodOrder(admin,context);
  if(order.displayFinancialStatus==="PARTIALLY_PAID")return await complete();
  const receipt=verifyNativeCodPayment(context,order,"advance");
  if((await nativeCodPermissions(admin,context)).length)throw new Error("Order edit permission missing");
  const token=randomUUID();
  const claimed=await db.query(`UPDATE "NativeCodCheckout" SET "orderId"=$3,"fingerprint"=$4,"editClaim"=$5,"state"='editing',"updatedAt"=CURRENT_TIMESTAMP
   WHERE "id"=$1 AND "shop"=$2 AND "editClaim" IS NULL AND "state" IN ('ready','needs_review') AND ("orderId" IS NULL OR "orderId"=$3) RETURNING "id"`,[id,shop,context.orderId,receipt.fingerprint,token]);
  if(claimed.length!==1)return {state:"needs_review"};
  const begin=(await nativeCodGraphql(admin,NATIVE_EDIT_BEGIN,{id:context.orderId})).orderEditBegin,calc=begin?.calculatedOrder;
  if(!Array.isArray(begin?.userErrors)||begin.userErrors.length||!/^gid:\/\/shopify\/CalculatedOrder\/[1-9]\d*$/.test(calc?.id)||calc.originalOrder?.id!==context.orderId||inrPaise(calc.totalPriceSet)!==a.payableNowPaise)throw new Error("Order edit could not be started");
  await db.query(`UPDATE "NativeCodCheckout" SET "calculatedId"=$3 WHERE "id"=$1 AND "editClaim"=$2 RETURNING "id"`,[id,token,calc.id]);
  const added=(await nativeCodGraphql(admin,NATIVE_EDIT_ADD,{id:calc.id,price:{amount:(a.collectOnDeliveryPaise/100).toFixed(2),currencyCode:"INR"},taxable:context.balanceTaxable})).orderEditAddCustomItem,c=added?.calculatedOrder;
  if(!Array.isArray(added?.userErrors)||added.userErrors.length||c?.id!==calc.id||c.originalOrder?.id!==context.orderId||inrPaise(c.totalPriceSet)!==a.totalPaise||
   inrPaise(c.totalOutstandingSet)!==a.collectOnDeliveryPaise||!Array.isArray(c.taxLines)||c.taxLines.reduce((n:number,t:{priceSet:Parameters<typeof inrPaise>[0]})=>n+inrPaise(t.priceSet),0)!==context.completedTaxPaise)throw new Error("Final native calculation differs from quote");
  verifyNativeCodPayment(context,await readNativeCodOrder(admin,context),"advance");
  const committed=(await nativeCodGraphql(admin,NATIVE_EDIT_COMMIT,{id:calc.id})).orderEditCommit;
  if(!Array.isArray(committed?.userErrors)||committed.userErrors.length||committed.order?.id!==context.orderId)throw new Error("Native order commit unconfirmed");
  return await complete();
 }catch{await review(db,shop,id);return {state:"needs_review"};}
}
// Referenced by reviewers/tests to ensure no alternate balance description is silently introduced.
export const nativeBalanceTitle=NATIVE_COD_BALANCE_TITLE;
