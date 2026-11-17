import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {runRequest} from './request-context';
import {readOnlyPreflight} from './preflight';
import {SHOP, APP_KEY} from './shopify';
export default {async fetch() {
  const secret = 'FICTIONAL_PREFLIGHT_SECRET_'.repeat(3);
  const env = {SHOPIFY_API_KEY:APP_KEY, SHOPIFY_API_SECRET:secret,
    WORKER_ORIGIN:'https://example.workers.dev', CHECKOUT_ENABLED:'false'};
  const calls: string[] = [];
  const database = {async query<T>(sql: string): Promise<T[]> {
    calls.push(sql);
    if (sql === 'BEGIN READ ONLY' || sql === 'ROLLBACK') return [];
    assert.ok(sql.startsWith('SELECT '), 'Read-only preflight must never write SQL');
    if (sql.includes('"CodThemeReviewSettings"')) return [{revision:12}] as T[];
    if (sql.includes('"NativeCodCheckout"')) return [];
    if (sql.includes('"Session"')) return [{accessToken:'FICTIONAL_PREFLIGHT_TOKEN',expires:null}] as T[];
    throw Error('Unexpected SQL');
  }};
  const params = new URLSearchParams({shop:SHOP,timestamp:String(Math.floor(Date.now()/1000))});
  const message = [...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('');
  params.set('signature',createHmac('sha256',secret).update(message).digest('hex'));
  try {
    const response = await runRequest({env,database}, () => readOnlyPreflight(new Request(`https://example.workers.dev/pilot/preflight?${params}`)));
    const result = await response.json();
    assert.equal(result.readOnly,true); assert.equal(result.checkoutEnabled,false);
    assert.equal(calls[0],'BEGIN READ ONLY'); assert.equal(calls.at(-1),'ROLLBACK');
    assert.ok(!JSON.stringify(result).includes('TOKEN'));
    return Response.json(result);
  } catch (e) {return Response.json({passed:false,error:String(e),rolledBack:calls.at(-1)==='ROLLBACK'}, {status:500});}
}};
