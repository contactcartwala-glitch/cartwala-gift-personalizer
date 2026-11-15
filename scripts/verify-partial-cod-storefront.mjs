import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const messages=JSON.parse(await readFile('extensions/cartwala-personalizer/locales/en.default.json','utf8')).advance_cod.messages;
const code=await readFile('extensions/cartwala-personalizer/assets/cartwala-advance-cod.js','utf8');
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
async function fixture({saved='',available=true,brokenStorage=false,evil=false}={}){
 const element=()=>({hidden:false,disabled:false,textContent:'',listeners:{},addEventListener(n,f){this.listeners[n]=f;}});
 const form=element(),status=element(),pay=element(),recheck=element(),submit=element();pay.hidden=true;recheck.hidden=true;
 const root={...element(),hidden:true,dataset:{themeId:'188248228025'},setAttribute(){},removeAttribute(){},querySelector:s=>({'[data-cw-cod-i18n]':{textContent:JSON.stringify(messages).replaceAll('{{ balance }}','__BALANCE__').replaceAll('{{ now }}','__NOW__').replaceAll('{{ charge }}','__CHARGE__')},form,'[data-cw-cod-status]':status,'[data-cw-cod-pay]':pay,'[data-cw-cod-recheck]':recheck})[s],querySelectorAll:()=>[submit,pay,recheck]};
 const storage=new Map(saved?[['cartwala-advance-cod-v1',saved]]:[]),calls=[],navigations=[];
 const location={hostname:'cartwala.in',assign:url=>navigations.push(url)};
 vm.runInNewContext(code,{Intl,Promise,Object,String,URL,setTimeout,clearTimeout,crypto:{randomUUID},location,
  window:{Shopify:{routes:{root:'/'}},location},
  FormData:class{*[Symbol.iterator](){yield*Object.entries({firstName:'Test',lastName:'',address1:'Test only',address2:'',city:'Test',provinceCode:'TS',zip:'506342',phone:'9000000000'});}},
  document:{querySelector:()=>root,createElement(){throw Error('Native checkout must not load a provider SDK');}},
  sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(brokenStorage)throw Error('disabled');storage.set(k,v);}},
  fetch:async(url,options)=>{const body=options?.body?JSON.parse(options.body):null;calls.push({url,body});let value={checkoutAvailable:available};
   if(url==='/cart.js')value={total_discount:0,items:[{variant_id:123,quantity:1,properties:{_preview:'saved-original'}}]};
   if(body?.intent==='create_quote')value={checkoutAvailable:true,access:'TEST_CAPABILITY',checkoutUrl:evil?'https://evil.test/pay':'https://cartwala.in/123/invoices/abc123',amounts:{feePaise:8000,payableNowPaise:28000,collectOnDeliveryPaise:80000}};
   if(body?.intent==='payment_status')value={state:'completed',payableNowPaise:28000,collectPaise:80000};
   return {ok:true,json:async()=>value};}
 });await flush();return {root,form,status,pay,recheck,storage,calls,navigations};
}
const f=await fixture();assert.equal(f.root.hidden,false);
for(let i=0;i<12;i++)f.form.listeners.submit({preventDefault(){}});await flush();
assert.equal(f.calls.filter(c=>c.body?.intent==='create_quote').length,1);assert.match(f.status.textContent,/280/);assert.match(f.status.textContent,/800/);
const quote=f.calls.find(c=>c.body?.intent==='create_quote').body;assert.equal(quote.address.phone,'+919000000000');assert.equal(quote.lines[0].properties[0].value,'saved-original');assert.equal(quote.themeId,'188248228025');assert.equal(quote.requestKey,f.storage.get('cartwala-advance-cod-v1:request'));
for(let i=0;i<12;i++)f.pay.listeners.click();await flush();assert.deepEqual(f.navigations,['https://cartwala.in/123/invoices/abc123']);assert.equal(f.storage.get('cartwala-advance-cod-v1'),'TEST_CAPABILITY');
f.recheck.listeners.click();await flush();assert.match(f.status.textContent,/order is confirmed/);assert.equal(f.calls.some(c=>c.body?.intent==='begin_payment'),false);
const resumed=await fixture({saved:'TEST_CAPABILITY'});assert.equal(resumed.form.hidden,true);assert.equal(resumed.calls.filter(c=>c.body?.intent==='payment_status').length,1);assert.equal(resumed.calls.some(c=>c.body?.intent==='create_quote'),false);
assert.equal((await fixture({available:false})).root.hidden,true);
const off=await fixture({saved:'TEST_CAPABILITY',available:false});assert.equal(off.root.hidden,true);assert.equal(off.calls.some(c=>c.body),false);
const broken=await fixture({brokenStorage:true});broken.form.listeners.submit({preventDefault(){}});await flush();assert.equal(broken.pay.hidden,true);assert.equal(broken.calls.some(c=>c.body?.intent==='create_quote'),false);
const evil=await fixture({evil:true});evil.form.listeners.submit({preventDefault(){}});await flush();assert.equal(evil.pay.hidden,true);assert.equal(evil.navigations.length,0);
console.log('Native storefront: one quote/redirect across 12 clicks, quantities/artwork, stored recovery key/capability, server-only payment confirmation, OFF/refresh/storage guards and foreign URL rejection passed. No gateway SDK or credential.');
