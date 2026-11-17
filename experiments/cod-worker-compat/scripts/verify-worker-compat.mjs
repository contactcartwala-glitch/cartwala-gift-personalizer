import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
const r=await build({entryPoints:['workers/compat-fixture.ts'],bundle:true,platform:'neutral',format:'esm',write:false,external:['node:*']});
const script=new TextDecoder().decode(r.outputFiles[0].contents);
const mf=new Miniflare({modules:true,script,compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat']});
try{for(let i=0;i<2;i++){const response=await mf.dispatchFetch('http://fixture.local/compat');const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.passed,true);console.log(JSON.stringify({runtime:'workerd',attempt:i+1,bundleBytes:r.outputFiles[0].contents.length,...body}));}assert.equal((await mf.dispatchFetch('http://fixture.local/')).status,404);}finally{await mf.dispose();}
