import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {readPsd, initializeCanvas} from 'ag-psd';

// Run with the directory containing the 73 editable PSDs downloaded by the merchant.
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/extract-gift-template-assets.mjs /absolute/path/to/PSDs');
initializeCanvas(()=>{}, (width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}));
const base='assets/gift-catalog';
for (let n=1;n<=73;n++) {
  const sku=`CW-GIFT-${String(n).padStart(3,'0')}`, dir=path.join(base,sku);
  const psd=readPsd(await fs.readFile(path.join(source,`${sku}.psd`)),{useImageData:true,skipThumbnail:true});
  await fs.mkdir(dir,{recursive:true});
  const frame=psd.children.find(layer=>layer.name.startsWith('Product_frame'));
  if (!frame?.imageData) throw new Error(`${sku}: product frame is missing`);
  const write = async (data, filename) => sharp(Buffer.from(data.data),{raw:{width:data.width,height:data.height,channels:4}})
    .png({compressionLevel:0,adaptiveFiltering:false}).toFile(path.join(dir,filename));
  await write(frame.imageData,`${sku}-overlay.png`);
  await write(psd.imageData,`${sku}-preview.png`);
  const photos=psd.children.filter(layer=>layer.name.startsWith('PHOTO_'));
  for (const [index,photo] of photos.entries()) {
    const mask=photo.mask?.imageData;
    if (!mask) throw new Error(`${sku}: photo mask ${index+1} is missing`);
    const rgba=new Uint8ClampedArray(mask.data);
    for (let i=0;i<rgba.length;i+=4) {rgba[i+3]=rgba[i];rgba[i]=rgba[i+1]=rgba[i+2]=255;}
    await write({...mask,data:rgba},`${sku}-photo-${index+1}-mask.png`);
  }
}
console.log('Exported the 73 template previews, product overlays and photo masks.');
