import {requestContext} from './request-context';
import {nativeCodGraphql, type NativeCodAdmin} from '../../../app/lib/native-cod-payment.server';
const NATIVE_READ_HOOKS = `query NativeCodHooks($uri:String!,$topics:[WebhookSubscriptionTopic!]!) {webhookSubscriptions(first:50,uri:$uri,topics:$topics) {nodes {id topic} pageInfo {hasNextPage}}}`;
/** Registration is an explicit cutover step. Requests never silently change webhook destinations. */
export async function ensureNativeCodHooks(admin: NativeCodAdmin) {
  const origin = requestContext().env.WORKER_ORIGIN;
  if (!origin) throw new Error('Worker origin required');
  const topics = ['ORDERS_PAID', 'ORDERS_CANCELLED', 'REFUNDS_CREATE'];
  const uri = new URL('/webhooks/orders/native-cod', origin).toString();
  const connection = (await nativeCodGraphql(admin, NATIVE_READ_HOOKS, {uri, topics})).webhookSubscriptions;
  if (connection?.pageInfo?.hasNextPage !== false || !Array.isArray(connection.nodes) ||
      topics.some(topic => connection.nodes.filter((row: {topic: string}) => row.topic === topic).length !== 1)) {
    throw new Error('Worker event delivery must be verified before checkout');
  }
}
