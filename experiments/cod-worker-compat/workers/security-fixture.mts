import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {runRequest, requestContext} from './request-context';
import {authenticate, unauthenticated, SHOP, APP_KEY, readLimitedBody} from './shopify';
import nativeWorker from './native-worker';
const secret = 'FICTIONAL_WORKER_FIXTURE_SECRET_'.repeat(2);
const env = {SHOPIFY_API_KEY: APP_KEY, SHOPIFY_API_SECRET: secret,
  WORKER_ORIGIN: 'https://example.workers.dev', CHECKOUT_ENABLED: 'false'};
function signedProxy(extra: Array<[string, string]> = [], shop = SHOP, age = 0) {
  const params = new URLSearchParams([['shop', shop], ['timestamp', String(Math.floor(Date.now()/1000) - age)],
    ['path_prefix', '/apps/cartwala-signature-day-1'], ['logged_in_customer_id', ''], ...extra]);
  const grouped: Record<string, string[]> = {};
  for (const [k,v] of params) (grouped[k] ??= []).push(v);
  const message = Object.keys(grouped).sort((a,b) => a.localeCompare(b)).map(k => `${k}=${grouped[k].join(',')}`).join('');
  params.set('signature', createHmac('sha256', secret).update(message).digest('hex'));
  return new Request(`https://example.workers.dev/signature-day/native-cod?${params}`);
}
function signedWebhook(body: string, shop = SHOP) {
  return new Request('https://example.workers.dev/webhooks/orders/native-cod', {method: 'POST', body,
    headers: {'X-Shopify-Hmac-Sha256': createHmac('sha256', secret).update(body).digest('base64'),
      'X-Shopify-Shop-Domain': shop, 'X-Shopify-Topic': 'orders/paid',
      'X-Shopify-Api-Version': '2026-07', 'X-Shopify-Webhook-Id': 'fixture-event-id'}});
}
export async function runSecurityFixture() {
  let queries = 0;
  const database = {async query<T>(sql: string, values: unknown[]): Promise<T[]> {
    queries++;
    assert.ok(sql.includes('FROM "Session"')); assert.deepEqual(values, [`offline_${SHOP}`, SHOP]);
    return [{accessToken: 'FICTIONAL_NEVER_SENT_TOKEN', expires: null}] as T[];
  }};
  await runRequest({env, database}, async () => {
    await assert.rejects(() => unauthenticated.admin(SHOP)); assert.equal(queries, 0);
    assert.equal((await authenticate.public.appProxy(signedProxy([['extra','1'],['extra','2']]))).session.shop, SHOP);
    const {admin} = await unauthenticated.admin(SHOP);
    await assert.rejects(() => admin.graphql('mutation { definitelyForbidden }'));
    await assert.rejects(() => authenticate.public.appProxy(signedProxy([], SHOP, 300)));
    await assert.rejects(() => authenticate.public.appProxy(signedProxy([], 'other.myshopify.com')));
    await assert.rejects(() => authenticate.public.appProxy(signedProxy([['shop', SHOP]])));
    const request = signedProxy();
    const changed = new URL(request.url); changed.searchParams.set('path_prefix', '/forged');
    await assert.rejects(() => authenticate.public.appProxy(new Request(changed)));
    const body = '{"admin_graphql_api_id":"gid://shopify/Order/1"}';
    assert.equal((await authenticate.webhook(signedWebhook(body))).topic, 'ORDERS_PAID');
    await assert.rejects(() => authenticate.webhook(signedWebhook(body, 'other.myshopify.com')));
    const headers = signedWebhook(body).headers;
    await assert.rejects(() => authenticate.webhook(new Request('https://example.workers.dev/webhooks/orders/native-cod', {method:'POST',headers,body:'{}'})));
    await assert.rejects(() => readLimitedBody(new Request('https://example.com', {method:'POST',body:'x'.repeat(100)}), 50));
  });
  assert.throws(() => requestContext());
  await Promise.all(Array.from({length: 16}, (_, i) => runRequest({env:{CHECKOUT_ENABLED:String(i)},database}, async () => {
    await Promise.resolve(); assert.equal(requestContext().env.CHECKOUT_ENABLED, String(i));
  })));
  const disabled = await nativeWorker.fetch(signedProxy(), {});
  assert.equal(disabled.status, 503); assert.equal((await disabled.json()).checkoutAvailable, false);
  assert.equal((await nativeWorker.fetch(new Request('https://example.workers.dev/unknown'), {})).status, 404);
  const health = await nativeWorker.fetch(new Request('https://example.workers.dev/health'), {});
  assert.equal((await health.json()).checkoutEnabled, false);
  return {fixtureOnly:true, passed:true, checks:['official SDK proxy authentication','duplicate/stale/forged/foreign proxy rejection',
    'raw-body webhook authentication','foreign/tampered webhook rejection','bounded body',
    'request secret isolation','offline session binding','pilot mutation guard','disabled checkout guard'], externalRequests:0,shopifyWrites:0};
}
export default {async fetch() {
  try {return Response.json(await runSecurityFixture());}
  catch (e) {return Response.json({passed:false,error:String(e)}, {status:500});}
}};
