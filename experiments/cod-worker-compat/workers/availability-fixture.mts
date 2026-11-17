import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {runRequest} from './request-context';
import {loader} from '../../../app/routes/signature-day.native-cod';
import {SHOP, APP_KEY} from './shopify';
export default {async fetch(request: Request) {
  const secret = 'FICTIONAL_AVAILABILITY_SECRET_'.repeat(3);
  const settings = {enabled:!request.url.includes('/off'),customerEnabled:true,advancePercent:20,codFeePaise:5000,revision:12};
  const env = {SHOPIFY_API_KEY:APP_KEY,SHOPIFY_API_SECRET:secret,WORKER_ORIGIN:'https://example.workers.dev',CHECKOUT_ENABLED:'false'};
  const database = {async query<T>(sql:string):Promise<T[]> {
    if (sql.startsWith('INSERT INTO "CodThemeReviewSettings"')) return [];
    if (sql.includes('FROM "CodThemeReviewSettings"')) return [settings] as T[];
    if (sql.includes('FROM "Session"')) return [{accessToken:'FICTIONAL_AVAILABILITY_TOKEN',expires:null}] as T[];
    throw Error('Unexpected fixture SQL');
  }};
  const params = new URLSearchParams({shop:SHOP,timestamp:String(Math.floor(Date.now()/1000))});
  params.set('signature',createHmac('sha256',secret).update([...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('')).digest('hex'));
  const response = await runRequest({env,database}, () => loader({request:new Request(`https://example.workers.dev/signature-day/native-cod?${params}`),params:{},context:{}}));
  const body = await response.json(); assert.equal(body.advancePercent,20); assert.equal(body.codFeePaise,5000);
  return Response.json(body);
}};
