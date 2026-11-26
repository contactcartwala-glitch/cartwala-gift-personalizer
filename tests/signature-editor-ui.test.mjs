import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const qa=createRequire('/tmp/cartwala-editor-qa/package.json');
const native=createRequire('/tmp/cartwala-qa-deps/package.json');
const {JSDOM,VirtualConsole}=qa('jsdom');
const {indexedDB}=qa('fake-indexeddb');
const {createCanvas}=native('@napi-rs/canvas');
const file=fs.readFileSync(new URL('../shopify-theme/sections/signature-day-editor.liquid',import.meta.url),'utf8');
const script=file.match(/<script>([\s\S]*?)<\/script>/)[1];
const html=file.replace(/<script[\s\S]*?<\/script>/g,'').replace(/{{[\s\S]*?}}|{%[\s\S]*?%}/g,'');
const dom=new JSDOM(html,{url:'https://cartwala.in/products/signature-day-t-shirts',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
const w=dom.window,doc=w.document,canvases=new WeakMap(),draws=[],texts=[];
w.structuredClone=structuredClone;w.indexedDB=indexedDB;w.Blob=Blob;w.URL.createObjectURL=()=> 'blob:synthetic';w.URL.revokeObjectURL=()=>{};
w.Image=class{complete=false;naturalWidth=0;set src(value){this._src=value}get src(){return this._src}};
for(const name of ['width','height']){const descriptor=Object.getOwnPropertyDescriptor(w.HTMLCanvasElement.prototype,name);Object.defineProperty(w.HTMLCanvasElement.prototype,name,{get:descriptor.get,set(value){descriptor.set.call(this,value);const c=canvases.get(this);if(c)c[name]=value;}});}
w.HTMLCanvasElement.prototype.getContext=function(){if(!canvases.has(this)){
 const c=createCanvas(this.width,this.height),ctx=c.getContext('2d'),draw=ctx.drawImage.bind(ctx),text=ctx.fillText.bind(ctx);
 ctx.drawImage=(image,...args)=>{draws.push({image,args});return draw(canvases.get(image)||image,...args)};
 ctx.fillText=(value,...args)=>{texts.push({value,color:ctx.fillStyle});return text(value,...args)};
 canvases.set(this,c);
 }return canvases.get(this).getContext('2d');};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
for(const e of doc.querySelectorAll('*')){e.scrollIntoView=()=>{}};
doc.querySelectorAll('.back-shape-source').forEach(e=>e.remove());
const root=doc.getElementById('signature-day-store');for(const attr of [...root.attributes])if(attr.name.startsWith('data-shop-font'))root.setAttribute(attr.name,'');
const hook=`window.qa={setPeople(value){people=value;sideOrder=value.map((_,i)=>i);hasUploaded=true;selected=0;},setBack(){includeBack=true;backFields.name=true;backFields.roll=true;updateBackControls()},state(){return {people,backLayout,selected}},render,openCrop,cover,cropSource,printTile,saveDraft,restoreSharedBackDraft,setImageLoader(fn){imageFromURL=fn}};`;
assert(script.includes('initializeEmpty();updateBackControls();restoreSharedBackDraft();'));
w.eval(script.replace('initializeEmpty();updateBackControls();restoreSharedBackDraft();',hook));
const api=w.qa;
function person(name){const image=createCanvas(300,500),ctx=image.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,150,500);ctx.fillStyle='blue';ctx.fillRect(150,0,150,500);return {name,size:'M',image,blob:new Blob([image.toBuffer('image/png')]),photoKey:name,sourceUrl:'https://cdn.shopify.com/s/files/synthetic.jpg',crop:{cx:.5,cy:.5,zoom:1},backName:name,roll:'7'};}
const people=[person('Alex'),person('Sam')];api.setPeople(people);api.render();
test('saved crop samples the same source window in thumbnail, center, side collage and print',async()=>{
 api.openCrop(0);const slider=doc.getElementById('cropZoom');slider.value='2';slider.dispatchEvent(new w.Event('input'));
 doc.getElementById('cropSave').click();draws.length=0;api.render();
 const thumb=doc.querySelector('#roster canvas.avatar');assert(thumb);assert.equal(doc.querySelector('#roster img.avatar'),null);
 const samples=draws.filter(d=>d.image===people[0].image&&d.args.length===8).map(d=>d.args.slice(0,4));assert(samples.length>2);
 const out=createCanvas(600,800);api.printTile(out.getContext('2d'),people[0].image,0,0,600,800,people[0].crop);
 const printed=api.cropSource(people[0].image,600,800,people[0].crop);const expected=[printed.sx,printed.sy,printed.sw,printed.sh];
 for(const sample of samples)sample.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-6));
 assert.equal(people[0].image.width,300);assert.equal(people[0].image.height,500);
});
test('only the center portrait opens crop directly from preview',()=>{
 const canvas=doc.getElementById('preview');canvas.getBoundingClientRect=()=>({left:0,top:0,width:1200,height:1400});
 canvas.dispatchEvent(new w.MouseEvent('click',{clientX:410,clientY:400}));assert.equal(doc.getElementById('cropDialog').open,false);
 canvas.dispatchEvent(new w.MouseEvent('click',{clientX:600,clientY:650}));assert.equal(doc.getElementById('cropDialog').open,true);doc.getElementById('cropCancel').click();
});
test('selected back text colour renders, cancels safely and survives draft restore',async()=>{
 api.setBack();doc.getElementById('editBackLayout').click();const menu=doc.getElementById('backLayoutElement');menu.value='roll';menu.dispatchEvent(new w.Event('change'));
 const colour=doc.getElementById('backLayoutColor');assert.equal(colour.disabled,false);colour.value='#1234ab';colour.dispatchEvent(new w.Event('input'));
 assert.equal(api.state().backLayout.roll.color,'#1234ab');assert(texts.some(t=>t.value==='7'&&t.color==='#1234ab'));
 doc.getElementById('backLayoutCancel').click();assert.equal(api.state().backLayout.roll.color,undefined);
 doc.getElementById('editBackLayout').click();menu.value='roll';menu.dispatchEvent(new w.Event('change'));colour.value='#1234ab';colour.dispatchEvent(new w.Event('input'));doc.getElementById('backLayoutSave').click();await api.saveDraft();
 api.state().backLayout.roll.color='#ffffff';api.setImageLoader(async()=>people[0].image);await api.restoreSharedBackDraft();assert.equal(api.state().backLayout.roll.color,'#1234ab');
});
