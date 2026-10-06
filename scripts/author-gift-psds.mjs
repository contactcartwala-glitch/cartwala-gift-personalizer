import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=require(path.join(process.env.GIFT_TEMPLATE_NODE_MODULES,'sharp'));
const {writePsd,readPsd,initializeCanvas}=require(process.env.GIFT_TEMPLATE_PSD_MODULE);
initializeCanvas(()=>{throw Error('Raw authoring only');},(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}));
const base=path.resolve('assets/gift-catalog');
const ids=process.argv.slice(2).map(Number);
const pixelData=(buffer,width,height)=>({width,height,data:new Uint8ClampedArray(buffer)});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function greyRegion(raw,W,H,guide){
  const pad=.10;
  const x0=Math.max(0,Math.floor(W*(guide.x/100-pad))),y0=Math.max(0,Math.floor(H*(guide.y/100-pad)));
  const x1=Math.min(W,Math.ceil(W*((guide.x+guide.width)/100+pad))),y1=Math.min(H,Math.ceil(H*((guide.y+guide.height)/100+pad)));
  const w=x1-x0,h=y1-y0,seen=new Uint8Array(w*h),components=[];
  const isGrey=(x,y)=>{const i=(y*W+x)*4,r=raw[i],g=raw[i+1],b=raw[i+2];return r>60&&r<225&&Math.max(r,g,b)-Math.min(r,g,b)<30;};
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const index=(y-y0)*w+x-x0;if(seen[index]||!isGrey(x,y))continue;
    const queue=[index];seen[index]=1;let count=0,sumx=0,sumy=0;
    for(let k=0;k<queue.length;k++){
      const q=queue[k],qx=q%w,qy=Math.floor(q/w);count++;sumx+=qx+x0;sumy+=qy+y0;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=qx+dx,yy=qy+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const n=yy*w+xx;if(!seen[n]&&isGrey(xx+x0,yy+y0)){seen[n]=1;queue.push(n);}}
    }
    if(count>80){const cx=(guide.x+guide.width/2)*W/100,cy=(guide.y+guide.height/2)*H/100;const distance=Math.hypot((sumx/count-cx)/W,(sumy/count-cy)/H);components.push({queue,score:Math.sqrt(count)/(1+distance*1000)});}
  }
  components.sort((a,b)=>b.score-a.score);
  if(!components.length)throw Error('No grey photo placeholder found');
  const mask=new Uint8Array(W*H);
  for(const q of components[0].queue)mask[(Math.floor(q/w)+y0)*W+q%w+x0]=255;
  return mask;
}
function manualRegion(W,H,p){
  const g=p.guide,mask=new Uint8Array(W*H);
  const left=Math.round(W*g.x/100),top=Math.round(H*g.y/100),right=Math.round(W*(g.x+g.width)/100),bottom=Math.round(H*(g.y+g.height)/100);
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    // Portrait engraving slots use the reviewed portrait region, not the outer product.
    const nx=(x-left)/(right-left),ny=(y-top)/(bottom-top);
    let inside=true;
    if(p.polygon){inside=false;for(let i=0,j=p.polygon.length-1;i<p.polygon.length;j=i++){const [xi,yi]=p.polygon[i],[xj,yj]=p.polygon[j];if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;}}
    if(p.treatment==='cutout')inside=((nx-.5)/.5)**2+((ny-.5)/.5)**2<1;
    if(inside)mask[y*W+x]=255;
  }
  return mask;
}
function bounds(mask,W,H){let l=W,t=H,r=0,b=0,count=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(mask[y*W+x]){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);count++;}assert(count>0);return {left:l,top:t,width:r-l,height:b-t,count};}
async function textLayer(t,W,H){
 let size=t.size*W;
 const color=t.color||'#fff2bc',lines=[];
 const maxWidth=W*t.width/100,maxHeight=H*t.height/100;
 for(const original of t.sample.split('\n')){
   const limit=Math.max(8,Math.floor(maxWidth/(size*.53)));let current='';
   for(const word of original.split(' ')){if(current.length&&current.length+word.length+1>limit){lines.push(current);current=word;}else current+=(current?' ':'')+word;}
   lines.push(current);
 }
 size=Math.min(size,maxHeight/(Math.max(1,lines.length)*1.15));
 const x=W*t.x/100,y=H*t.y/100,lineHeight=size*1.15;
 const shape=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><g fill="${color}" font-family="${esc(t.fontFamily)}" font-weight="${t.fontWeight||'normal'}" font-size="${size}" text-anchor="middle">${lines.map((line,i)=>`<text x="${x}" y="${y+(i-(lines.length-1)/2)*lineHeight}" dominant-baseline="central">${esc(line)}</text>`).join('')}</g></svg>`;
 const raster=await sharp(Buffer.from(shape)).ensureAlpha().raw().toBuffer();
 const rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16));
 const name=t.fontFamily==='Z003'?'Z003-MediumItalic':t.fontFamily.replaceAll(' ','');
 return {name:'TEXT_'+t.label,hidden:!!t.hidden,left:0,top:0,imageData:pixelData(raster,W,H),text:{text:lines.join('\n'),transform:[1,0,0,1,x,y],shapeType:'point',style:{font:{name},fauxBold:t.fontWeight==='bold',fontSize:size,fillColor:{r:rgb[0],g:rgb[1],b:rgb[2]},leading:lineHeight},paragraphStyle:{justification:'center'}}};
}
for(const id of ids){
 const sku='CW-GIFT-'+String(id).padStart(3,'0'),spec=JSON.parse(await fs.readFile(path.join(base,sku+'.spec.json'),'utf8'));
 const background=await sharp(path.join(base,spec.background)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:W,height:H}=background.info;
 const source=sharp(path.join(base,spec.source)),sourceMeta=await source.metadata();
 const originalFull=await source.clone().resize(W,H,{fit:'fill'}).ensureAlpha().raw().toBuffer();
 const folder=path.join(base,sku);await fs.mkdir(folder,{recursive:true});
 const overlay=Buffer.from(background.data),layers=[],checks=[],occupied=new Uint8Array(W*H);
 for(const p of spec.photos){
   const mask=p.maskMode==='detect-grey'?greyRegion(background.data,W,H,p.guide):manualRegion(W,H,p);
   const box=bounds(mask,W,H),g=p.sourceCropGuide||p.guide;
   if(p.treatment==='printed'){
     let overlap=0;for(let i=0;i<mask.length;i++)if(mask[i]){if(occupied[i])overlap++;occupied[i]=255;}
     assert(overlap/box.count<.01,sku+': overlapping photo masks require review');
   }
   const crop=p.maskMode==='detect-grey'&&!p.sourceCropGuide?{left:Math.floor(box.left/W*sourceMeta.width),top:Math.floor(box.top/H*sourceMeta.height),width:Math.max(1,Math.floor(box.width/W*sourceMeta.width)),height:Math.max(1,Math.floor(box.height/H*sourceMeta.height))}:{left:Math.floor(g.x*sourceMeta.width/100),top:Math.floor(g.y*sourceMeta.height/100),width:Math.floor(g.width*sourceMeta.width/100),height:Math.floor(g.height*sourceMeta.height/100)};
   const sample=await source.clone().extract(crop).resize(box.width,box.height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
   const photo=Buffer.alloc(W*H*4),maskPixels=Buffer.alloc(box.width*box.height*4);
   for(let y=box.top;y<box.top+box.height;y++)for(let x=box.left;x<box.left+box.width;x++)if(mask[y*W+x]){
     const si=((y-box.top)*box.width+x-box.left)*4,di=(y*W+x)*4;
     sample.copy(photo,di,si,si+4);
     if(p.preserveSourcePosition)originalFull.copy(photo,di,di,di+4);
     if(p.treatment==='cutout'){
       originalFull.copy(photo,di,di,di+4);
       const delta=Math.max(...[0,1,2].map(k=>Math.abs(originalFull[di+k]-background.data[di+k])));
       photo[di+3]=Math.round(Math.max(0,Math.min(1,(delta-18)/30))*255);
     }
     if(p.treatment.startsWith('engraved')){
       const originalLum=(originalFull[di]+originalFull[di+1]+originalFull[di+2])/3;
       const baseLum=(background.data[di]+background.data[di+1]+background.data[di+2])/3;
       if(p.treatment==='engraved-light'){photo[di]=255;photo[di+1]=246;photo[di+2]=211;photo[di+3]=Math.round(Math.max(0,Math.min(1,(originalLum-baseLum-8)/Math.max(20,237-baseLum)))*255);}
       else{photo[di]=72;photo[di+1]=46;photo[di+2]=23;photo[di+3]=Math.round(Math.max(0,Math.min(1,(baseLum-originalLum-8)/Math.max(20,baseLum-47)))*255);}
     }
     else if(p.treatment==='printed')overlay[di+3]=0;
     maskPixels[si]=maskPixels[si+1]=maskPixels[si+2]=maskPixels[si+3]=255;
   }
   await sharp(maskPixels,{raw:{width:box.width,height:box.height,channels:4}}).png().toFile(path.join(folder,p.id+'-mask.png'));
   const psdMask=Buffer.from(maskPixels);for(let i=3;i<psdMask.length;i+=4)psdMask[i]=255;
   layers.push({name:'PHOTO_'+p.label.replaceAll(' ','_')+'_'+p.treatment,left:0,top:0,imageData:pixelData(photo,W,H),mask:{left:box.left,top:box.top,right:box.left+box.width,bottom:box.top+box.height,defaultColor:0,imageData:pixelData(psdMask,box.width,box.height)}});
   checks.push({id:p.id,...box,sourceCrop:crop,treatment:p.treatment});
 }
 // The overlay sits above printed photographs, preserving every frame and divider.
 const printed=layers.filter(l=>l.name.endsWith('_printed')),special=layers.filter(l=>!l.name.endsWith('_printed'));
 const children=[...printed,{name:'Product_frame_base_lighting_and_fixed_artwork',imageData:pixelData(overlay,W,H)},...special];
 for(const t of spec.textFields)children.push(await textLayer(t,W,H));
 if(spec.calendar){
   const c=spec.calendar,dayNames=['Su','Mo','Tu','We','Th','Fr','Sa'],ink=[8,58].includes(id)?'#503820':'#fff2bc';
   children.push(await textLayer({label:'Calendar_Month',sample:c.month,x:c.monthX,y:c.monthY,width:c.width,height:7,size:.035,fontFamily:'DejaVu Serif',color:ink},W,H));
   for(let col=0;col<7;col++)children.push(await textLayer({label:'Weekday_'+dayNames[col],sample:dayNames[col],x:c.x+(col+.5)*c.width/7,y:c.y,width:c.width/7,height:3,size:.016,fontFamily:'DejaVu Sans',color:ink},W,H));
   const offset=c.month==='January'?3:c.month==='February'?0:c.month==='August'?5:1;
   const days=c.month==='February'?28:c.month==='September'?30:31;
   for(let d=1;d<=days;d++){const k=d-1+offset,row=Math.floor(k/7),col=k%7;children.push(await textLayer({label:'Calendar_Day_'+d,sample:String(d),x:c.x+(col+.5)*c.width/7,y:c.y+(row+1)*c.height/6,width:c.width/7,height:3,size:.016,fontFamily:'DejaVu Sans',color:d===c.day?'#ed442b':ink},W,H));}
 }
 const composite=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(children.filter(l=>!l.hidden).map(l=>({input:Buffer.from(l.imageData.data),raw:{width:W,height:H,channels:4}}))).raw().toBuffer();
 await sharp(composite,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(folder,'preview.png'));
 await sharp(overlay,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(folder,'overlay.png'));
 const psd={width:W,height:H,imageData:pixelData(composite,W,H),children};
 const file=path.join(folder,sku+'.psd');await fs.writeFile(file,Buffer.from(writePsd(psd,{trimImageData:true,invalidateTextLayers:false})));
 const readback=readPsd(await fs.readFile(file),{useImageData:true,skipCompositeImageData:true,skipThumbnail:true});
 assert.equal(readback.children.filter(l=>l.name.startsWith('PHOTO_')).length,spec.photos.length);
 assert.equal(readback.children.filter(l=>l.name.startsWith('PHOTO_')&&l.mask).length,spec.photos.length);
 assert.equal(readback.children.filter(l=>l.text).length,children.filter(l=>l.text).length);
 assert.equal(readback.width,W);assert.equal(readback.height,H);
 await fs.writeFile(path.join(folder,'layout.json'),JSON.stringify({...spec,canvas:{width:W,height:H},photoRegions:checks},null,2)+'\n');
 await fs.writeFile(path.join(folder,'validation.json'),JSON.stringify({sku,width:W,height:H,sourceWidth:sourceMeta.width,sourceHeight:sourceMeta.height,photoLayers:spec.photos.length,textLayers:children.filter(l=>l.text).length,psdReadback:true,photoshopDesktopVerified:false,productionArtwork:false,storefrontVerified:false},null,2)+'\n');
 console.log(sku+': '+spec.photos.length+' photo layers; '+children.filter(l=>l.text).length+' editable text layers; PSD readback passed.');
}
