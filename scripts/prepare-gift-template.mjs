import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const moduleRoot = process.env.GIFT_TEMPLATE_NODE_MODULES;
const sharp = require(moduleRoot ? path.join(moduleRoot, 'sharp') : 'sharp');
const {writePsd, readPsd, initializeCanvas} = require(process.env.GIFT_TEMPLATE_PSD_MODULE || 'ag-psd');
initializeCanvas(() => {throw new Error('This authoring tool uses raw image data.');}, (width,height) => ({width,height,data:new Uint8ClampedArray(width*height*4)}));
const layoutPath = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Pass a reviewed .layout.json file.');
const base = path.dirname(layoutPath);
const layout = JSON.parse(await fs.readFile(layoutPath, 'utf8'));
for (const [fileKey,urlKey] of [['background','backgroundUrl'],['source','sourceUrl']]) {
  const destination = path.resolve(base,layout[fileKey]);
  assert(destination.startsWith(base+path.sep));
  try {await fs.access(destination);} catch {
    const url = new URL(layout[urlKey]);
    assert.equal(url.protocol,'https:');
    assert.equal(url.hostname,'cdn.shopify.com');
    const response = await fetch(url,{signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`Asset fetch failed: ${response.status}`);
    await fs.mkdir(path.dirname(destination),{recursive:true});
    await fs.writeFile(destination,Buffer.from(await response.arrayBuffer()));
  }
}
const output = path.join(base, layout.sku);
await fs.mkdir(output, {recursive: true});
const background = await sharp(path.join(base, layout.background)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const {width, height} = background.info;
const polygon = layout.photo.polygon;
assert.equal(polygon.length, 4);
const left = Math.floor(Math.min(...polygon.map(p => p[0])));
const top = Math.floor(Math.min(...polygon.map(p => p[1])));
const right = Math.ceil(Math.max(...polygon.map(p => p[0])));
const bottom = Math.ceil(Math.max(...polygon.map(p => p[1])));
assert(left >= 0 && top >= 0 && right <= width && bottom <= height);
const contains = (x,y) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi,yi] = polygon[i], [xj,yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside = !inside;
  }
  return inside;
};
const overlay = Buffer.from(background.data);
const mask = Buffer.alloc((right-left)*(bottom-top)*4);
let insidePixels = 0;
for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
  const isPhoto = contains(x+0.5, y+0.5);
  overlay[(y*width+x)*4+3] = isPhoto ? 0 : 255;
  if (isPhoto) {
    const i=((y-top)*(right-left)+x-left)*4;
    mask[i]=mask[i+1]=mask[i+2]=mask[i+3]=255;
    insidePixels++;
  }
}
assert(insidePixels > 0);
const writePng = (name, data, w, h) => sharp(data,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(output,name));
await writePng('overlay.png',overlay,width,height);
await writePng('photo-mask.png',mask,right-left,bottom-top);
const photo = await sharp(path.join(base,layout.source)).extract(layout.photo.sourceCrop).resize(right-left,bottom-top,{fit:'cover'}).ensureAlpha().raw().toBuffer();
const composite = Buffer.from(overlay);
const photoLayer = Buffer.alloc(width*height*4);
for (let y=top;y<bottom;y++) for (let x=left;x<right;x++) {
  const si=((y-top)*(right-left)+x-left)*4;
  const di=(y*width+x)*4;
  if (mask[si+3]) {
    photo.copy(composite,di,si,si+4);
    photo.copy(photoLayer,di,si,si+4);
  }
}
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${layout.textFields.map(t=>`<text x="${width*t.x/100}" y="${height*t.y/100}" text-anchor="middle" dominant-baseline="middle" font-family="${escape(t.fontFamily)}" font-style="italic" font-size="${t.fontSize*width/1200}" fill="${t.color}">${escape(t.sample)}</text>`).join('')}</svg>`;
const preview = await sharp(composite,{raw:{width,height,channels:4}}).composite([{input:Buffer.from(textSvg)}]).raw().toBuffer();
await writePng('preview.png',preview,width,height);
const fullImage = data => ({width,height,data:new Uint8ClampedArray(data)});
const textLayers = layout.textFields.map(t=>({name:`TEXT_${t.label}`,text:{text:t.sample,transform:[1,0,0,1,width*t.x/100,height*t.y/100],shapeType:'box',boxBounds:[-width*t.width/200,-height*t.height/200,width*t.width/200,height*t.height/200],style:{font:{name:'Georgia-Italic'},fontSize:t.fontSize*width/1200,fillColor:{r:255,g:243,b:188}},paragraphStyle:{justification:'center'}}}));
const originalReference = await sharp(path.join(base,layout.source)).resize(width,height).ensureAlpha().raw().toBuffer();
const psd = {width,height,imageData:fullImage(preview),children:[
  {name:'REFERENCE_original_supplier_image_DO_NOT_PRINT',hidden:true,imageData:fullImage(originalReference)},
  {name:'PHOTO_1_Your_photo',imageData:fullImage(photoLayer)},
  {name:'Product_frame_background_and_fixed_artwork',imageData:fullImage(overlay)},
  ...textLayers
]};
await fs.writeFile(path.join(output,`${layout.sku}.psd`),Buffer.from(writePsd(psd,{invalidateTextLayers:true})));
const readback = readPsd(await fs.readFile(path.join(output,`${layout.sku}.psd`)),{useImageData:true,skipCompositeImageData:true,skipThumbnail:true});
assert.equal(readback.width,width);
assert.equal(readback.children.filter(l=>l.name.startsWith('PHOTO_')).length,1);
assert.equal(readback.children.filter(l=>l.text).length,layout.textFields.length);
const config = {
  enabled:true, canvasRatio:`${width}:${height}`, overlayUrl:layout.overlayUrl || '',
  photoFields:[{id:'photo-1',label:'Your photo',maskUrl:layout.maskUrl || '',x:(left+right)*50/width,y:(top+bottom)*50/height,width:(right-left)*100/width,height:(bottom-top)*100/height,rotationEnabled:true,required:true}],
  textFields:layout.textFields.map(({sample,...t})=>({...t,defaultValue:'',maxLength:t.id==='date'?20:40,alignment:'center',fitToBox:true,allowFontChoice:true,movable:true,scalable:true,rotatable:true,allowColorChoice:true,rotation:0,required:true})),
  fileFields:[],linkFields:[],customFonts:[]
};
await fs.writeFile(path.join(output,'config.draft.json'),JSON.stringify(config,null,2)+'\n');
await fs.writeFile(path.join(output,'validation.json'),JSON.stringify({sku:layout.sku,width,height,insidePixels,psdReadback:true,photoFields:1,textFields:textLayers.length,publishable:false,reason:'CDN assets, visual comparison, production artwork and storefront workflow still require verification.'},null,2)+'\n');
console.log(`${layout.sku}: layered PSD readback passed; draft assets prepared, not published.`);
