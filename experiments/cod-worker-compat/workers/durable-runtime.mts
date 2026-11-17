import {DurableObject} from 'cloudflare:workers';
import pilot from './acceptance-pilot';
import native from './native-worker';
import type {WorkerEnv} from './request-context';

type RuntimeEnv = WorkerEnv & {
  PILOT_RUNTIME?:string;
  COD_RUNTIME?:{getByName(name:string):{fetch(request:Request):Promise<Response>}};
};
/** Compute isolation only. PostgreSQL remains the authoritative order store.
 * No payment, token, request or database connection is kept on this object.
 * Durable Object compute has a separate CPU budget on the Free plan.
 */
export class NativeCodRuntime extends DurableObject<RuntimeEnv> {
  async fetch(request:Request):Promise<Response> {
    const isPilot=this.env.PILOT_RUNTIME==='true'||new URL(request.url).pathname.startsWith('/pilot/');
    // Signed pilot receipt/preflight recovery remains separate from the customer
    // activation flag. These handlers still enforce their own authentication.
    return isPilot?pilot.fetch(request,{...this.env,CHECKOUT_ENABLED:'false'}):native.fetch(request,this.env);
  }
}
export default {
  async fetch(request:Request,env:RuntimeEnv):Promise<Response> {
    const path=new URL(request.url).pathname;
    const known=path==='/health'||path==='/signature-day'||path.startsWith('/signature-day/')||
      path==='/webhooks/orders/native-cod'||[
        '/pilot/preflight','/pilot/checkout-fixture','/pilot/receipt-check',
        '/pilot/prepare-checkout','/pilot/register-hooks','/pilot/theme-check','/pilot/theme-api-check','/pilot/webhook',
      ].includes(path);
    if(!known)return new Response(null,{status:404});
    if(!['GET','POST'].includes(request.method))return new Response(null,{status:405});
    if(!env.COD_RUNTIME)return Response.json({checkoutAvailable:false,error:'Runtime not configured'},
      {status:503,headers:{'Cache-Control':'no-store'}});
    // Fixed shop identity prevents unauthenticated callers creating unbounded objects.
    // Authentication and all existing checkout guards execute inside the runtime.
    return env.COD_RUNTIME.getByName('cartwala-native-cod-v1').fetch(request);
  },
};
