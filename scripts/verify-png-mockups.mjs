import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import PNGModule from '@pdf-lib/upng';
const UPNG=PNGModule.default||PNGModule;
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>{if(!(name in imports))throw Error(name);return imports[name];},Blob,Buffer,Response,structuredClone,Date});return exports;}
const {inspectMockupPng}=load('app/lib/png-mockup.server.ts',{'@pdf-lib/upng':{default:PNGModule}});
function png(holes=[],outside=false){const w=400,h=400,a=new Uint8Array(w*h*4).fill(255);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if((outside&&(x<5||x>394||y<5||y>394))||holes.some(([l,t,r,b])=>x>=l&&x<r&&y>=t&&y<b))a[(y*w+x)*4+3]=0;return UPNG.encode([a.buffer],w,h,0);}
const portrait=png([[100,50,300,350]],true),landscape=png([[50,100,350,300]]);
const p=inspectMockupPng(portrait,2/3);assert.equal(p.width,50);assert.equal(p.height,75);assert.equal(p.x,50);assert.equal(p.y,50);assert.equal(p.mockupAspect,1);
assert.equal(inspectMockupPng(landscape,3/2).width,75);
assert.throws(()=>inspectMockupPng(png(),2/3),/No photo opening/);
assert.throws(()=>inspectMockupPng(png([[20,20,120,170],[220,220,320,370]]),2/3),/More than one/);
assert.throws(()=>inspectMockupPng(portrait,3/2),/does not match/);
assert.throws(()=>inspectMockupPng(new ArrayBuffer(32),1),/Choose a PNG/);
const {orderedPrintSize}=load('app/lib/print-dimensions.ts');
assert.equal(orderedPrintSize({}),null);
const size=orderedPrintSize({'_Cartwala Print Width':'24','_Cartwala Print Height':'36'});assert.equal(size.width,7200);assert.equal(size.height,10800);assert.equal(size.dpi,300);
assert.throws(()=>orderedPrintSize({'_Cartwala Print Width':'100','_Cartwala Print Height':'100'}),/too large/);
const {printPngWithDpi}=load('app/lib/png-print-density.client.ts');
const print=await printPngWithDpi(new Blob([portrait]));const decoded=UPNG.decode(await print.arrayBuffer());assert.equal(decoded.tabs.pHYs[0],11811);assert.equal(decoded.tabs.pHYs[1],11811);assert.equal(decoded.tabs.pHYs[2],1);assert.equal(UPNG.toRGBA8(decoded)[0].byteLength,400*400*4);
const core=load('app/lib/product-groups.ts');const server=load('app/lib/product-groups.server.ts',{'../db.server':{default:{}},'./product-groups':core});
const group=core.emptyGroup('png');group.tags=['frames'];group.portraitTag='frames-portrait';group.landscapeTag='frames-landscape';
group.rows=[{id:'a',values:['8x12','3mm'],price:750,compare:1050,width:8,height:12,templates:{Portrait:core.emptyTemplate(),Landscape:{...core.emptyTemplate(),...inspectMockupPng(landscape,3/2),mockup:'https://example.com/landscape.png'}}}];
const product={id:'gid://shopify/Product/1',title:'Landscape birthday',handle:'birthday',tags:['frames-landscape'],collectionIds:[],image:'',config:null,designRatio:'3:2',variants:[{id:'gid://shopify/ProductVariant/1',price:'1',compareAtPrice:null,selectedOptions:[{name:'Size',value:'8x12'},{name:'Material',value:'3mm'}]}],truncated:false,collectionsTruncated:false};
let calls=[];const admin={graphql:async(q,{variables})=>{calls.push({q,variables});return new Response(JSON.stringify({data:q.includes('GroupVariantPrices')?{productVariantsBulkUpdate:{userErrors:[]}}:{metafieldsSet:{userErrors:[]}}}));}};
assert.equal((await server.syncGroupProduct(admin,[group],product)).status,'updated');
const config=JSON.parse(calls[1].variables.metafields[0].value);assert.equal(config.fixedDirection,'Landscape');assert.equal(config.customization,'design');assert.equal(config.previews['1'].widthInches,12);assert.equal(config.previews['1'].mockup,'https://example.com/landscape.png');
calls=[];assert.equal((await server.syncGroupProduct(admin,[group],{...product,tags:['frames'],designRatio:undefined})).status,'error');assert.equal(calls.length,0);
calls=[];assert.equal((await server.syncGroupProduct(admin,[group],{...product,designRatio:'1:1',variants:[{...product.variants[0],selectedOptions:[{name:'Title',value:'Default Title'}]}]})).status,'error');assert.equal(calls.length,0);
// 1,000 products are processed in resumable batches, without repeats.
const catalog=Array.from({length:1000},(_,i)=>({...product,id:`gid://shopify/Product/${i+1}`}));let cursor='',updated=0,rounds=0;calls=[];do{const report=await server.syncGroups(admin,[group],catalog,cursor);updated+=report.updated;cursor=report.nextCursor;rounds++;assert.equal(report.errors.length,0);}while(cursor);assert.equal(updated,1000);assert.equal(rounds,67);const writes=calls.filter(c=>c.variables.metafields).map(c=>c.variables.metafields[0].ownerId);assert.equal(new Set(writes).size,1000);
console.log('PNG mockups passed: opening detection, P/L ratios, invalid uploads, independent print density/dimensions, tag direction, preflight safety and 1,000-product batch simulation.');
