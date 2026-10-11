
(() => {
 const root=document.querySelector('[data-mosaic-studio]');if(!root)return;
 const pick=s=>root.querySelector(s),background=pick('[data-background]'),main=pick('[data-main]'),preview=pick('[data-preview]'),ctx=preview.getContext('2d'),maskCanvas=pick('[data-mask]'),maskCtx=maskCanvas.getContext('2d');
 let photos=[],portrait=null,sourceCanvas=null,fullSource=null,initialCutout=null,brushMode='restore',drawing=false,portraitBounds=null,portraitScale=1,portraitOffsetX=0,portraitOffsetY=0,portraitRect=null;const activePointers=new Map();let pinchStart=null,resizeStart=null;
 const error=message=>{const el=pick('[data-error]');el.textContent=message;el.hidden=!message};
 const imageFromFile=file=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not read '+file.name))};img.src=url});
 function cover(g,img,x,y,w,h){const ratio=Math.max(w/img.width,h/img.height),iw=img.width*ratio,ih=img.height*ratio;g.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih)}
 function updatePortraitBounds(){if(!portrait)return;const pixels=maskCtx.getImageData(0,0,600,900).data;let left=600,top=900,right=-1,bottom=-1;for(let y=0;y<900;y++)for(let x=0;x<600;x++){if(pixels[(y*600+x)*4+3]>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}}portraitBounds=right>=left?{x:left,y:top,w:right-left+1,h:bottom-top+1}:null}
 function drawBackground(g=ctx){
   const W=preview.width,H=preview.height,gap=7;
   g.fillStyle='#fff';g.fillRect(0,0,W,H);
   // Justify every row using a single fixed gutter. Repeat photos to fill edges around the cutout.
   const ratios=photos.map(photo=>photo.width/photo.height);
   let best=null;
   for(let rowCount=6;rowCount<=16;rowCount++){
     const available=H-(rowCount+1)*gap,target=available/rowCount;
     let beam=[{index:0,height:0,rows:[],penalty:0}];
     for(let row=0;row<rowCount;row++){
       const next=[];
       for(const state of beam){
         let ratioSum=0;
         for(let count=1;count<=12;count++){
           ratioSum+=ratios[(state.index+count-1)%photos.length];
           const height=(W-(count+1)*gap)/ratioSum;
           if(height<55||height>320)continue;
           const total=state.height+height;
           const penalty=state.penalty+Math.pow((height-target)/target,2);
           next.push({index:state.index+count,height:total,rows:[...state.rows,{start:state.index,count,height}],penalty});
         }
       }
       if(!next.length)break;
       next.sort((a,b)=>(Math.abs(a.height-(row+1)*target)/target+a.penalty*.12)-(Math.abs(b.height-(row+1)*target)/target+b.penalty*.12));
       beam=next.slice(0,60);
     }
     if(!beam.length||beam[0].rows.length!==rowCount)continue;
     for(const state of beam){
       const scale=available/state.height;
       const missed=Math.max(0,photos.length-state.index);
       const repeats=Math.max(0,state.index-photos.length);
       const score=Math.abs(1-scale)*40+state.penalty*.1+missed*2+repeats*.035;
       if(!best||score<best.score)best={...state,scale,score};
     }
   }
   if(!best)return;
   let y=gap;
   for(const row of best.rows){
     let x=gap;
     for(let i=0;i<row.count;i++){
       const index=(row.start+i)%photos.length,photo=photos[index];
       const width=row.height*ratios[index];
       g.drawImage(photo,x,y,width,row.height*best.scale);
       x+=width+gap;
     }
     y+=row.height*best.scale+gap;
   }
 }

 function render(){invalidate();if(photos.length<10){pick('[data-frame]').hidden=true;pick('[data-empty]').hidden=false;return}pick('[data-frame]').hidden=false;pick('[data-empty]').hidden=true;drawBackground();const handle=pick('[data-resize]'),reset=pick('[data-reset-placement]');preview.dataset.draggable=String(Boolean(portrait&&portraitBounds));portraitRect=null;handle.hidden=reset.hidden=!portraitBounds;if(portrait&&portraitBounds){const b=portraitBounds,ratio=Math.min(preview.width*.85/b.w,preview.height/b.h),width=b.w*ratio*portraitScale,height=b.h*ratio*portraitScale,x=(preview.width-width)/2+portraitOffsetX,y=preview.height-height+portraitOffsetY;portraitRect={x,y,width,height};ctx.drawImage(portrait,b.x,b.y,b.w,b.h,x,y,width,height);handle.style.left=Math.max(4,Math.min(96,(x+width)*100/preview.width))+'%';handle.style.top=Math.max(3,Math.min(97,(y+height)*100/preview.height))+'%'}}
 background.addEventListener('change',async()=>{error('');invalidate();const files=[...background.files];if(files.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>25*1024*1024)){error('Choose JPG, PNG or WebP photos under 25 MB each.');return}if(files.length>50){error('Choose no more than 50 background photos.');background.value='';return}saveButton.disabled=true;background.disabled=true;try{photos=await Promise.all(files.map(imageFromFile));backgroundFiles=files;pick('[data-count]').textContent=photos.length+' of 10 minimum photos selected';pick('[data-thumbs]').replaceChildren(...files.map((f,i)=>{const img=document.createElement('img');img.src=URL.createObjectURL(f);img.alt='Background photo '+(i+1);img.onload=()=>URL.revokeObjectURL(img.src);return img}));if(files.length<10)error('Add '+(10-files.length)+' more background photos to show the preview.');render()}catch(e){error(e.message)}finally{saveButton.disabled=false;background.disabled=false}});
 async function removeBackground(image){
   const {pipeline}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0');
   sourceCanvas=document.createElement('canvas');sourceCanvas.width=600;sourceCanvas.height=900;
   const sourceCtx=sourceCanvas.getContext('2d');sourceCtx.clearRect(0,0,600,900);
   const scale=Math.min(600/image.width,900/image.height),w=image.width*scale,h=image.height*scale;
   sourceCtx.drawImage(image,(600-w)/2,(900-h)/2,w,h);fullSource=document.createElement('canvas');fullSource.width=1800;fullSource.height=2700;fullSource.getContext('2d').drawImage(image,(600-w)*1.5,(900-h)*1.5,w*3,h*3);
   const segmenter=await pipeline('background-removal','Xenova/modnet',{dtype:'fp32',device:'wasm'});
   const result=await segmenter(sourceCanvas.toDataURL('image/png'));
   const imageResult=Array.isArray(result)?result[0]:result;
   if(!imageResult?.toCanvas)throw new Error('No cutout was returned.');
   const cutout=await imageResult.toCanvas();
   maskCtx.clearRect(0,0,600,900);maskCtx.drawImage(cutout,0,0,600,900);
   initialCutout=document.createElement('canvas');initialCutout.width=600;initialCutout.height=900;
   initialCutout.getContext('2d').drawImage(maskCanvas,0,0);
   portrait=maskCanvas;updatePortraitBounds();
 }
 main.addEventListener('change',async()=>{const file=main.files[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>25*1024*1024){error('Choose a JPG, PNG or WebP under 25 MB.');return}mainFile=file;invalidate();error('');portrait=null;portraitBounds=null;render();saveButton.disabled=true;main.disabled=true;pick('[data-tools]').hidden=true;pick('[data-removal-loading]').hidden=false;root.setAttribute('aria-busy','true');pick('[data-main-status]').textContent='Removing background on your device…';try{await removeBackground(await imageFromFile(file));pick('[data-tools]').hidden=false;pick('[data-position-hint]').hidden=false;portraitScale=1;portraitOffsetX=0;portraitOffsetY=0;pick('[data-main-status]').textContent='Background removed. Refine the edges if needed.';render()}catch(e){portrait=null;portraitBounds=null;pick('[data-tools]').hidden=true;pick('[data-position-hint]').hidden=true;pick('[data-main-status]').textContent='Background removal unavailable';error('Could not remove the background: '+e.message)}finally{saveButton.disabled=false;main.disabled=false;pick('[data-removal-loading]').hidden=true;root.removeAttribute('aria-busy')}});
 root.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{brushMode=button.dataset.mode;root.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)))}));
 function paint(event){if(!drawing||!portrait)return;const rect=maskCanvas.getBoundingClientRect(),x=(event.clientX-rect.left)*600/rect.width,y=(event.clientY-rect.top)*900/rect.height,r=Number(pick('[data-brush]').value);maskCtx.save();maskCtx.beginPath();maskCtx.arc(x,y,r,0,Math.PI*2);maskCtx.clip();if(brushMode==='erase'){maskCtx.clearRect(x-r,y-r,r*2,r*2)}else{maskCtx.drawImage(sourceCanvas,0,0)}maskCtx.restore()}
 const cutoutDialog=pick('[data-cutout-dialog]');let history=[],historyIndex=0,openingMask=null;
 const snapshot=()=>maskCtx.getImageData(0,0,600,900);
 function historyButtons(){pick('[data-undo]').disabled=historyIndex===0;pick('[data-redo]').disabled=historyIndex===history.length-1}
 function remember(){history=history.slice(0,historyIndex+1);history.push(snapshot());if(history.length>21)history.shift();historyIndex=history.length-1;historyButtons()}
 pick('[data-tools]').addEventListener('click',()=>{if(!portrait)return;openingMask=snapshot();history=[openingMask];historyIndex=0;historyButtons();cutoutDialog.showModal()});
 function cancelCutout(){if(openingMask)maskCtx.putImageData(openingMask,0,0);drawing=false;cutoutDialog.close()}
 root.querySelectorAll('[data-cancel-cutout]').forEach(b=>b.addEventListener('click',cancelCutout));
 cutoutDialog.addEventListener('cancel',e=>{e.preventDefault();cancelCutout()});
 pick('[data-save-cutout]').addEventListener('click',()=>{drawing=false;updatePortraitBounds();render();cutoutDialog.close();pick('[data-frame]').scrollIntoView({behavior:'smooth',block:'center'})});
 pick('[data-undo]').addEventListener('click',()=>{if(historyIndex>0){maskCtx.putImageData(history[--historyIndex],0,0);historyButtons()}});
 pick('[data-redo]').addEventListener('click',()=>{if(historyIndex<history.length-1){maskCtx.putImageData(history[++historyIndex],0,0);historyButtons()}});
 maskCanvas.addEventListener('pointerdown',e=>{if(drawing)return;drawing=true;maskCanvas.setPointerCapture(e.pointerId);paint(e)});maskCanvas.addEventListener('pointermove',paint);
 function finishStroke(){if(drawing){drawing=false;remember()}}
 maskCanvas.addEventListener('pointerup',finishStroke);maskCanvas.addEventListener('pointercancel',finishStroke);
 pick('[data-reset-mask]').addEventListener('click',()=>{if(!initialCutout)return;maskCtx.clearRect(0,0,600,900);maskCtx.drawImage(initialCutout,0,0);remember()});
 function canvasPoint(e){const r=preview.getBoundingClientRect();return{x:(e.clientX-r.left)*preview.width/r.width,y:(e.clientY-r.top)*preview.height/r.height}}
 function changeScale(next,anchor){if(!portraitRect)return;next=Math.max(.6,Math.min(1.8,next));const old=portraitRect,factor=next/portraitScale,newWidth=old.width*factor,newHeight=old.height*factor,fx=(anchor.x-old.x)/old.width,fy=(anchor.y-old.y)/old.height,newX=anchor.x-fx*newWidth,newY=anchor.y-fy*newHeight;portraitScale=next;portraitOffsetX=newX-(preview.width-newWidth)/2;portraitOffsetY=newY-(preview.height-newHeight);render()}
 function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
 preview.addEventListener('pointerdown',e=>{if(!portraitRect)return;const p=canvasPoint(e),r=portraitRect;if(activePointers.size===0&&(p.x<r.x||p.x>r.x+r.width||p.y<r.y||p.y>r.y+r.height))return;activePointers.set(e.pointerId,p);preview.setPointerCapture(e.pointerId);if(activePointers.size===2){const points=[...activePointers.values()];pinchStart={distance:Math.max(1,distance(points[0],points[1])),scale:portraitScale}}});
 preview.addEventListener('pointermove',e=>{if(!activePointers.has(e.pointerId))return;const p=canvasPoint(e),old=activePointers.get(e.pointerId);activePointers.set(e.pointerId,p);if(activePointers.size===2&&pinchStart){const points=[...activePointers.values()],anchor={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};changeScale(pinchStart.scale*distance(points[0],points[1])/pinchStart.distance,anchor)}else if(activePointers.size===1){portraitOffsetX+=p.x-old.x;portraitOffsetY+=p.y-old.y;render()}});
 function releasePointer(e){activePointers.delete(e.pointerId);if(activePointers.size<2)pinchStart=null}
 preview.addEventListener('pointerup',releasePointer);preview.addEventListener('pointercancel',releasePointer);
 const handle=pick('[data-resize]');handle.addEventListener('pointerdown',e=>{if(!portraitRect)return;e.preventDefault();e.stopPropagation();const r=portraitRect,center={x:r.x+r.width/2,y:r.y+r.height/2};resizeStart={id:e.pointerId,center,distance:Math.max(1,distance(canvasPoint(e),center)),scale:portraitScale};handle.setPointerCapture(e.pointerId)});
 handle.addEventListener('pointermove',e=>{if(!resizeStart||resizeStart.id!==e.pointerId)return;changeScale(resizeStart.scale*distance(canvasPoint(e),resizeStart.center)/resizeStart.distance,resizeStart.center)});
 handle.addEventListener('pointerup',()=>resizeStart=null);handle.addEventListener('pointercancel',()=>resizeStart=null);
 pick('[data-reset-placement]').addEventListener('click',()=>{portraitScale=1;portraitOffsetX=0;portraitOffsetY=0;render()});
 

 const master=JSON.parse(pick('[data-master-json]').textContent), size=pick('[data-size]'), direction=pick('[data-direction]'), editor=pick('[data-editor]'), saveButton=pick('[data-save]'), cartButton=pick('[data-cart]'), hero=pick('[data-hero]');
 let saved=null,busy=false,backgroundFiles=[],mainFile=null,heroBlobUrl=null;
 root.addEventListener('pointerdown',event=>{if(busy){event.preventDefault();event.stopImmediatePropagation()}},true);
 const uploadCache=new WeakMap(),contentUploads=new Map(),route=window.Shopify?.routes?.root||'/';
 const money=n=>new Intl.NumberFormat(document.documentElement.lang||'en-IN',{style:'currency',currency:master.currency||'INR'}).format(n/100);
 const selected=()=>master.variants.find(v=>v.option1===size.value&&v.option2===direction.value);
 function invalidate(){saved=null;cartButton.hidden=true;cartButton.disabled=true;pick('[data-open]').textContent='Customise Now';pick('[data-save-status]').textContent='';}
 function syncOptions(){invalidate();const landscape=direction.value==='Landscape';preview.width=landscape?1350:900;preview.height=landscape?900:1350;preview.style.aspectRatio=landscape?'3 / 2':'2 / 3';root.dataset.direction=direction.value;portraitScale=1;portraitOffsetX=portraitOffsetY=0;hero.src=landscape?root.dataset.landscapeImage:root.dataset.productImage;const v=selected();pick('[data-price]').textContent=v?money(v.price):'Unavailable';pick('[data-open]').disabled=!v?.available;render();}
 [...new Set(master.variants.map(v=>v.option1))].forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value.replace('x',' × ')+' inches';size.append(option)});
 size.addEventListener('change',syncOptions);direction.addEventListener('change',syncOptions);
 pick('[data-open]').addEventListener('click',()=>{editor.hidden=false;hero.hidden=true;pick('[data-preview-area]').hidden=false;cartButton.hidden=true;editor.scrollIntoView({behavior:'smooth',block:'nearest'});});
 const blobOf=(canvas,type='image/png')=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not prepare your design.')),type,.96));
 const uploadOne=async file=>{if(uploadCache.has(file))return uploadCache.get(file);const data=new FormData();data.set('intent','personalizer_upload');data.set('file',file,file.name);const response=await fetch(route+'apps/cartwala-signature-day',{method:'POST',body:data,headers:{Accept:'application/json'}});const result=await response.json().catch(()=>({error:'Photo upload did not finish. Please try Preview & Save again.'}));let valid=false;try{const u=new URL(result.url);valid=u.protocol==='https:'&&u.hostname==='cdn.shopify.com'&&u.pathname.startsWith('/s/files/')}catch{}if(!response.ok||!valid)throw new Error(result.error||'Photo saving failed. Please try again.');uploadCache.set(file,result.url);return result.url;};
 const upload=async file=>{if(uploadCache.has(file))return uploadCache.get(file);const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());const key=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');if(!contentUploads.has(key)){const task=uploadOne(file).catch(e=>{contentUploads.delete(key);throw e});contentUploads.set(key,task);}const url=await contentUploads.get(key);uploadCache.set(file,url);return url;};
 const loadImage=url=>new Promise((resolve,reject)=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Frame preview could not load.'));im.src=url;});
 async function framedPreview(){const base=await loadImage(direction.value==='Landscape'?root.dataset.landscapeFrame:root.dataset.portraitFrame);const canvas=document.createElement('canvas');canvas.width=base.width;canvas.height=base.height;const g=canvas.getContext('2d');g.drawImage(base,0,0);const rect=direction.value==='Landscape'?[118/1254,265/1254,1018/1254,707/1254]:[279/1254,147/1254,696/1254,963/1254];g.drawImage(preview,...rect.map((n,i)=>n*(i%2?canvas.height:canvas.width)));return canvas;}
 saveButton.addEventListener('click',async()=>{if(busy)return;error('');if(photos.length<10||!portrait||!mainFile){error('Upload at least 10 background photos and a main photo before saving.');return}busy=true;pick('[data-preview-area]').inert=true;editor.disabled=true;size.disabled=direction.disabled=true;saveButton.textContent='Saving your design…';try{
  const variant=selected();if(!variant?.available)throw new Error('Choose an available frame size.');
  const id=crypto.randomUUID(),properties={'Design':'Mosaic Photo Frame','Size':size.value,'Orientation':direction.value,'_Cartwala Design ID':id,'_Cartwala Personalization':'Completed','_Cartwala Design Product':String(root.dataset.productId)};
  let next=0;const files=[...backgroundFiles,mainFile];await Promise.all(Array.from({length:3},async()=>{while(next<files.length){const index=next++;const url=await upload(files[index]);properties[index===backgroundFiles.length?'_Mosaic Main Photo':'_Mosaic Background '+(index+1)]=url;pick('[data-save-status]').textContent='Saving photos '+Object.keys(properties).filter(k=>k.startsWith('_Mosaic')).length+' / '+files.length;}}));
  const printCanvas=document.createElement('canvas');printCanvas.width=preview.width*4;printCanvas.height=preview.height*4;const pg=printCanvas.getContext('2d');pg.scale(4,4);drawBackground(pg);const b=portraitBounds,r=portraitRect;const cutout=document.createElement('canvas');cutout.width=1800;cutout.height=2700;const cg=cutout.getContext('2d');cg.drawImage(fullSource,0,0);cg.globalCompositeOperation='destination-in';cg.drawImage(portrait,0,0,1800,2700);pg.drawImage(cutout,b.x*3,b.y*3,b.w*3,b.h*3,r.x,r.y,r.width,r.height);const art=new File([await blobOf(printCanvas,'image/jpeg')],'mosaic-artwork-'+id+'.jpg',{type:'image/jpeg'});const frame=await framedPreview();const thumbBlob=await blobOf(frame,'image/jpeg');const thumb=new File([thumbBlob],'mosaic-preview-'+id+'.jpg',{type:'image/jpeg'});
  const [artUrl,thumbUrl]=await Promise.all([upload(art),upload(thumb)]);
  properties['_Cartwala Source mosaic-artwork']=artUrl;properties['_Personalised Preview']=thumbUrl;properties['_Cartwala Design JSON']=JSON.stringify({v:1,r:direction.value==='Landscape'?'3:2':'2:3',o:'',p:[{i:'mosaic-artwork',l:'Mosaic artwork',x:50,y:50,w:100,h:100,m:'',ox:0,oy:0,s:1,a:0}],t:[]});
  properties['_Mosaic Placement']=JSON.stringify({scale:portraitScale,x:portraitOffsetX,y:portraitOffsetY});
  const dimensions=size.value.split('x').map(Number);if(direction.value==='Landscape')dimensions.reverse();properties['_Cartwala Print Width']=String(dimensions[0]);properties['_Cartwala Print Height']=String(dimensions[1]);
  saved={id:variant.id,properties};if(heroBlobUrl)URL.revokeObjectURL(heroBlobUrl);heroBlobUrl=URL.createObjectURL(thumbBlob);hero.src=heroBlobUrl;hero.hidden=false;pick('[data-preview-area]').hidden=true;editor.hidden=true;cartButton.hidden=false;cartButton.disabled=false;pick('[data-open]').textContent='Edit Again';pick('[data-save-status]').textContent='Your mosaic is saved and ready to add to cart.';
 }catch(e){saved=null;error(e.message)}finally{busy=false;pick('[data-preview-area]').inert=false;editor.disabled=false;size.disabled=direction.disabled=false;saveButton.textContent='Preview & Save';}});
 cartButton.addEventListener('click',async()=>{if(!saved||busy)return;busy=true;cartButton.disabled=true;cartButton.textContent='Adding to Cart…';pick('[data-open]').disabled=true;size.disabled=direction.disabled=true;error('');try{const response=await fetch(route+'cart/add.js',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({items:[{...saved,quantity:1}]})});const result=await response.json();if(!response.ok)throw new Error(result.description||'Could not add your frame. Please try again.');window.location.assign(route+'cart');}catch(e){error(e.message);busy=false;cartButton.disabled=false;cartButton.textContent='Add to Cart';pick('[data-open]').disabled=false;size.disabled=direction.disabled=false;}});
 syncOptions();

})();
