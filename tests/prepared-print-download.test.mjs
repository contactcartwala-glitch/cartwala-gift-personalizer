import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePrintDownload, readPreparedPrintDownload } from '../app/lib/prepared-print-download.server.ts';
const base='https://app.invalid/app/print-download';
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
function request(name,bytes=png) {return new Request(`${base}?name=${encodeURIComponent(name)}`,{method:'POST',body:bytes});}
test('prepared file streams exact bytes with safe attachment headers and an unguessable capability',async()=>{
  const response=await preparePrintDownload(request('QA-original.png'),'synthetic.myshopify.com');
  assert.equal(response.status,200);
  const prepared=await response.json();
  assert.match(prepared.href,/^\/app\/print-download\?file=[a-f0-9]{64}$/);
  assert.equal(prepared.size,png.length);
  const downloaded=await readPreparedPrintDownload(new Request(new URL(prepared.href,base)));
  assert.equal(downloaded.status,200);
  assert.equal(downloaded.headers.get('content-type'),'image/png');
  assert.equal(downloaded.headers.get('content-disposition'),'attachment; filename="QA-original.png"');
  assert.equal(downloaded.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()),png);
});
test('malformed, missing, oversized and mismatched files never become downloads',async()=>{
  assert.equal((await readPreparedPrintDownload(new Request(base+'?file=../../etc/passwd'))).status,404);
  assert.equal((await readPreparedPrintDownload(new Request(base+'?file='+'f'.repeat(64)))).status,404);
  assert.equal((await preparePrintDownload(request('test.exe'),'synthetic')).status,400);
  assert.equal((await preparePrintDownload(request('not-a-pdf.pdf'),'synthetic')).status,400);
  const tooLarge=new Request(base+'?name=large.png',{method:'POST',body:png,headers:{'content-length':String(257*1024*1024)}});
  assert.equal((await preparePrintDownload(tooLarge,'synthetic')).status,413);
});
test('capabilities expire and cannot read the file after fifteen minutes',async()=>{
  const response=await preparePrintDownload(request('expiring.png'),'synthetic');
  const prepared=await response.json();
  const now=Date.now;
  try { Date.now=()=>now()+16*60*1000;
    assert.equal((await readPreparedPrintDownload(new Request(new URL(prepared.href,base)))).status,404);
  } finally {Date.now=now;}
});
test('chunk upload is scoped, ordered and byte-exact; partial uploads cannot be downloaded',async()=>{
  const start=await preparePrintDownload(new Request(base+'?start=1&name=chunked.png&size='+png.length,{method:'POST'}),'shop-A');
  const info=await start.json();assert.equal(info.chunkBytes,8*1024*1024);
  const url=base+'?upload='+info.upload;
  assert.equal((await readPreparedPrintDownload(new Request(base+'?file='+info.upload))).status,404);
  assert.equal((await preparePrintDownload(new Request(url+'&offset=0',{method:'POST',body:png.slice(0,5)}),'shop-B')).status,404);
  const first=await preparePrintDownload(new Request(url+'&offset=0',{method:'POST',body:png.slice(0,5)}),'shop-A');
  assert.deepEqual(await first.json(),{offset:5});
  const replay=await preparePrintDownload(new Request(url+'&offset=0',{method:'POST',body:png.slice(0,5)}),'shop-A');
  assert.equal(replay.status,409);assert.deepEqual(await replay.json(),{offset:5});
  const last=await preparePrintDownload(new Request(url+'&offset=5',{method:'POST',body:png.slice(5)}),'shop-A');
  const complete=await last.json();assert.equal(last.status,200);
  const file=await readPreparedPrintDownload(new Request(new URL(complete.href,base)));
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()),png);
});
