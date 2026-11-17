import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {buildWorker} from './build-native-worker.mjs';
const built = await buildWorker({entry:'workers/availability-fixture.mts',write:false});
for (const scenario of ['188909125817','188999999999','redirect','off']) {
  let storefrontReads = 0;
  const mf = new Miniflare({modules:true,script:built.outputFiles[0].text,
    compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],
    async outboundService(request) {
      if (request.url==='https://cartwala.in/cart') {
        storefrontReads++;
        if (scenario==='redirect') return new Response(null,{status:302,headers:{Location:'https://untrusted.example/'}});
        return new Response(`<head><script>Shopify.theme = {"id":${scenario},"role":"main"};</script></head>`,{headers:{'Content-Type':'text/html'}});
      }
      assert.equal(request.url,'https://0k9icg-ns.myshopify.com/admin/api/2026-07/graphql.json');
      const {query} = await request.json(); assert.ok(query.startsWith('query NativeCodDiscountAccess'));
      return Response.json({data:{currentAppInstallation:{accessScopes:[{handle:'read_discounts'}]}}});
    }});
  try {
    const response = await mf.dispatchFetch(`https://fixture.example/${scenario}`);
    const body = await response.json(); assert.equal(response.status,200,JSON.stringify(body));
    assert.equal(body.checkoutAvailable,!['redirect','off'].includes(scenario),JSON.stringify(body));
    if (!['redirect','off'].includes(scenario)) assert.equal(body.themeId,scenario);
    assert.equal(storefrontReads,scenario==='off'?0:1);
    console.log(`Worker availability ${scenario}: passed; automatic published-theme selection and OFF preserved; no real external calls.`);
  } finally {await mf.dispose();}
}
