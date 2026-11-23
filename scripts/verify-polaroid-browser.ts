import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { buildPolaroidPrintExport } from '../app/lib/polaroid-print-export.client';
import { CUT_GAP, SHEET_WIDTH, SHEET_HEIGHT, polaroidSheetLayout } from '../app/lib/polaroid-print-layout';

const assert = (value: unknown, msg: string) => { if (!value) throw new Error(msg); };
const root = 'https://cdn.shopify.com/s/files/1/0803/7931/4361/uploads/';
const attrs = { 'Print files 1': root + 'synthetic-1.zip', 'Print files 2': root + 'synthetic-2.zip', 'Print size': '7 × 10 cm', 'Number of prints': '30' };
const samples = document.createElement('canvas');
samples.width = 827; samples.height = 1181;
const ctx = samples.getContext('2d')!;
const jpeg = async (color: string) => {
  ctx.fillStyle = color; ctx.fillRect(0, 0, 827, 1181);
  const blob = await new Promise<Blob>(resolve => samples.toBlob(b => resolve(b!), 'image/jpeg', .98));
  return new Uint8Array(await blob.arrayBuffer());
};
const dpi = (b: Uint8Array) => {
  assert(String.fromCharCode(...b.slice(6, 10)) === 'JFIF', 'JFIF missing');
  assert(b[13] === 1, 'wrong density unit');
  return [b[14] * 256 + b[15], b[16] * 256 + b[17]];
};
const checkSheet = async (bytes: Uint8Array, count: number, first: number) => {
  assert(dpi(bytes).every(n => n === 300), 'sheet density');
  const img = await createImageBitmap(new Blob([new Uint8Array(bytes)], {type:'image/jpeg'}));
  assert(img.width === SHEET_WIDTH && img.height === SHEET_HEIGHT, 'sheet dimensions');
  const sheet = document.createElement('canvas'); sheet.width = img.width; sheet.height = img.height;
  const s = sheet.getContext('2d')!; s.drawImage(img,0,0); img.close();
  const l = polaroidSheetLayout(827,1181);
  for(let j=0;j<l.capacity;j++){
    const x = CUT_GAP + (j%l.columns)*(l.width+CUT_GAP) + 100;
    const y = CUT_GAP + Math.floor(j/l.columns)*(l.height+CUT_GAP) + 100;
    const [r,g,b] = s.getImageData(x,y,1,1).data;
    assert(j >= count ? r>240 && g>240 && b>240 :
      (first+j)%2 === 0 ? r>200 && b<50 : b>200 && r<50, 'incorrect placement at slot '+j);
  }
  sheet.width = sheet.height = 1;
};
(async () => {
  const colors = [await jpeg('#ff0000'),await jpeg('#0000ff')];
  const parts: Record<string,Uint8Array>[] = [{},{}];
  const photos = Array.from({length:30},(_,i)=>{
    const file = 'photo-'+String(i+1).padStart(3,'0')+'-copies-1.jpg';
    parts[i<15?0:1][file] = colors[i%2]; return {file,copies:1};
  });
  parts[1]['print-manifest.json'] = strToU8(JSON.stringify({size:attrs['Print size'],totalPrints:30,photos}));
  const zips = parts.map(p=>zipSync(p));
  const load = async (n:number) => new Uint8Array(zips[n-1]).buffer;
  const result = unzipSync(await buildPolaroidPrintExport(attrs, load));
  const ma = JSON.parse(strFromU8(result['print-manifest.json']));
  assert(Object.keys(result).length===33 && ma.sheets.length===2 && ma.totalPrints===30,'30 photos and two sheets');
  assert(ma.sheets[0].photos.length===18 && ma.sheets[1].photos.length===12,'18+12 layout');
  assert(dpi(result[ma.sheets[0].photos[0]]).every(n=>n===300),'individual DPI');
  await checkSheet(result[ma.sheets[0].file],18,0); await checkSheet(result[ma.sheets[1].file],12,18);
  await buildPolaroidPrintExport({...attrs,'Number of prints':'31'},load)
    .then(()=>{throw new Error('count mismatch was accepted');},e=>assert(/number of prints/.test(e.message),'correct count rejection'));
  await buildPolaroidPrintExport({'Print files 2':attrs['Print files 2'],'Print size':attrs['Print size']},load)
    .then(()=>{throw new Error('missing zip was accepted');},e=>assert(/missing or duplicated/.test(e.message),'correct missing ZIP rejection'));
  document.body.textContent='PASS: 30 individual images, two 13×19 sheets (18+12), 300 DPI, all placements, missing part and wrong count.';
})().catch(err=>document.body.textContent='FAIL: '+String(err?.stack||err));
