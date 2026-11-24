import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const depRoot = process.env.SIGNATURE_QA_DEPS || process.cwd() + '/node_modules';
const requireQa = createRequire(pathToFileURL(depRoot + '/qa-entry.cjs'));
const packages = Object.fromEntries(['@napi-rs/canvas','pdf-lib','fflate','pdfjs-dist'].map(name =>
  [name, pathToFileURL(requireQa.resolve(name)).href]));

registerHooks({ resolve(specifier, context, next) {
  if (specifier.endsWith('pdf.worker.min.mjs?url')) return { shortCircuit: true,
    url: 'data:text/javascript,export default ' + encodeURIComponent(JSON.stringify(
      pathToFileURL(depRoot + '/pdfjs-dist/legacy/build/pdf.worker.mjs').href)) };
  if (packages[specifier]) return { shortCircuit: true, url: packages[specifier] };
  if (specifier.startsWith('.') && context.parentURL) {
    const url = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(url)) return { shortCircuit: true, url: url.href };
  }
  return next(specifier, context);
}});
const { createCanvas, loadImage, DOMMatrix, ImageData, Path2D } = await import('@napi-rs/canvas');
const { PDFDocument, rgb } = await import('pdf-lib');
const { unzipSync } = await import('fflate');
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
globalThis.document = { createElement(name) {
  assert.equal(name, 'canvas');
  const canvas = createCanvas(1, 1);
  canvas.toBlob = callback => callback(new Blob([canvas.toBuffer('image/jpeg', 98)], { type: 'image/jpeg' }));
  return canvas;
}};
globalThis.createImageBitmap = async blob => {
  const image = await loadImage(Buffer.from(await blob.arrayBuffer())); image.close = () => {}; return image;
};
const { signatureJpgPlan, fitA4, jpeg300Dpi } = await import('../app/lib/signature-day-jpg-plan.ts');
const { buildSignatureDayJpgZip } = await import('../app/lib/signature-day-print-jpg.client.ts');
const { buildSignatureDayPrintPdf } = await import('../app/lib/signature-day-print-pdf.client.ts');
const { saveAndReadSyntheticDesign } = await import('./helpers/signature-save-read.mjs');
const shared = 'https://cdn.shopify.com/s/files/1/0000/0000/0000/files/synthetic.pdf';
const design = { printUrls: Array.from({ length: 30 }, (_, i) => ({
  front: `${shared}#page=${i % 2 + 1}`, back: `${shared}#page=${i % 2 + 3}` })),
  shirtSizes: Array.from({ length: 30 }, (_, i) => ['M', 'S', 'XXL', 'L', 'XL'][i % 5]) };
const pdf = await PDFDocument.create();
const colors = [[1,0,0],[0,1,0],[0,0,1],[1,1,0]];
for (const color of colors) pdf.addPage([595.28,841.89]).drawRectangle({x:0,y:0,width:595.28,height:841.89,color:rgb(...color)});
const pdfBytes = await pdf.save();

function density(bytes) {
  for (let p = 2; p < bytes.length - 16;) {
    const marker = bytes[p + 1], length = bytes[p + 2] * 256 + bytes[p + 3];
    if (marker === 0xe0 && Buffer.from(bytes.subarray(p+4,p+9)).toString() === 'JFIF\0')
      return [bytes[p+11],bytes[p+12]*256+bytes[p+13],bytes[p+14]*256+bytes[p+15]];
    if (marker === 0xda || length < 2) break;
    p += length + 2;
  }
  return null;
}
test('30 shirts produce 60 ordered files; same-size order and Front/Back adjacency match PDF', () => {
  const pages = signatureJpgPlan(design);
  assert.equal(pages.length,60);
  assert.match(pages[0].filename,/^001_S_Shirt-002_Front.jpg$/);
  assert.match(pages[1].filename,/^002_S_Shirt-002_Back.jpg$/);
  assert.match(pages[2].filename,/^003_S_Shirt-007_Front.jpg$/);
  assert.match(pages[59].filename,/^060_XXL_Shirt-028_Back.jpg$/);
  assert.deepEqual(pages.map(p=>p.filename),pages.map(p=>p.filename).sort());
  const odd = signatureJpgPlan({printUrls:[{front:'a'},{front:'b'},{front:'c'}],shirtSizes:['Unknown','XS','M']});
  assert.deepEqual(odd.map(p=>p.url),['c','b','a']);
});
test('actual shared PDF ZIP has 60 A4 JPEGs with 300 DPI, correct source pages, no mockups', async () => {
  let requests = 0;
  globalThis.fetch = async url => {
    assert.equal(new URL('https://test.invalid'+url).searchParams.get('url'),shared);
    requests++; return new Response(pdfBytes);
  };
  const loaded = await saveAndReadSyntheticDesign(design);
  const zip = await buildSignatureDayJpgZip(loaded);
  assert.equal(requests,1);
  const files=unzipSync(zip), names=Object.keys(files), plan=signatureJpgPlan(design);
  assert.equal(names.length,60);
  for (let i=0;i<60;i++) {
    assert.equal(names[i],'Signature-Day-A4-300dpi/'+plan[i].filename);
    const bytes=files[names[i]];
    assert.deepEqual(density(bytes),[1,300,300]);
    const image=await loadImage(Buffer.from(bytes));
    assert.deepEqual([image.width,image.height],[2480,3508]);
    const canvas=createCanvas(1,1),ctx=canvas.getContext('2d');
    ctx.drawImage(image,1240,1754,1,1,0,0,1,1);
    const actual=ctx.getImageData(0,0,1,1).data;
    const expected=colors[Number(plan[i].url.split('page=')[1])-1];
    expected.forEach((v,c)=>assert.ok(Math.abs(actual[c]-v*255)<6));
  }
  const combined=await PDFDocument.load(await buildSignatureDayPrintPdf(loaded));
  assert.equal(combined.getPageCount(),60);
});
test('front-only raster: no Back, no cropping or distortion, exact physical JPEG density', async () => {
  const source=createCanvas(400,200),ctx=source.getContext('2d');
  ctx.fillStyle='red';ctx.fillRect(0,0,200,200);ctx.fillStyle='blue';ctx.fillRect(200,0,200,200);
  globalThis.fetch=async()=>new Response(source.toBuffer('image/png'));
  const zip=unzipSync(await buildSignatureDayJpgZip({printUrls:[{front:'https://example.invalid/print.png'}],shirtSizes:['S']}));
  assert.equal(Object.keys(zip).length,1);
  const bytes=Object.values(zip)[0], image=await loadImage(Buffer.from(bytes));
  assert.deepEqual(density(bytes),[1,300,300]);
  const out=createCanvas(2480,3508),outCtx=out.getContext('2d');outCtx.drawImage(image,0,0);
  assert.ok(outCtx.getImageData(1240,100,1,1).data[0]>250); // white letterbox
  assert.ok(outCtx.getImageData(10,1754,1,1).data[0]>240); // left edge retained
  assert.ok(outCtx.getImageData(2470,1754,1,1).data[2]>240); // right edge retained
  assert.deepEqual(fitA4(400,200),{scale:6.2,width:2480,height:1240,x:0,y:1134});
  assert.deepEqual(density(jpeg300Dpi(bytes)),[1,300,300]);
});
test('missing shared PDF page fails instead of silently substituting a page', async()=>{
  globalThis.fetch=async()=>new Response(pdfBytes);
  await assert.rejects(buildSignatureDayJpgZip({printUrls:[{front:shared+'#page=99'}],shirtSizes:['M']}),/missing/);
});
