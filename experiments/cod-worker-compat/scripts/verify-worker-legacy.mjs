import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {buildWorker} from './build-native-worker.mjs';
const r=await buildWorker({entry:'workers/legacy-fixture.mts',write:false});let calls=0;
const mf=new Miniflare({modules:true,script:r.outputFiles[0].text,compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],async outboundService(req){
 calls++;const u=new URL(req.url);assert.equal(u.origin,'https://cartwala-gift-personalizer-1.onrender.com');assert.equal(u.pathname,'/signature-day/existing');
 assert.equal(req.headers.has('cookie'),false);assert.equal(req.headers.has('authorization'),false);
 if(req.method==='POST')assert.equal(await req.text(),'{"fixture":true}');return new Response('legacy fixture');
}});
try{const res=await mf.dispatchFetch('https://fixture.test');const body=await res.json();assert.equal(body.passed,true,JSON.stringify(body));assert.equal(calls,2);console.log('Legacy gateway: signed GET/POST preserve existing paths; cookies/auth stripped; unsigned, non-proxy, native and disabled requests never forwarded. Synthetic calls only.');}finally{await mf.dispose();}
