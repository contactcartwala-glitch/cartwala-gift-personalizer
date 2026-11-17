import {requestContext} from './request-context';
import {authenticate,unauthenticated,SHOP,APP_KEY} from './shopify';
import {calculateCodQuote} from '../../../app/lib/partial-cod-quote.server';
import {prepareNativeCodPlan} from '../../../app/lib/native-cod-plan.server';
import {createNativeCheckout,nativeCheckoutLink} from '../../../app/lib/native-cod-checkout.server';
import {nativeCodGraphql,nativeCodQuoteReference} from '../../../app/lib/native-cod-payment.server';
export const PILOT_ID='7f2d3978-d494-4919-ac39-921285bec6c8';
export const PAID_HOOKS=`query NativeCodHooks($uri:String!,$topics:[WebhookSubscriptionTopic!]!) {webhookSubscriptions(first:50,uri:$uri,topics:$topics) {nodes {id topic} pageInfo {hasNextPage}}}`;
export const CREATE_PAID_HOOK=`mutation NativeCodHookCreate($topic:WebhookSubscriptionTopic!,$subscription:WebhookSubscriptionInput!) {webhookSubscriptionCreate(topic:$topic,webhookSubscription:$subscription) {webhookSubscription {id} userErrors {field message}}}`;
export async function prepareMerchantPilot(request:Request){
 await authenticate.public.appProxy(request);
 const context=requestContext(),db=context.database,{admin}=await unauthenticated.admin(SHOP);
 // Existing application settings remain unchanged. Only this explicitly tagged merchant pilot can write.
 context.env={...context.env,CHECKOUT_ENABLED:'true'};
 const existing=await db.query<{quote:Parameters<typeof nativeCodQuoteReference>[0]}>('SELECT "quote" FROM "NativeCodCheckout" WHERE "id"=$1 AND "shop"=$2',[PILOT_ID,SHOP]);
 if(existing.length){const link=await nativeCheckoutLink(db,admin,SHOP,PILOT_ID);return {...link,amounts:nativeCodQuoteReference(existing[0].quote).amounts};}
 const saved=await db.query<{enabled:boolean;advancePercent:number;codFeePaise:number;revision:number}>('SELECT "enabled","advancePercent","codFeePaise","revision" FROM "CodThemeReviewSettings" WHERE "shop"=$1',[SHOP]);
 const settings=saved[0];if(saved.length!==1||!settings.enabled)throw Error('Advance COD is OFF');
 const old=await db.query<{quote:{lines:Array<{variantId:string}>}}>('SELECT "quote" FROM "NativeCodCheckout" WHERE "id"=$1 AND "shop"=$2',['bd544aeb-9b6c-4a45-b180-56b034e9f48f',SHOP]);
 const variantId=old[0]?.quote?.lines?.[0]?.variantId;if(!variantId)throw Error('Pilot product is unavailable');
 const frozen=await calculateCodQuote(admin as never,{lines:[{variantId,quantity:1,properties:[]}],discountCodes:[]},settings.advancePercent,settings.codFeePaise,true);
 const plan=await prepareNativeCodPlan(admin,{id:PILOT_ID,shop:SHOP,appClientId:APP_KEY,accounting:frozen.accountingSnapshot,collectAddressAtCheckout:true,percent:settings.advancePercent,feePaise:settings.codFeePaise});
 plan.input.tags=[`CW-NATIVE-${PILOT_ID}`,'Advance COD','CARTWALA CLOUDFLARE PILOT - DO NOT SHIP'];
 const uri=new URL('/pilot/webhook',context.env.WORKER_ORIGIN!).toString();
 const read=async()=>{const c=(await nativeCodGraphql(admin,PAID_HOOKS,{uri,topics:['ORDERS_PAID']})).webhookSubscriptions;if(!Array.isArray(c?.nodes)||c.pageInfo?.hasNextPage!==false)throw Error('Pilot webhook could not be verified');return c.nodes;};
 if(!(await read()).some((x:{topic:string})=>x.topic==='ORDERS_PAID')){
  const r=(await nativeCodGraphql(admin,CREATE_PAID_HOOK,{topic:'ORDERS_PAID',subscription:{uri,format:'JSON',includeFields:['admin_graphql_api_id','note_attributes']}})).webhookSubscriptionCreate;
  if(!r?.webhookSubscription?.id||!Array.isArray(r.userErrors)||r.userErrors.length)throw Error('Pilot webhook registration unconfirmed');
 }
 if((await read()).filter((x:{topic:string})=>x.topic==='ORDERS_PAID').length!==1)throw Error('Pilot webhook needs review');
 const fresh=await db.query<{revision:number;enabled:boolean}>('SELECT "revision","enabled" FROM "CodThemeReviewSettings" WHERE "shop"=$1',[SHOP]);
 if(fresh[0]?.revision!==settings.revision||!fresh[0]?.enabled)throw Error('Settings changed; retry this same pilot');
 const link=await createNativeCheckout(db,admin,plan);
 return {...link,amounts:nativeCodQuoteReference(plan.quote).amounts};
}
