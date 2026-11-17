import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {buildWorker} from './build-native-worker.mjs';
const built = await buildWorker({entry:'workers/preflight-fixture.mts',write:false});
for (const scenario of ['valid','missing_scope','wrong_app']) {
  let external = 0;
  const mf = new Miniflare({modules:true,script:built.outputFiles[0].text,
    compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],
    async outboundService(request) {
      external++;
      assert.equal(request.url,'https://0k9icg-ns.myshopify.com/admin/api/2026-07/graphql.json');
      assert.equal(request.headers.get('X-Shopify-Access-Token'),'FICTIONAL_PREFLIGHT_TOKEN');
      const body = await request.json();
      assert.ok(body.query.startsWith('query NativeCodPermissions'));
      return Response.json({data:{shop:{myshopifyDomain:'0k9icg-ns.myshopify.com'},
        currentAppInstallation:{app:{apiKey:scenario==='wrong_app'?'b'.repeat(32):'3879fe641910f37451baf743e76059ee'},
          accessScopes:['read_orders','write_orders','write_draft_orders',...(scenario==='missing_scope'?[]:['write_order_edits'])].map(handle=>({handle}))}}});
    }});
  try {
    const response = await mf.dispatchFetch('https://fixture.example/');
    const body = await response.json();
    assert.equal(external,1,JSON.stringify(body));
    if (scenario==='wrong_app') {assert.equal(response.status,500);assert.equal(body.rolledBack,true);}
    else {assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.permissionsReady,scenario==='valid');}
    console.log(`Read-only preflight ${scenario}: passed; synthetic network only; no real database/store writes.`);
  } finally {await mf.dispose();}
}
