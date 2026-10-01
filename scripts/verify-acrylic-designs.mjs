import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import ts from 'typescript';
const load=(p,imports={})=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:p=>imports[p],URL,structuredClone});return exports;};
const core=load('app/lib/acrylic-design.ts');
const rows=[{size:'8×12',price3:750,price5:1125},{size:'12×18',price3:1250,price5:2125},{size:'36×48',price3:8000,price5:9500}];
assert.equal(core.compatibleAcrylicSizes('1200:1800','Portrait',rows).length,2);
assert.equal(core.compatibleAcrylicSizes('1800:1200','Landscape',rows).length,2);
assert.equal(core.compatibleAcrylicSizes('3:4','Portrait',rows)[0].size,'36×48');
assert.throws(()=>core.compatibleAcrylicSizes('1800:1200','Portrait',rows));
assert.equal(core.normalizeAcrylicDesign({masterProductId:'gid://shopify/Product/other',orientation:'Portrait'}),undefined);
const cfg=load('app/lib/personalizer-config.ts',{'./acrylic-design':core});
const raw=JSON.parse(fs.readFileSync('assets/acrylic-three-photo/config.json','utf8'));raw.sourcePsdUrl='https://cdn.shopify.com/s/files/demo.psd';
assert.equal(cfg.normalizeConfig(raw).photoFields.length,3);assert.equal(cfg.normalizeConfig(raw).acrylicDesign.orientation,'Portrait');assert.equal(cfg.normalizeConfig(raw).sourcePsdUrl,raw.sourcePsdUrl);
let product={id:'gid://shopify/Product/123',tags:[],config:{jsonValue:raw},variants:{nodes:[{id:'default',price:'0',selectedOptions:[{name:'Title',value:'Default Title'}]}],pageInfo:{hasNextPage:false}}};
let updates=0,creates=0,tagWrites=0;
const admin={graphql:async(q,{variables:v})=>{let data;
 if(q.startsWith('query LinkedAcrylicDesign'))data={product};
 else if(q.startsWith('mutation Bootstrap')){creates++;product.variants.nodes=v.input.variants.map((r,i)=>({id:`v${i}`,price:r.price,selectedOptions:r.optionValues.map(o=>({name:o.optionName,value:o.name}))}));data={productSet:{userErrors:[]}};}
 else if(q.startsWith('mutation UpdateLinked')){updates++;for(const r of v.variants)product.variants.nodes.find(x=>x.id===r.id).price=r.price;data={productVariantsBulkUpdate:{userErrors:[]}};}
 else if(q.startsWith('mutation Tag')){tagWrites++;product.tags=v.input.tags;data={productUpdate:{userErrors:[]}};}
 else throw Error(q);
 return {json:async()=>({data})};}};
let matrix={version:2,sizes:rows};
const server=load('app/lib/acrylic-design.server.ts',{'./acrylic-design':core,'./personalizer-config':cfg,'./acrylic-prices.server':{loadAcrylicMatrix:async()=>matrix}});
await server.syncAcrylicDesign(admin,product.id);assert.equal(creates,1);assert.equal(product.variants.nodes.length,4);assert.equal(product.tags.includes('cw-acrylic-frame'),true);
const ids=product.variants.nodes.map(v=>v.id);await server.syncAcrylicDesign(admin,product.id);assert.equal(creates,1);assert.equal(updates,0);assert.equal(tagWrites,1);
matrix={version:2,sizes:rows.map(r=>({...r,price3:r.price3+100}))};await server.syncAcrylicDesign(admin,product.id,matrix);assert.equal(updates,1);assert.equal(product.variants.nodes[0].price,'850');assert.deepEqual(product.variants.nodes.map(v=>v.id),ids);
await server.syncAcrylicDesign(admin,product.id,matrix);assert.equal(updates,1);
product.variants.nodes[0].selectedOptions.push({name:'Orientation',value:'Landscape'});await assert.rejects(()=>server.syncAcrylicDesign(admin,product.id),/Existing variants/);
await assert.rejects(()=>server.validateAcrylicDesign(admin,core.ACRYLIC_MASTER_ID,cfg.normalizeConfig(raw)),/Keep the master plain/);
console.log('Acrylic designs passed: portrait/landscape restriction, ratio filtering, three fields, source PSD retention, safe bootstrap, stable IDs, inherited price updates and idempotent retry.');
