import {runRequest,type WorkerEnv} from './request-context';
import {openDatabase} from './database';
import {authenticate} from './shopify';
import {readOnlyPreflight} from './preflight';
import {runHostedScenario} from './hosted-checkout-fixture';
import {verifyExistingReceipt} from './receipt-preflight';
export default {async fetch(request:Request,env:WorkerEnv){
 const path=new URL(request.url).pathname,headers={'Cache-Control':'no-store'};
 if(path==='/health')return Response.json({checkoutEnabled:false,pilot:'acceptance-only'},{headers});
 if(request.method!=='GET'||!['/pilot/preflight','/pilot/checkout-fixture','/pilot/receipt-check'].includes(path))return new Response(null,{status:404});
 if(env.CHECKOUT_ENABLED==='true'||env.PREFLIGHT_ENABLED!=='true')return new Response(null,{status:503});
 const connection=openDatabase(env.DATABASE_URL);
 try{return await runRequest({env,database:connection.database},async()=>{
  await authenticate.public.appProxy(request);
  if(path==='/pilot/preflight')return readOnlyPreflight(request);
  if(path==='/pilot/receipt-check')return Response.json(await verifyExistingReceipt(request),{headers});
  return Response.json(await runHostedScenario(connection.database,new URL(request.url).searchParams.get('scenario')),{headers});
 });}catch(e){if(e instanceof Response)return e;return Response.json({passed:false,error:'Acceptance check failed',checkoutEnabled:false},{status:503,headers});}
 finally{await connection.close().catch(()=>{});}
}};
