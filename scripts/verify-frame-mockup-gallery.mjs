import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {Buffer} from 'node:buffer';import ts from 'typescript';import PNGModule from '@pdf-lib/upng';import * as zlib from 'node:zlib';
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>imports[name],Buffer,Response,Uint8Array,Int32Array,ArrayBuffer,DataView});return exports;}
const {defaultFrameMockups:defaults}=load('app/lib/frame-mockups.ts');const {inspectMockupPng}=load('app/lib/png-mockup.server.ts',{'@pdf-lib/upng':{default:PNGModule},'node:zlib':zlib});assert.equal(defaults.length,10);
for(const item of defaults){const b=Buffer.from(fs.readFileSync(`app/data/frame-mockups/${item.id}.b64`,'utf8'),'base64');const g=inspectMockupPng(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),2/3);assert.equal(g.mockupAspect,1);assert.ok(Math.abs(g.x-g.width/2-item.x)<.001);assert.ok(Math.abs(g.y-g.height/2-item.y)<.001);assert.ok(Math.abs(g.width-item.width)<.001);assert.ok(Math.abs(g.height-item.height)<.001);}
const server=load('app/lib/frame-mockups.server.ts',{'./frame-mockups':{defaultFrameMockups:defaults}});let shop={id:'gid://shopify/Shop/1',mockups:null},writes=0;
const admin={graphql:async(query,options)=>{if(query.includes('SaveFrameMockups')){writes++;shop.mockups={compareDigest:'next',jsonValue:JSON.parse(options.variables.metafields[0].value)};return Response.json({data:{metafieldsSet:{userErrors:[]}}});}return Response.json({data:{shop}});}};
assert.equal((await server.loadFrameMockups(admin)).templates.length,10);await server.saveFrameMockups(admin,defaults.slice(1),null);assert.equal((await server.loadFrameMockups(admin)).templates.length,9);await assert.rejects(server.saveFrameMockups(admin,defaults,null),/another tab/);assert.equal(writes,1);await server.saveFrameMockups(admin,[],'next');assert.equal((await server.loadFrameMockups(admin)).templates.length,0);console.log('Frame mockups passed: 10 real PNG apertures, defaults, deletion persistence, delete-all persistence and concurrency protection.');

const collectionScript = fs.readFileSync('extensions/cartwala-personalizer/assets/cartwala-frame-collection-mockups.js', 'utf8');
const chooseBody = collectionScript.match(/const choose = ([\s\S]*?\n  });/)[1];
const choose = vm.runInNewContext(`(${chooseBody})`);
for (let index = 0; index < 50; index++) assert.equal(choose(index, defaults, 'Portrait').id, defaults[Math.floor(index / 5)].id);
assert.equal(choose(0, [], 'Portrait'), null);
assert.equal(choose(0, defaults, 'Landscape'), null);
vm.runInNewContext(collectionScript, { location: { pathname: '/collections/photo-frames/products/example' }, document: new Proxy({}, { get() { throw new Error('Collection script touched a product page'); } }) });
const gallery = fs.readFileSync('extensions/cartwala-personalizer/assets/cartwala-photo-frame-gallery-v7.js', 'utf8');
assert.equal((gallery.match(/= makeSlide\(/g) || []).length, 4);
assert.doesNotMatch(gallery, /buildScenes|frame-mockup\/manifest|dataset\.mockups/);
assert.match(gallery, /sizeFrame\(roomFrame, width, height, 1\.15\)/);
const manager = fs.readFileSync('app/routes/app.frame-mockups.tsx', 'utf8');
assert.doesNotMatch(manager, /FRAME_PUBLISH|FRAME_REORDER|productUpdate|productReorderMedia/);
console.log('Collection mockups passed: 50 designs in ten groups of five, delete-all, orientation filtering, product-page isolation, original four slides and artwork saves without product media mutations.');
