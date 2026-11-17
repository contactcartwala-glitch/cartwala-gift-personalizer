import {requestContext} from './request-context';
import {unauthenticated,SHOP} from './shopify';
import {nativeCodGraphql} from '../../../app/lib/native-cod-payment.server';
import {ensureNativeCodHooks} from './hooks';
import {PAID_HOOKS,CREATE_PAID_HOOK} from './merchant-pilot';
/** Explicit signed merchant cutover step; cannot choose a destination or topic. */
export async function registerNativeHooks(){
 const context=requestContext();context.env={...context.env,CHECKOUT_ENABLED:'true'};
 const {admin}=await unauthenticated.admin(SHOP);
 const uri=new URL('/webhooks/orders/native-cod',context.env.WORKER_ORIGIN!).toString();
 const topics=['ORDERS_PAID','ORDERS_CANCELLED','REFUNDS_CREATE'];
 const found=(await nativeCodGraphql(admin,PAID_HOOKS,{uri,topics})).webhookSubscriptions;
 if(!Array.isArray(found?.nodes)||found.pageInfo?.hasNextPage!==false)throw Error('Webhook registration cannot be verified');
 for(const topic of topics){
  const matching=found.nodes.filter((row:{topic:string})=>row.topic===topic);
  if(matching.length>1)throw Error('Duplicate event destination requires review');
  if(matching.length)continue;
  const includeFields=topic==='REFUNDS_CREATE'?['order_id']:['admin_graphql_api_id','note_attributes'];
  const created=(await nativeCodGraphql(admin,CREATE_PAID_HOOK,{topic,subscription:{uri,format:'JSON',includeFields}})).webhookSubscriptionCreate;
  if(!created?.webhookSubscription?.id||!Array.isArray(created.userErrors)||created.userErrors.length)throw Error('Webhook registration unconfirmed');
 }
 await ensureNativeCodHooks(admin);
 return {registered:true,verifiedTopics:topics,oldDestinationsChanged:false,payments:0};
}
