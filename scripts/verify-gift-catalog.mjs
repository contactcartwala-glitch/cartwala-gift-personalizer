import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const catalog = JSON.parse(fs.readFileSync('assets/gift-catalog/catalog.json'));
const assets = JSON.parse(fs.readFileSync('assets/gift-catalog/storefront-assets.json'));
assert.equal(catalog.products.length, 73);
assert.equal(assets.filter(a => a.kind === 'preview' && a.status === 'READY').length, 73);
for (const product of catalog.products) {
  const {config} = JSON.parse(fs.readFileSync(`assets/gift-catalog/storefront-configs/${product.sku}.json`));
  const spec = JSON.parse(fs.readFileSync(`assets/gift-catalog/${product.sku}.spec.json`));
  assert.equal(config.photoFields.length, spec.photos.length, product.sku);
  config.photoFields.forEach((photo, i) => {
    assert.equal(photo.treatment, spec.photos[i].treatment);
    assert.ok(photo.maskUrl.startsWith('https://cdn.shopify.com/'));
    for (const key of ['x','y','width','height']) assert.ok(Number.isFinite(photo[key]));
  });
  assert.ok(config.overlayUrl.startsWith('https://cdn.shopify.com/'));
  assert.ok(config.previewUrl.startsWith('https://cdn.shopify.com/'));
  assert.equal(config.textFields.filter(t => t.calendarControl).length, spec.calendar ? 1 : 0);
}

const calendarCode = fs.readFileSync('extensions/cartwala-personalizer/assets/cartwala-gift-calendar.js','utf8');
const browserContext = vm.createContext({window:{}});
vm.runInContext(calendarCode,browserContext);
const adminContext = vm.createContext({exports:{}});
vm.runInContext(ts.transpileModule(fs.readFileSync('app/lib/gift-calendar.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,adminContext);
const layout = {x:10,y:40,width:30,height:25,monthX:25,monthY:35,color:'#503820'};
function capture(draw,value) {
  const labels=[]; const ctx={save(){},restore(){},fillText(value,x,y){labels.push({value,x,y,color:this.fillStyle});}};
  const ok=draw({width:1200,height:1200,getContext:()=>ctx},layout,value);
  return {ok,labels};
}
for (const value of ['2028-02-29','2027-02-28','2026-12-31']) {
  const front=capture(browserContext.window.CartwalaGiftCalendar,value);
  assert.deepEqual(front,capture(adminContext.exports.drawGiftCalendar,value));
  assert.equal(front.labels.filter(x => x.color === '#ed442b').length,1);
}
const leap=capture(browserContext.window.CartwalaGiftCalendar,'2028-02-29');
assert.equal(leap.labels[0].value,'February 2028');
assert.equal(leap.labels.filter(x=>/^\d+$/.test(x.value)).length,29);
assert.equal(capture(browserContext.window.CartwalaGiftCalendar,'2027-02-29').ok,false);

const route = fs.readFileSync('app/routes/app.print-files.tsx','utf8');
const code = route.slice(route.indexOf('async function buildPrint('),route.indexOf('const canvasBlob ='));
for (const above of [false,true]) {
  const calls=[];
  const fixture={design:{r:'1200:900',o:'overlay',scene:true,photoAboveOverlay:above,p:[{i:'photo'}],t:[],calendar:{layout,value:'2028-02-29'}},exact:true,attributes:{}};
  const context=vm.createContext({
    getDesign:()=>fixture,missingPhotos:()=>[],hasPrintContent:()=>true,orderedPrintSize:()=>null,
    documentSize:()=>({width:6000,height:4500}),
    makeCanvas:(width,height)=>({width,height,name:'canvas',getContext:()=>({drawImage:image=>calls.push(image.name)})}),
    loadImage:async()=>({name:'overlay'}),sourceFor:()=> 'source',
    renderPhotoLayer:async()=>({preview:{name:'photo'},canvas:{},mask:{}}),drawGiftCalendar:()=>calls.push('calendar'),
  });
  vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nthis.buildPrint=buildPrint;',context);
  const result=await context.buildPrint({productTitle:'Gift'});
  assert.equal(result.width,1200,'scene exports must retain the mockup resolution');
  assert.equal(result.height,900);
  assert.ok(calls.indexOf('photo') > 0);
  const compositeOrder=calls.filter(x=>x==='photo'||x==='canvas');
  assert.equal(compositeOrder[0],above?'canvas':'photo','engraved photos must remain above the wood surface');
  assert.ok(result.calendarLayer,'calendar must be recoverable in a separate PSD layer');
}
console.log('73 gift configurations, ready previews, calendar leap dates, storefront/admin parity, scene resolution and photo layer order passed.');
