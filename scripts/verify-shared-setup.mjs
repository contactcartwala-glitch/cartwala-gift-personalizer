import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import ts from 'typescript';
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const core={};vm.runInNewContext(compile('app/lib/product-groups.ts'),{exports:core,structuredClone});
let record=null,writes=0;const db={productGroupSettings:{findUnique:async()=>record,create:async({data})=>{record=data;writes++;},updateMany:async({data})=>{record={...record,state:data.state,revision:record.revision+1};writes++;return {count:1};}}};const server={};vm.runInNewContext(compile('app/lib/product-groups.server.ts'),{exports:server,require:p=>p.includes('db.server')?{default:db}:p.endsWith('shop-setup-imports.json')?{default:JSON.parse(fs.readFileSync('app/data/shop-setup-imports.json','utf8'))}:core,Response,Buffer,structuredClone,Date});
const group=core.emptyGroup('shared');group.tags=['shared'];group.previewMode='png';group.rows=[{id:'8',values:['8x12','Standard'],price:750,compare:1050,width:8,height:12,templates:{Portrait:core.emptyTemplate(),Landscape:core.emptyTemplate()}}];
const product={id:'gid://shopify/Product/1',title:'Photo',handle:'photo',tags:['shared'],collectionIds:[],image:'',config:null,variants:[{id:'gid://shopify/ProductVariant/1',price:'300',compareAtPrice:null,selectedOptions:[{name:'Size',value:'8x12'},{name:'Material',value:'Standard'}]}],truncated:false,collectionsTruncated:false};
let calls=[];let fresh=structuredClone(product);const admin={graphql:async(q,{variables})=>{calls.push({q,variables});let data;if(q.includes('GroupMissingVariants')){for(const [i,v] of variables.variants.entries())fresh.variants.push({id:`gid://shopify/ProductVariant/${i+2}`,price:String(v.price),compareAtPrice:String(v.compareAtPrice),selectedOptions:v.optionValues.map(o=>({name:o.optionName,value:o.name}))});data={productVariantsBulkCreate:{userErrors:[]}};}else if(q.includes('GroupProduct'))data={product:{...fresh,featuredImage:null,collections:{nodes:[],pageInfo:{hasNextPage:false}},variants:{nodes:fresh.variants,pageInfo:{hasNextPage:false}},groupConfig:null}};else if(q.includes('GroupVariantPrices'))data={productVariantsBulkUpdate:{userErrors:[]}};else data={metafieldsSet:{userErrors:[]}};return new Response(JSON.stringify({data}));}};
// Prices work with zero PNGs and with only some uploaded PNGs.
assert.equal((await server.syncGroupProduct(admin,[group],product)).status,'updated');assert.equal(calls[0].variables.variants[0].price,750);assert.equal(JSON.parse(calls[1].variables.metafields[0].value).previews['1'].mockup,undefined);
// Adding 10x15 creates only the new row; the original variant ID is retained.
const expanded=structuredClone(group);expanded.rows.push({...structuredClone(group.rows[0]),id:'10',values:['10x15','Standard'],width:10,height:15,price:900,compare:1260});calls=[];
assert.equal((await server.syncGroupProduct(admin,[expanded],product)).status,'updated');const creation=calls.find(c=>c.q.includes('GroupMissingVariants'));assert.equal(creation.variables.variants.length,1);assert.equal(creation.variables.variants[0].optionValues[0].name,'10x15');assert.equal(fresh.variants[0].id,product.variants[0].id);
const config=JSON.parse(calls.find(c=>c.variables.metafields).variables.metafields[0].value);assert.equal(config.previews['2'].widthInches,10);
calls=[];assert.equal((await server.syncGroupProduct(admin,[expanded],fresh)).status,'updated');assert.equal(calls.some(c=>c.q.includes('GroupMissingVariants')),false);
// A versioned setup import is consumed once and later manual changes survive.
const external={version:1,importId:'once',groups:[group],published:[group],history:[]};const settingsAdmin={graphql:async()=>new Response(JSON.stringify({data:{shop:{id:'shop',name:'Store',currencyCode:'INR',groups:{jsonValue:external}},collections:{nodes:[],pageInfo:{hasNextPage:false}}}}))};
let settings=await server.loadGroupSettings(settingsAdmin);assert.equal(settings.digest,'1');assert.equal(writes,1);record.state.groups[0].rows[0].price=800;
settings=await server.loadGroupSettings(settingsAdmin);assert.equal(settings.state.groups[0].rows[0].price,800);assert.equal(writes,1);
record=null;writes=0;
const preparedAdmin={graphql:async()=>new Response(JSON.stringify({data:{shop:{id:'gid://shopify/Shop/80379314361',name:'Cartwala',currencyCode:'INR',groups:null},collections:{nodes:[],pageInfo:{hasNextPage:false}}}}))};
settings=await server.loadGroupSettings(preparedAdmin);assert.equal(settings.state.groups[0].rows.length,10);assert.equal(writes,2);assert.equal(settings.state.groups[0].rows[0].templates.Portrait.mockup.includes('v3'),true);
record.state.groups[0].rows[0].price=777;settings=await server.loadGroupSettings(preparedAdmin);assert.equal(settings.state.groups[0].rows[0].price,777);assert.equal(writes,2);
record=null;const otherAdmin={graphql:async()=>new Response(JSON.stringify({data:{shop:{id:'other-store',name:'Other',currencyCode:'USD',groups:null},collections:{nodes:[],pageInfo:{hasNextPage:false}}}}))};settings=await server.loadGroupSettings(otherAdmin);assert.equal(settings.state.groups.length,0);
console.log('Shared setup passed: optional images, cost-only application, new-size creation, stable existing variant IDs, idempotence and one-time import.');
// Setup browsing fetches fifty product summaries per page and never fetches variants.
const summaryCalls=[];
const summaryAdmin={graphql:async(q,{variables})=>{summaryCalls.push({q,variables});assert.match(q,/products\(first: 50/);assert.doesNotMatch(q,/variants\(/);return new Response(JSON.stringify({data:{products:{nodes:[{id:variables.after?'p2':'p1',title:'Frame',handle:'frame',tags:['frames'],collections:{nodes:[{id:'collection'}],pageInfo:{hasNextPage:false}}}],pageInfo:{hasNextPage:!variables.after,endCursor:variables.after?null:'next'}}}}));}};
const summaries=await server.loadCatalogSummary(summaryAdmin);assert.equal(summaries.length,2);assert.equal(summaryCalls.length,2);assert.equal(summaryCalls[1].variables.after,'next');assert.equal(summaries[1].collectionIds[0],'collection');
// Three independent setup tags; duplicates are rejected within this store.
const tags=structuredClone(group);tags.tags=['frames'];tags.portraitTag='frames-p';tags.landscapeTag='frames-l';
assert.deepEqual(Object.keys(core.tagErrors(tags,[tags])),[]);
const collision=structuredClone(tags);collision.id='other';collision.name='Other setup';collision.tags=[' FRAMES '];
assert.match(core.tagErrors(collision,[tags]).plain,/already used/);
collision.tags=['different'];collision.portraitTag='different';collision.landscapeTag='different-l';assert.match(core.tagErrors(collision,[]).portrait,/different tag/);
assert.equal(core.directionFor(tags,['frames-p']),'Portrait');assert.equal(core.directionFor(tags,['frames-l']),'Landscape');assert.equal(core.directionFor(tags,['frames']),null);assert.throws(()=>core.directionFor(tags,['frames','frames-p']),/only one/);
// Name/value updates rename options only: no productSet, price or variant writes.
const renamed=structuredClone(group);renamed.options=['Size','Thickness'];renamed.optionAliases={Thickness:['Acrylic']};renamed.valueAliases={Thickness:{'3mm without studs':['Standard']}};renamed.rows[0].values[1]='3mm without studs';
const original=structuredClone(product);original.variants[0].selectedOptions[1].name='Acrylic';let optionCalls=[];
const optionAdmin={graphql:async(q,{variables})=>{optionCalls.push({q,variables});return new Response(JSON.stringify({data:q.includes('SetupOptionNames')?{product:{options:[{id:'option-1',name:'Size',position:1,optionValues:[{id:'size-1',name:'8x12'}]},{id:'option-2',name:'Acrylic',position:2,optionValues:[{id:'value-2',name:'Standard'}]}]}}:{productOptionUpdate:{userErrors:[]}}}));}};
const updated=await server.renameOptions(optionAdmin,renamed,original);assert.equal(updated.variants[0].id,original.variants[0].id);assert.equal(updated.variants[0].price,original.variants[0].price);assert.equal(updated.variants[0].selectedOptions[1].name,'Thickness');assert.equal(updated.variants[0].selectedOptions[1].value,'3mm without studs');assert.equal(original.variants[0].selectedOptions[1].name,'Acrylic');assert.equal(optionCalls.length,3);assert(optionCalls.every(c=>c.q.includes('SetupOption')));optionCalls=[];await server.renameOptions(optionAdmin,renamed,updated);assert.equal(optionCalls.length,0);
console.log('Tag uniqueness, three-tag selection, option/value renaming, stable variant IDs and idempotent retry passed.');

// A type edit is scoped to its row, including both directions, without touching other sizes.
const isolated=structuredClone(group);isolated.options=['Size','Thickness'];isolated.valueAliases=undefined;
isolated.rows=[['8x12',8,12],['10x15',10,15],['24x36',24,36]].map(([size,width,height],i)=>({...structuredClone(group.rows[0]),id:'row-'+i,values:[size,'5mm with studs'],width,height}));
const untouched=isolated.rows[2];isolated.rows=core.renameRowValue(isolated,'row-1',1,'New 5mm');
assert.equal(isolated.rows[0].values[1],'5mm with studs');assert.equal(isolated.rows[2],untouched);assert.equal(isolated.rows[1].values[1],'New 5mm');assert.equal(isolated.rows[1].price,750);assert.equal(isolated.rows[1].templates.Portrait.mockup,group.rows[0].templates.Portrait.mockup);
const scopedProduct={...structuredClone(product),variants:isolated.rows.flatMap((r,i)=>['Portrait','Landscape'].map((direction,j)=>({id:'variant-'+i+'-'+j,price:'750',compareAtPrice:'1050',selectedOptions:[{name:'Size',value:r.values[0]},{name:'Thickness',value:'5mm with studs'},{name:'Orientation',value:direction}]})))};
const scopedCalls=[];const scopedAdmin={graphql:async(q,{variables})=>{scopedCalls.push({q,variables});return new Response(JSON.stringify({data:{productVariantsBulkUpdate:{userErrors:[]}}}));}};
const scopedResult=await server.renameRowVariants(scopedAdmin,isolated,scopedProduct);
assert.equal(scopedCalls.length,1);assert.equal(scopedCalls[0].variables.variants.length,2);assert.deepEqual(Array.from(scopedCalls[0].variables.variants,v=>v.id),['variant-1-0','variant-1-1']);assert.doesNotMatch(scopedCalls[0].q,/productOptionUpdate|productSet/);
assert.equal(scopedResult.variants[0].selectedOptions[1].value,'5mm with studs');assert.equal(scopedResult.variants[2].selectedOptions[1].value,'New 5mm');assert.equal(scopedResult.variants[4].selectedOptions[1].value,'5mm with studs');assert.equal(scopedResult.variants[2].id,scopedProduct.variants[2].id);assert.equal(scopedProduct.variants[2].selectedOptions[1].value,'5mm with studs');
await server.renameRowVariants(scopedAdmin,isolated,scopedResult);assert.equal(scopedCalls.length,1);
isolated.rows=core.renameRowValue(isolated,'row-1',1,'Revised 5mm');await server.renameRowVariants(scopedAdmin,isolated,scopedResult);assert.equal(scopedCalls.length,2);assert.equal(scopedCalls[1].variables.variants.length,2);
const duplicate=structuredClone(isolated);duplicate.rows.push({...structuredClone(duplicate.rows[1]),id:'duplicate'});assert.throws(()=>core.validateGroup(duplicate),/same option/);
console.log('Independent row names passed: single-row UI edits, both orientations, preserved IDs/prices/PNGs, repeat edits and idempotent save retries.');

// One setup tag is enough. Direction tags remain optional and reusable.
const simple=structuredClone(tags);simple.portraitTag='';simple.landscapeTag='';
assert.equal(Object.keys(core.tagErrors(simple,[])).length,0);
assert.equal(core.setupTags([simple]).length,1);
assert.equal(core.setupTags([tags]).length,3);
assert.equal(core.replaceSetupTag(['unrelated','frames-p'],[tags],'frames-l').join(','),'unrelated,frames-l');
assert.equal(core.replaceSetupTag(['unrelated','frames-p'],[tags],'').join(','),'unrelated');
assert.throws(()=>core.replaceSetupTag(['unrelated'],[tags],'unsaved-tag'),/not saved/);
console.log('Single-tag setup and tag replacement preserve unrelated product tags.');

// WordPress-style tag registration is independent of products and optional PNGs.
const registered=core.createTagSetup('new-tag','  photo-frames  ',' My frames ',[tags]);
assert.equal(registered.tags.join(','),'photo-frames');
assert.equal(registered.description,'My frames');
assert.equal(registered.rows.length,0);
assert.equal(registered.productIds.length,0);
assert.equal(registered.collectionIds.length,0);
assert.equal(core.setupTags([registered])[0].tag,'photo-frames');
assert.throws(()=>core.createTagSetup('duplicate',' FRAMES ','',[tags]),/already used/);
assert.throws(()=>core.createTagSetup('empty','','',[]),/Enter a tag name/);
assert.throws(()=>core.createTagSetup('comma','one,two','',[]),/without commas/);
console.log('Tag registry passed: one-time creation, optional description/images, instant availability and duplicate protection.');

for(const input of ['10x15','10 × 15','10 by 15','10*15','10 inch x 15 inch','10" x 15"']){
 const dims=core.parseSizeInput(input);assert.equal(dims.width,10);assert.equal(dims.height,15);
}
assert.equal(core.parseSizeInput('15x10').width,10);
assert.equal(core.parseSizeInput('0x12'),null);assert.equal(core.parseSizeInput('sizes'),null);
console.log('Add-size input passed: common size formats and invalid dimensions.');

const copySource=core.createTagSetup('copies','copies','',[]);
copySource.rows=[{id:'original',values:['10×15 inches'],width:10,height:15,price:750,compare:1000,templates:{Portrait:{...core.emptyTemplate(),mockup:'https://example.com/portrait.png',mockupAspect:1},Landscape:core.emptyTemplate()}}];
const copied=core.duplicateSizeRow(copySource,'original','copy');
assert.equal(copySource.options.length,1);assert.equal(copySource.rows.length,1);
assert.equal(copied.options.length,2);assert.equal(copied.rows[1].price,750);
assert.equal(copied.rows[0].templates.Portrait.mockup,'https://example.com/portrait.png');
assert.equal(copied.rows[1].templates.Portrait.mockup,undefined);
assert.equal(copied.rows[1].previousValues,undefined);
const twice=core.duplicateSizeRow(copied,'original','copy-2');
assert.notEqual(twice.rows[1].values[1],twice.rows[2].values[1]);
core.validateGroup(structuredClone(twice));
console.log('Duplicate size passed: unique options, preserved prices, empty new PNGs and original unchanged.');

// Shared setup remains removed; the new acrylic editor targets only one known product.
const removed=fs.readFileSync('app/routes/app.product-groups.tsx','utf8');
assert.match(removed,/return redirect\("\/app"\)/);
assert.doesNotMatch(removed,/export const action|saveGroupSettings|deleteMany/);
const acrylicEditor=fs.readFileSync('app/routes/app.acrylic-prices.tsx','utf8');
assert.match(acrylicEditor,/ACRYLIC_ACTIVE_PRODUCT_ID/);
assert.doesNotMatch(acrylicEditor,/saveGroupSettings|syncAcrylicCollection|deleteMany/);
const editor=fs.readFileSync('app/routes/app._index.tsx','utf8');
assert.match(editor,/<s-button onClick={chooseProduct}>Choose product<\/s-button>/);
assert.match(editor,/shopify.resourcePicker/);
assert.doesNotMatch(editor,/Find a design|Saved setup tags|form.set\("setupTag"/);
assert.doesNotMatch(fs.readFileSync('app/routes/app.tsx','utf8'),/Tags & mockups|href="\/app\/product-groups"/);
console.log('Admin rollback passed: original product picker, removed setup UI and no data deletion.');
