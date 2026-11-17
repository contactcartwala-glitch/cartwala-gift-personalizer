import {runRequest, type WorkerEnv} from './request-context';
import {openDatabase} from './database';
import {readOnlyPreflight} from './preflight';
/** Temporary signed read-only pilot. It has no checkout or webhook mutation handlers. */
export default {async fetch(request:Request,env:WorkerEnv) {
  const path=new URL(request.url).pathname;
  const headers={'Cache-Control':'no-store'};
  if(path==='/health')return Response.json({service:'cartwala-cod-readonly-pilot',checkoutEnabled:false},{headers});
  if(path!=='/pilot/preflight'||request.method!=='GET')return new Response(null,{status:404});
  if(env.CHECKOUT_ENABLED==='true'||env.PREFLIGHT_ENABLED!=='true')return new Response(null,{status:503});
  const connection=openDatabase(env.DATABASE_URL,env.HYPERDRIVE);let phase='authentication';
  const database={async query<T>(sql:string,params:unknown[]):Promise<T[]> {
    if(sql==='BEGIN READ ONLY')phase='database_connection';
    else if(sql.includes('CodThemeReviewSettings'))phase='database_settings';
    else if(sql.includes('NativeCodCheckout'))phase='database_checkout_table';
    else if(sql.includes('FROM "Session"'))phase='offline_session';
    const result=await connection.database.query<T>(sql,params);
    if(sql.includes('FROM "Session"'))phase='shopify_permissions';
    return result;
  }};
  try{return await runRequest({env,database},()=>readOnlyPreflight(request));}
  catch(error){
    if(error instanceof Response)return error;
    const e=error as {code?:string;message?:string};
    let reason='verification_failed';
    if(/^(?:[0-9A-Z]{5}|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|SHOPIFY_HTTP_[1-5][0-9]{2}_(?:JSON|HTML|OTHER)|SHOPIFY_GRAPHQL_[A-Z_]{1,50})$/.test(e.code??''))reason=e.code!;
    else if(/certificate|tls|ssl/i.test(e.message??''))reason='tls_verification';
    else if(/timeout/i.test(e.message??''))reason='connection_timeout';
    else if(e.message==='A current offline session is required')reason='offline_session_unavailable';
    else if(e.message==='The native checkout belongs to a different shop or app')reason='app_identity_mismatch';
    else if(e.message==='Native order permissions missing')reason='permissions_missing';
    else if(e.message==='App permissions could not be confirmed')reason='permissions_response_missing';
    else if(e.message==='Shopify native checkout response could not be verified')reason='shopify_response_unverified';
    else if(e.message==='Shopify native checkout response was not acknowledged')reason='shopify_response_unacknowledged';
    else if(e.message==='Pilot writes disabled')reason='pilot_write_guard';
    else if(e.message==='Automatic retries disabled')reason='retry_guard';
    else if(/fetch failed/i.test(e.message??''))reason='shopify_fetch_failed';
    else if(/Cannot perform I\/O/i.test(e.message??''))reason='request_context_io';
    else if(/not defined/.test(e.message??''))reason='runtime_reference';
    else if(/is not a function/.test(e.message??''))reason='runtime_function';
    else if(/redirect/.test(e.message??''))reason='redirect_option';
    const kind=(error as Error).name;
    return Response.json({readOnly:true,ready:false,phase,reason,errorType:/^[A-Za-z]{1,30}$/.test(kind)?kind:'Error',detail:(error as {safeDetail?:string}).safeDetail,checkoutEnabled:false},{status:503,headers});
  }finally{await connection.close().catch(()=>{});}
}};
