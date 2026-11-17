import {authenticate} from './shopify';
/** Only existing app-proxy paths can reach the unchanged Render application. */
export async function forwardLegacyProxy(request:Request):Promise<Response>{
  const url=new URL(request.url);
  if(!['GET','POST'].includes(request.method)||
    !(url.pathname==='/signature-day'||url.pathname.startsWith('/signature-day/'))||
    url.pathname==='/signature-day/native-cod'||url.pathname.startsWith('/signature-day/native-cod/'))
    return new Response(null,{status:404});
  await authenticate.public.appProxy(request);
  const target=new URL(url.pathname+url.search,'https://cartwala-gift-personalizer-1.onrender.com');
  const headers=new Headers(request.headers);
  for(const name of ['host','cookie','authorization','content-length','connection'])headers.delete(name);
  return fetch(target,{method:request.method,headers,body:request.method==='POST'?request.body:undefined,
    redirect:'manual',signal:AbortSignal.timeout(25000)});
}
