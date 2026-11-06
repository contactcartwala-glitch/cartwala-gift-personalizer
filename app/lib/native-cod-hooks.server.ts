import {nativeCodGraphql,type NativeCodAdmin} from "./native-cod-payment.server";
const uri="https://cartwala-gift-personalizer-1.onrender.com/webhooks/orders/native-cod";
const topics=["ORDERS_PAID","ORDERS_CANCELLED","REFUNDS_CREATE"] as const;
export const NATIVE_READ_HOOKS=`query NativeCodHooks($uri:String!,$topics:[WebhookSubscriptionTopic!]!) {webhookSubscriptions(first:50,uri:$uri,topics:$topics) {nodes {id topic} pageInfo {hasNextPage}}}`;
export const NATIVE_CREATE_HOOK=`mutation NativeCodHookCreate($topic:WebhookSubscriptionTopic!,$subscription:WebhookSubscriptionInput!) {webhookSubscriptionCreate(topic:$topic,webhookSubscription:$subscription) {webhookSubscription {id} userErrors {field message}}}`;
/** Installed-app subscriptions only. Events carry identifiers; current payment state is always re-read. */
export async function ensureNativeCodHooks(admin:NativeCodAdmin){
 const read=async()=>{
  const connection=(await nativeCodGraphql(admin,NATIVE_READ_HOOKS,{uri,topics})).webhookSubscriptions;
  if(!Array.isArray(connection?.nodes)||connection.pageInfo?.hasNextPage!==false)throw new Error("Native event subscriptions need review");
  return connection.nodes as Array<{id:string;topic:string}>;
 };
 const existing=await read();
 for(const topic of topics){
  if(existing.some(x=>x.topic===topic))continue;
  // No automatic retry after an uncertain create. The next explicit attempt first reads existing subscriptions.
  const result=(await nativeCodGraphql(admin,NATIVE_CREATE_HOOK,{topic,subscription:{uri,format:"JSON",includeFields:topic==="REFUNDS_CREATE"?["order_id"]:["admin_graphql_api_id","note_attributes"]}})).webhookSubscriptionCreate;
  if(!result?.webhookSubscription?.id||!Array.isArray(result.userErrors)||result.userErrors.length)throw new Error("Native event subscription unconfirmed");
 }
 const confirmed=await read();
 if(topics.some(topic=>!confirmed.some(x=>x.topic===topic)))throw new Error("Native payment events not ready");
}
