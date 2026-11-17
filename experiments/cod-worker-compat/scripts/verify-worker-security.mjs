import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {buildWorker} from './build-native-worker.mjs';
const built = await buildWorker({entry:'workers/security-fixture.mts',write:false});
let outbound = 0;
const mf = new Miniflare({modules:true, script:built.outputFiles[0].text,
  compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],
  outboundService() {outbound++; throw Error('Fixture must not access external services');}});
try {
  const response = await mf.dispatchFetch('https://example.com/fixture');
  const body = await response.json();
  assert.equal(response.status,200,JSON.stringify(body)); assert.equal(body.passed,true);
  assert.equal(outbound,0); console.log(JSON.stringify(body));
} finally {await mf.dispose();}
