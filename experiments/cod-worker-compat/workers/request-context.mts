import { AsyncLocalStorage } from 'node:async_hooks';
import type { NativeCodDatabase } from '../../../app/lib/native-cod-checkout.server';
export type WorkerEnv = {
  DATABASE_URL?: string;
  HYPERDRIVE?: {connectionString:string};
  SHOPIFY_API_KEY?: string;
  SHOPIFY_API_SECRET?: string;
  WORKER_ORIGIN?: string;
  CHECKOUT_ENABLED?: string;
  PREFLIGHT_ENABLED?: string;
  LEGACY_PROXY_ENABLED?: string;
};
export type RequestContext = {
  env: WorkerEnv;
  database: NativeCodDatabase;
  authenticatedShop?: string;
  publishedTheme?: Promise<string | null>;
};
const requests = new AsyncLocalStorage<RequestContext>();
export function requestContext(): RequestContext {
  const current = requests.getStore();
  if (!current) throw new Error('No active COD request');
  return current;
}
export function runRequest<T>(context: RequestContext, callback: () => T): T {
  return requests.run(context, callback);
}
