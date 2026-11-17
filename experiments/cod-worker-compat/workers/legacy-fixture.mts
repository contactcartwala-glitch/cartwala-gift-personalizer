import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from './native-worker';
const secret='FICTIONAL_LEGACY_PROXY_SECRET_'.repeat(3);
export default {async fetch(){
 const env={SHOPIFY_API_KEY:'3879fe641910f37451baf743e76059ee',SHOPIFY_API_SECRET:secret,WORKER_ORIGIN:'https://example.workers.dev',LEGACY_PROXY_ENABLED:'true',CHECKOUT_ENABLED:'false'};
 const signed=(path:string,method='GET')=>{
  const p=new URLSearchParams({shop:'0k9icg-ns.myshopify.com',timestamp:String(Math.floor(Date.now()/1000))});
  p.set('signature',createHmac('sha256',secret).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('')).digest('hex'));
  return new Request('https://example.workers.dev'+path+'?'+p,{method,headers:{Cookie:'DO_NOT_FORWARD',Authorization:'DO_NOT_FORWARD','Content-Type':'application/json'},...(method==='POST'?{body:'{"fixture":true}'}:{})});
 };
 for(const method of ['GET','POST']){const r=await worker.fetch(signed('/signature-day/existing',method),env);assert.equal(await r.text(),'legacy fixture');}
 assert.equal((await worker.fetch(new Request('https://example.workers.dev/signature-day/existing'),env)).status,401);
 assert.equal((await worker.fetch(signed('/signature-day/native-cod'),env)).status,503);
 assert.equal((await worker.fetch(signed('/signature-day/native-cod/fake'),env)).status,404);
 assert.equal((await worker.fetch(signed('/auth'),env)).status,404);
 assert.equal((await worker.fetch(signed('/signature-day/existing'),{...env,LEGACY_PROXY_ENABLED:'false'})).status,404);
 return Response.json({passed:true,liveWrites:0});
}};
