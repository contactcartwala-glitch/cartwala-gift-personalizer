import paymentFixture from './compat-fixture';
import securityFixture from './security-fixture';
import nativeWorker from './native-worker';
/** Deliberately ignores supplied bindings. This public pilot cannot connect to a real store or database. */
export default {async fetch(request: Request) {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/compat') return paymentFixture.fetch(request);
  if (request.method === 'GET' && path === '/security') return securityFixture.fetch();
  return nativeWorker.fetch(request, {CHECKOUT_ENABLED:'false'});
}};
