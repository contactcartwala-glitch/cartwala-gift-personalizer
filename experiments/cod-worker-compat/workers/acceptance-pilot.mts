import {runRequest,type WorkerEnv} from './request-context';
import {openDatabase} from './database';
import {authenticate} from './shopify';
import {readOnlyPreflight} from './preflight';
import {runHostedScenario} from './hosted-checkout-fixture';
import {verifyExistingReceipt} from './receipt-preflight';
import {prepareMerchantPilot,PILOT_ID} from './merchant-pilot';
import {registerNativeHooks} from './register-native-hooks';
import {probeCodPublishedTheme,probeCodThemeApi} from './published-theme';
import {prepareNativeRoutePilot,verifyLegacyRoutes} from './native-route-pilot';
import {action as paidWebhook} from '../../../app/routes/webhooks.orders.native-cod';
export default {async fetch(request:Request,env:WorkerEnv){
 const path=new URL(request.url).pathname,headers={'Cache-Control':'no-store'};
 if(path==='/health')return Response.json({checkoutEnabled:false,pilot:'acceptance-only'},{headers});
 if(!['/pilot/preflight','/pilot/checkout-fixture','/pilot/receipt-check','/pilot/prepare-checkout','/pilot/register-hooks','/pilot/theme-check','/pilot/theme-api-check','/pilot/native-quote','/pilot/legacy-check','/pilot/webhook'].includes(path))return new Response(null,{status:404});
 if(!['GET','POST'].includes(request.method)||path==='/pilot/webhook'&&request.method!=='POST')return new Response(null,{status:405});
 if(env.CHECKOUT_ENABLED==='true'||env.PREFLIGHT_ENABLED!=='true')return new Response(null,{status:503});
 const connection=openDatabase(env.DATABASE_URL,env.HYPERDRIVE);
 try{return await runRequest({env,database:connection.database},async()=>{
  if(path==='/pilot/webhook'){
   const verified=await authenticate.webhook(request.clone());
   const attrs=verified.payload?.note_attributes;
   if(verified.topic!=='ORDERS_PAID'||!Array.isArray(attrs)||attrs.filter((x:{name:string;value:string})=>x.name==='_cartwala_cod_intent'&&x.value===PILOT_ID).length!==1)return new Response(null,{status:200});
   // Only the newly prepared merchant pilot reaches production reconciliation; other orders are ignored.
   const {requestContext}=await import('./request-context');requestContext().env={...env,CHECKOUT_ENABLED:'true'};
   return paidWebhook({request,params:{},context:{}});
  }
  // These read-only handlers authenticate their own request exactly once.
  if(path==='/pilot/preflight')return readOnlyPreflight(request);
  if(path==='/pilot/receipt-check')return Response.json(await verifyExistingReceipt(request),{headers});
  await authenticate.public.appProxy(request);
  if(path==='/pilot/native-quote'||path==='/pilot/legacy-check'){
   if(request.method==='GET')return new Response('<!doctype html><meta name="viewport" content="width=device-width"><h1>Cartwala checkout verification</h1><p>Merchant verification only. No payment or shipment. Do not pay any resulting verification draft.</p><form method="post"><button>'+ (path==='/pilot/native-quote'?'Verify customer quote and duplicate-request recovery':'Check existing routes without uploading')+'</button></form>',{headers:{...headers,'Content-Type':'text/html;charset=utf-8'}});
   return path==='/pilot/native-quote'?prepareNativeRoutePilot(request):Response.json(await verifyLegacyRoutes(request),{headers});
  }
  if(path==='/pilot/theme-api-check')return Response.json(await probeCodThemeApi(),{headers});
  if(path==='/pilot/theme-check')return Response.json({readOnly:true,probes:await Promise.all([probeCodPublishedTheme('/'),probeCodPublishedTheme('/cart')])},{headers});
  if(path==='/pilot/register-hooks'){
   if(request.method==='GET')return new Response('<!doctype html><meta name="viewport" content="width=device-width"><h1>Cartwala native COD event setup</h1><p>Registers the three fixed Cloudflare order event destinations. Existing Render hooks stay unchanged. No payment or shipment.</p><form method="post"><button>Register native COD event destinations</button></form>',{headers:{...headers,'Content-Type':'text/html;charset=utf-8'}});
   return Response.json(await registerNativeHooks(),{headers});
  }
  if(path==='/pilot/prepare-checkout'){
   if(request.method==='GET')return new Response('<!doctype html><meta name="viewport" content="width=device-width"><h1>Cartwala Cloudflare merchant pilot</h1><p>Customer checkout stays OFF. Preparing creates one tagged draft, never a payment or shipment.</p><form method="post"><button>Prepare checkout — no charge</button></form>',{headers:{...headers,'Content-Type':'text/html;charset=utf-8'}});
   return Response.json(await prepareMerchantPilot(request),{headers});
  }
  return Response.json(await runHostedScenario(connection.database,new URL(request.url).searchParams.get('scenario')),{headers});
 });}catch(e){if(e instanceof Response)return e;return Response.json({passed:false,error:'Acceptance check failed',checkoutEnabled:false},{status:503,headers});}
 finally{await connection.close().catch(()=>{});}
}};
