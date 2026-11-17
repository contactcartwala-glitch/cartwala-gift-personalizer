import {runRequest, type WorkerEnv} from './request-context';
import {openDatabase} from './database';
import {loader, action} from '../../../app/routes/signature-day.native-cod';
import {action as webhook} from '../../../app/routes/webhooks.orders.native-cod';
import {readOnlyPreflight} from './preflight';
import {forwardLegacyProxy} from './legacy-proxy';
const headers = {'Cache-Control': 'no-store'};
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET') {
      return Response.json({service: 'cartwala-cod-isolated-pilot', checkoutEnabled: env.CHECKOUT_ENABLED === 'true'}, {headers});
    }
    if (path === '/pilot/preflight' && request.method === 'GET' && env.PREFLIGHT_ENABLED === 'true' && env.CHECKOUT_ENABLED !== 'true') {
      const connection = openDatabase(env.DATABASE_URL,env.HYPERDRIVE);
      try {return await runRequest({env,database:connection.database}, () => readOnlyPreflight(request));}
      catch (error) {
        if (error instanceof Response) return error;
        return Response.json({readOnly:true,ready:false,error:'Preflight could not be verified'}, {status:503,headers});
      } finally {await connection.close().catch(() => {});}
    }
    if (!['/signature-day/native-cod', '/webhooks/orders/native-cod'].includes(path)) {
      if(env.LEGACY_PROXY_ENABLED==='true'&&(path==='/signature-day'||path.startsWith('/signature-day/'))){
        try{return await runRequest({env,database:{async query(){throw new Error('Legacy routing cannot query the database');}}},()=>forwardLegacyProxy(request));}
        catch(error){return error instanceof Response?error:new Response(null,{status:503,headers});}
      }
      return new Response(null, {status: 404, headers});
    }
    if (env.CHECKOUT_ENABLED !== 'true') {
      return Response.json({checkoutAvailable: false, error: 'Isolated pilot; customer checkout disabled'}, {status: 503, headers});
    }
    if (!['GET', 'POST'].includes(request.method) || path.startsWith('/webhooks/') && request.method !== 'POST') {
      return new Response(null, {status: 405, headers});
    }
    const connection = openDatabase(env.DATABASE_URL,env.HYPERDRIVE);
    try {
      return await runRequest({env, database: connection.database}, async () => {
        const args = {request, params: {}, context: {}};
        return path.startsWith('/webhooks/') ? webhook(args) : request.method === 'GET' ? loader(args) : action(args);
      });
    } catch (error) {
      if (error instanceof Response) return error;
      // Do not expose database URLs, SQL text, access tokens or request bodies.
      return Response.json({checkoutAvailable: false, error: 'Checkout service temporarily unavailable'}, {status: 503, headers});
    } finally {await connection.close().catch(() => {});}
  },
};
