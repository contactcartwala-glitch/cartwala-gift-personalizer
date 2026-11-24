import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CARTWALA_SHOP as shop, completeRecoveryRow, recoverMissingPrintDesigns as recover, createRecoveryReader } from '../app/lib/print-files-recovery.server.ts';
import { orderedShirts } from '../app/lib/signature-day-print-order.ts';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const url = name => `https://cdn.shopify.com/s/files/1/0000/0000/0000/files/synthetic-${name}`;
function row(id=A, count=2, pdf=false) {
  return { id, shop, backPrint:true,
    printUrls: Array.from({length:count}, (_,i)=>({front:url(pdf?`batch.pdf#page=${i+1}`:`print-${i}.jpg`),back:url(`back-${i}.png`)})),
    previewUrls:Array.from({length:count},(_,i)=>({front:url(`mockup-${i}.jpg`),back:url(`mockup-back-${i}.jpg`)})),
    sourceUrls:Array.from({length:count},(_,i)=>url(`source-${i}.jpg`)),
    shirtSizes:Array.from({length:count},(_,i)=>i%2?'S':'XL') };
}
test('disabled configuration never connects and preserves normal behavior',async()=>{
  for(const env of [{},{PRINT_FILES_RECOVERY_ENABLED:'true'},{PRINT_FILES_RECOVERY_DATABASE_URL:'synthetic'}]){
    const read=createRecoveryReader(env,()=>{throw Error('must not connect')});
    assert.deepEqual(await recover(shop,[A],[],read),{rows:[],warning:null});
  }
});
test('other shop never calls fallback, even with a copied design ID',async()=>{
  const primary=[row()];
  const out=await recover('other.myshopify.com',[B],primary,async()=>{throw Error('must not call')});
  assert.strictEqual(out.rows,primary);
});
test('no-design advance placeholder does not query either recovery or invent a design',async()=>{
  assert.deepEqual(await recover(shop,[],[],async()=>{throw Error('must not call')}),{rows:[],warning:null});
});
test('primary rows preserve identity and incomplete primary is not silently replaced',async()=>{
  const primary=[{...row(),printUrls:[]}];
  const out=await recover(shop,[A,A],primary,async()=>{throw Error('must not call')});
  assert.strictEqual(out.rows,primary);
});
test('queries only missing UUIDs and rejects cross-shop/unrequested rows',async()=>{
  const primary=[row(A)]; let args;
  const out=await recover(shop,[A,B,B,'invalid'],primary,async(...a)=>{
    args=a;return [{...row(B),shop:'other.myshopify.com'},row(C),row(A),row(B)];
  });
  assert.deepEqual(args,[shop,[B]]);assert.deepEqual(out.rows.map(r=>r.id),[A,B]);
  assert.strictEqual(out.rows[0],primary[0]);assert.equal(out.warning,null);
});
test('unavailable fallback does not leak exception, credentials, or lose primary',async()=>{
  const primary=[row(A)];const out=await recover(shop,[A,B],primary,async()=>{throw Error('secret-connection-url')});
  assert.strictEqual(out.rows,primary);assert.ok(out.warning);assert.ok(!out.warning.includes('secret'));
});
test('empty and partial recovery fail closed',async()=>{
  assert.ok((await recover(shop,[A],[],async()=>[])).warning);
  for(const r of [{...row(),printUrls:[]},{...row(),sourceUrls:[]},{...row(),shirtSizes:['S']},
    {...row(),printUrls:[{front:url('x.jpg')},{front:url('y.jpg')}] }]){
    assert.equal(completeRecoveryRow(r),false);
    assert.equal((await recover(shop,[A],[],async()=>[r])).rows.length,0);
  }
  assert.equal((await recover(shop,[A],[],async()=>[row()],{[A]:[3]})).rows.length,0);
});
test('mockup and source refs never become production print refs',()=>{
  for(const field of ['previewUrls','sourceUrls']){
    const r=row();r.printUrls[0].front=field==='previewUrls'?r.previewUrls[1].front+'?v=2':r.sourceUrls[0];
    assert.equal(completeRecoveryRow(r),false);
  }
  const r=row();r.printUrls[0].front='https://example.invalid/art.jpg';assert.equal(completeRecoveryRow(r),false);
});
test('old raster and new multi-page PDF designs retain exact refs and stable size order',async()=>{
  const old=row(A,34),recent=row(B,31,true);
  const out=await recover(shop,[A,B],[],async()=>[old,recent],{[A]:[34],[B]:[31]});
  assert.equal(out.rows.length,2);assert.strictEqual(out.rows[1],recent);
  const sorted=orderedShirts(recent);assert.equal(sorted[0].size,'S');
  assert.equal(sorted[0].shirt.front,url('batch.pdf#page=2'));
  assert.equal(sorted.at(-1).shirt.front,url('batch.pdf#page=31'));
});
test('dedicated reader uses read-only transaction and exact scoped SELECT',async()=>{
  const events=[];const data=[row()];
  const read=createRecoveryReader({PRINT_FILES_RECOVERY_ENABLED:'true',PRINT_FILES_RECOVERY_DATABASE_URL:'synthetic-only'},value=>{
    assert.equal(value,'synthetic-only');return {$transaction:async(run,options)=>{
      assert.deepEqual(options,{maxWait:3000,timeout:5000});
      return run({$executeRaw:async strings=>events.push(strings.join('')),
        signatureDayDesign:{findMany:async args=>{events.push(args);return data}}});
    }};
  });
  assert.equal(await read('other.myshopify.com',[A]),null);
  assert.strictEqual(await read(shop,[A]),data);
  assert.equal(events[0],'SET TRANSACTION READ ONLY');
  assert.deepEqual(events[1].where,{shop,id:{in:[A]}});
  assert.deepEqual(Object.keys(events[1].select).sort(),['id','shop','printUrls','previewUrls','sourceUrls','shirtSizes','backPrint'].sort());
});
test('route retains authentication, PAID guard, companion links and generic exports',()=>{
  const route=fs.readFileSync(new URL('../app/routes/app.print-files.tsx',import.meta.url),'utf8');
  assert.ok(route.indexOf('await authenticate.admin(request)')<route.indexOf('await recoverMissingPrintDesigns'));
  assert.match(route,/order.financialStatus === "PAID"/);
  for(const label of ['Front A4 print','Back A4 print','T-shirt preview','Original photo','Download PSD','Download PNG']) assert.ok(route.includes(label));
  assert.ok(!route.includes('process.env.DATABASE_URL ='));
  const client=fs.readFileSync(new URL('../app/lib/signature-day-print-pdf.client.ts',import.meta.url),'utf8');
  assert.ok(!client.includes('previewUrls'));assert.ok(!client.includes('sourceUrls'));
  assert.match(client,/source, \[number - 1\]/);
});
