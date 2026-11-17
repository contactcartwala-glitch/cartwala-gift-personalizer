import '@shopify/shopify-api/adapters/web-api';
import {shopifyApi, ApiVersion, LogSeverity} from '@shopify/shopify-api';
import {requestContext} from './request-context';
export const SHOP = '0k9icg-ns.myshopify.com';
export const APP_KEY = '3879fe641910f37451baf743e76059ee';
export function configuredApi() {
  const {env} = requestContext();
  if (env.SHOPIFY_API_KEY !== APP_KEY || !env.SHOPIFY_API_SECRET ||
      env.SHOPIFY_API_SECRET.length < 32 || !env.WORKER_ORIGIN) {
    throw new Error('Worker authentication not configured');
  }
  const origin = new URL(env.WORKER_ORIGIN);
  if (origin.protocol !== 'https:' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid Worker origin');
  return shopifyApi({apiKey: APP_KEY, apiSecretKey: env.SHOPIFY_API_SECRET,
    apiVersion: ApiVersion.July26, hostName: origin.hostname, isEmbeddedApp: true,
    logger: {level: LogSeverity.Error, log: () => {}}});
}
export async function readLimitedBody(request: Request, maximum: number) {
  if (!request.body) return '';
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) {await reader.cancel(); throw new Response(null, {status: 413});}
      parts.push(part.value);
    }
  } finally {reader.releaseLock();}
  return Buffer.concat(parts).toString('utf8');
}
async function authenticateProxy(request: Request) {
  const params = new URL(request.url).searchParams;
  const api = configuredApi();
  let valid = false;
  try {valid = await api.utils.validateHmac(params, {signator: 'appProxy'});} catch {}
  if (!valid || params.get('shop') !== SHOP) throw new Response(null, {status: 401});
  requestContext().authenticatedShop = SHOP;
  return {session: {shop: SHOP}};
}
async function authenticateWebhook(request: Request) {
  const api = configuredApi();
  const rawBody = await readLimitedBody(request, 262144);
  const result = await api.webhooks.validate({rawBody, rawRequest: request});
  if (!result.valid || result.domain !== SHOP) throw new Response(null, {status: 401});
  const payload = JSON.parse(rawBody);
  requestContext().authenticatedShop = SHOP;
  return {shop: SHOP, topic: result.topic, payload};
}
async function adminForShop(shop: string) {
  const context = requestContext();
  if (shop !== SHOP || context.authenticatedShop !== shop) throw new Response(null, {status: 401});
  const rows = await context.database.query<{accessToken: string; expires: Date | null}>(
    'SELECT "accessToken","expires" FROM "Session" WHERE "id"=$1 AND "shop"=$2 AND "isOnline"=false',
    [`offline_${shop}`, shop]);
  const session = rows[0];
  if (rows.length !== 1 || !session.accessToken ||
      session.expires && new Date(session.expires).getTime() <= Date.now() + 60000) {
    throw new Error('A current offline session is required');
  }
  return {admin: {
    async graphql(query: string, options: {variables?: unknown; tries?: number; signal?: AbortSignal} = {}) {
      // A preview may verify configuration, but cannot create orders or subscriptions.
      if (!/^\s*query\b/.test(query) && context.env.CHECKOUT_ENABLED !== 'true') {
        throw new Error('Pilot writes disabled');
      }
      if (options.tries !== undefined && options.tries !== 1) throw new Error('Automatic retries disabled');
      return fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
        method: 'POST', redirect: 'manual', signal: options.signal ?? AbortSignal.timeout(20000),
        headers: {'Content-Type': 'application/json', 'X-Shopify-Access-Token': session.accessToken},
        body: JSON.stringify({query, variables: options.variables ?? {}}),
      });
    },
  }};
}
export const authenticate = {public: {appProxy: authenticateProxy}, webhook: authenticateWebhook};
export const unauthenticated = {admin: adminForShop};
