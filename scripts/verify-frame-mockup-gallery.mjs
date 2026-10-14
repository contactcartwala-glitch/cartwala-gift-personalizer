import fs from 'node:fs';import {execFileSync} from 'node:child_process';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import {Buffer} from 'node:buffer';import ts from 'typescript';import PNGModule from '@pdf-lib/upng';import * as zlib from 'node:zlib';
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>imports[name],Buffer,Response,Uint8Array,Int32Array,ArrayBuffer,DataView});return exports;}
const frameModule=load('app/lib/frame-mockups.ts');const {defaultFrameMockups:defaults,upgradeDefaultFrameMockups}=frameModule;const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cw-frame-beading-'));execFileSync(process.execPath,['scripts/repair-frame-apertures.mjs',directory],{stdio:'ignore'});const {inspectMockupPng}=load('app/lib/png-mockup.server.ts',{'@pdf-lib/upng':{default:PNGModule},'node:zlib':zlib});assert.equal(defaults.length,10);
for(const item of defaults){const b=fs.readFileSync(path.join(directory,`${item.id}.png`));const g=inspectMockupPng(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),item.width/item.height);assert.equal(g.mockupAspect,1);assert.ok(Math.abs(g.x-g.width/2-item.x)<.001);assert.ok(Math.abs(g.y-g.height/2-item.y)<.001);assert.ok(Math.abs(g.width-item.width)<.001);assert.ok(Math.abs(g.height-item.height)<.001);}
const png=PNGModule.default||PNGModule;
const repairedRoom=fs.readFileSync(path.join(directory,'room-01.png'));
const pixels=new Uint8Array(png.toRGBA8(png.decode(repairedRoom.buffer.slice(repairedRoom.byteOffset,repairedRoom.byteOffset+repairedRoom.byteLength)))[0]);
assert.equal(pixels[(126*1254+630)*4+3],255,'Top beading must be opaque');
assert.equal(pixels[(955*1254+630)*4+3],255,'Bottom beading must be opaque');
assert.equal(pixels[(600*1254+630)*4+3],0,'Photo opening must stay transparent');
assert.equal(upgradeDefaultFrameMockups([{...defaults[0],url:'https://cartwala-gift-personalizer.fly.dev/api/frame-mockup/room-01'}])[0].url,defaults[0].url);
const custom={...defaults[0],url:'https://cdn.shopify.com/merchant-custom.png'};
assert.equal(upgradeDefaultFrameMockups([custom])[0],custom,'Keep merchant uploads');
fs.rmSync(directory,{recursive:true,force:true});
const server=load('app/lib/frame-mockups.server.ts',{'./frame-mockups':{defaultFrameMockups:defaults,upgradeDefaultFrameMockups}});let shop={id:'gid://shopify/Shop/1',mockups:null},writes=0;
const admin={graphql:async(query,options)=>{if(query.includes('SaveFrameMockups')){writes++;shop.mockups={compareDigest:'next',jsonValue:JSON.parse(options.variables.metafields[0].value)};return Response.json({data:{metafieldsSet:{userErrors:[]}}});}return Response.json({data:{shop}});}};
assert.equal((await server.loadFrameMockups(admin)).templates.length,10);await server.saveFrameMockups(admin,defaults.slice(1),null);assert.equal((await server.loadFrameMockups(admin)).templates.length,9);await assert.rejects(server.saveFrameMockups(admin,defaults,null),/another tab/);assert.equal(writes,1);await server.saveFrameMockups(admin,[],'next');assert.equal((await server.loadFrameMockups(admin)).templates.length,0);console.log('Frame mockups passed: 10 real PNG apertures, defaults, deletion persistence, delete-all persistence and concurrency protection.');

const collectionScript = fs.readFileSync('extensions/cartwala-personalizer/assets/cartwala-frame-collection-mockups.js', 'utf8');
const chooseBody = collectionScript.match(/const choose = ([\s\S]*?\n  });/)[1];
const choose = vm.runInNewContext(`(${chooseBody})`);
const geometryBody = collectionScript.match(/const geometry = ([\s\S]*?\n  });/)[1];
const geometry = vm.runInNewContext(`(${geometryBody})`);
for (const mockup of defaults) {
  const { art, overlay } = geometry(mockup);
  const n = value => parseFloat(value);
  assert.equal(n(art.width), 50);
  assert.equal(n(art.height), 75);
  assert.ok(Math.abs(n(overlay.left) + mockup.x * n(overlay.width) / 100 - n(art.left)) < 0.001);
  assert.ok(Math.abs(n(overlay.top) + mockup.y * n(overlay.height) / 100 - n(art.top)) < 0.001);
}
const mixed = Array.from({length:500}, (_, index) => choose(`design-${index}`, defaults, 'Portrait').id);
const totals = defaults.map(item => mixed.filter(id => id === item.id).length);
assert.ok(totals.every(total => total >= 25 && total <= 80), 'All ten themes should be mixed across 500 designs');
for (let index = 0; index < 500; index++) {
  const key = `design-${index}`;
  assert.equal(choose(key, defaults, 'Portrait').id, mixed[index], 'Refresh must preserve assignment');
  assert.equal(choose(key, [...defaults].reverse(), 'Portrait').id, mixed[index], 'Template order must preserve assignment');
  const withoutFirst = defaults.slice(1);
  if (mixed[index] !== defaults[0].id) assert.equal(choose(key, withoutFirst, 'Portrait').id, mixed[index], 'Deleting one mockup must retain other assignments');
}
assert.ok(mixed.slice(0,10).some((id,index) => index && id !== mixed[index-1]), 'Do not assign groups of five');
console.log('500-design distribution:', totals.join(', '));
assert.equal(choose(0, [], 'Portrait'), null);
assert.equal(choose(0, defaults, 'Landscape'), null);
vm.runInNewContext(collectionScript, { location: { pathname: '/collections/photo-frames/products/example' }, document: new Proxy({}, { get() { throw new Error('Collection script touched a product page'); } }) });
const gallery = fs.readFileSync('extensions/cartwala-personalizer/assets/cartwala-photo-frame-gallery-v7.js', 'utf8');
assert.equal((gallery.match(/= makeSlide\(/g) || []).length, 4);
assert.doesNotMatch(gallery, /buildScenes|frame-mockup\/manifest|dataset\.mockups/);
assert.match(gallery, /sizeFrame\(roomFrame, width, height, 1\.15\)/);
const manager = fs.readFileSync('app/routes/app.frame-mockups.tsx', 'utf8');
assert.doesNotMatch(manager, /FRAME_PUBLISH|FRAME_REORDER|productUpdate|productReorderMedia/);
console.log('Collection mockups passed: 500 stable mixed designs, mockup reordering/deletion stability, delete-all, orientation filtering, product-page isolation, original four slides and artwork saves without product media mutations.');
