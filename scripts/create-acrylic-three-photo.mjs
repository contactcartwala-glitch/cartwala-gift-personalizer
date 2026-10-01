import fs from 'node:fs';
import { createRequire } from 'node:module';
const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
import { initializeCanvas, writePsdBuffer, readPsd } from 'ag-psd';
initializeCanvas(createCanvas);
const dir='assets/acrylic-three-photo',w=1200,h=1800;
const canvas=()=>createCanvas(w,h);
const bg=canvas(), c=bg.getContext('2d');
c.fillStyle='#f8f5ee';c.fillRect(0,0,w,h);
c.strokeStyle='#bc9b59';c.lineWidth=3;c.strokeRect(36,36,1128,1728);
c.lineWidth=1;c.strokeRect(48,48,1104,1704);
c.fillStyle='#594b36';c.textAlign='center';c.font='38px serif';c.fillText('Together',600,148);
c.font='18px sans-serif';c.letterSpacing='3px';c.fillText('OUR FAVOURITE MOMENTS',600,1710);
const slots=[{name:'PHOTO 1',x:96,y:224,w:1008,h:822},{name:'PHOTO 2',x:96,y:1080,w:487,h:508},{name:'PHOTO 3',x:617,y:1080,w:487,h:508}];
for(const s of slots){c.strokeStyle='#bc9b59';c.lineWidth=2;c.strokeRect(s.x-7,s.y-7,s.w+14,s.h+14);c.clearRect(s.x,s.y,s.w,s.h);}
const children=[{name:'ARTWORK - editable border and typography',canvas:bg}];
const preview=canvas(),pc=preview.getContext('2d');
for(let i=0;i<slots.length;i++){
 const s=slots[i], tile=createCanvas(s.w,s.h),t=tile.getContext('2d');
 t.fillStyle=['#e1d9cd','#d5d0c4','#e7dfd0'][i];t.fillRect(0,0,s.w,s.h);
 t.fillStyle='#726650';t.font='24px sans-serif';t.textAlign='center';t.fillText(`Upload Photo ${i+1}`,s.w/2,s.h/2);
 children.unshift({name:s.name,top:s.y,left:s.x,bottom:s.y+s.h,right:s.x+s.w,canvas:tile});pc.drawImage(tile,s.x,s.y);
 const mask=createCanvas(1000,1000),m=mask.getContext('2d');m.fillStyle='white';m.fillRect(0,0,1000,1000);fs.writeFileSync(`${dir}/photo-${i+1}-mask.png`,mask.toBuffer('image/png'));
}
pc.drawImage(bg,0,0);
fs.writeFileSync(`${dir}/three-photo-portrait-preview.png`,preview.toBuffer('image/png'));
fs.writeFileSync(`${dir}/three-photo-portrait-overlay.png`,bg.toBuffer('image/png'));
const psd=writePsdBuffer({width:w,height:h,canvas:preview,children});
fs.writeFileSync(`${dir}/Cartwala-Three-Photo-Portrait.psd`,psd);
const check=readPsd(psd,{skipLayerImageData:true,skipCompositeImageData:true});
if(check.children.filter(x=>/^PHOTO/.test(x.name)).length!==3)throw Error('PSD slots invalid');
const config={enabled:true,acrylicDesign:{masterProductId:'gid://shopify/Product/15402886135993',orientation:'Portrait'},overlayUrl:'',canvasRatio:`${w}:${h}`,photoFields:slots.map((s,i)=>({id:`acrylic-photo-${i+1}`,label:`Upload Photo ${i+1}`,maskUrl:'',x:(s.x+s.w/2)/w*100,y:(s.y+s.h/2)/h*100,width:s.w/w*100,height:s.h/h*100,required:true,rotationEnabled:false})),textFields:[],fileFields:[],linkFields:[],customFonts:[]};
fs.writeFileSync(`${dir}/config.json`,JSON.stringify(config,null,2));
console.log('Created layered PSD, overlay, three masks and preview.');
