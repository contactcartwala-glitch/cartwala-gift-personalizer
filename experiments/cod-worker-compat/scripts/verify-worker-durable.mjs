import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {buildWorker} from './build-native-worker.mjs';
const built=await buildWorker({entry:'workers/durable-runtime.mts',write:false});
for(const pilot of ['true','false']) {
  let outbound=0;
  const mf=new Miniflare({modules:true,script:built.outputFiles[0].text,
    compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],
    durableObjects:{COD_RUNTIME:{className:'NativeCodRuntime',useSQLite:true}},
    bindings:{PILOT_RUNTIME:pilot,CHECKOUT_ENABLED:'false',PREFLIGHT_ENABLED:'true',
      SHOPIFY_API_KEY:'3879fe641910f37451baf743e76059ee',
      SHOPIFY_API_SECRET:'FICTIONAL_DO_FIXTURE_SECRET_'.repeat(2),
      WORKER_ORIGIN:'https://fixture.example'},
    outboundService(){outbound++;throw Error('Unauthenticated request must not leave the runtime');}});
  try {
    const health=await mf.dispatchFetch('https://fixture.example/health');
    assert.equal(health.status,200);assert.equal((await health.json()).checkoutEnabled,false);
    assert.equal((await mf.dispatchFetch('https://fixture.example/unknown')).status,404);
    assert.equal((await mf.dispatchFetch('https://fixture.example/health',{method:'DELETE'})).status,405);
    assert.equal((await mf.dispatchFetch('https://fixture.example/signature-day/native-cod')).status,pilot==='true'?404:503);
    assert.equal((await mf.dispatchFetch('https://fixture.example/pilot/preflight')).status,pilot==='true'?401:401);
    if(pilot==='true')assert.equal((await mf.dispatchFetch('https://fixture.example/pilot/webhook',{method:'POST',body:'{}'})).status,401);
    assert.equal(outbound,0);
    console.log(`SQLite Durable Object ${pilot==='true'?'pilot':'native'}: routing, method limits, authentication and customer OFF verified; no external requests.`);
  }finally{await mf.dispose();}
}
