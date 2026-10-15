(() => {
  const money = value => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:0}).format(value / 100);
  async function init(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = 'true';
    const $ = s => root.querySelector(s);
    const product = JSON.parse($('[data-product]').textContent);
    const t = JSON.parse($('[data-translations]').textContent);
    const ht=JSON.parse($('[data-heart-translations]').textContent);
    const status = $('[data-status]');
    let catalog, mockups;
    try { const response = await fetch(root.dataset.catalog); if (!response.ok) throw new Error(); catalog = await response.json(); const mr=await fetch(root.dataset.mockups);if(!mr.ok)throw new Error();mockups=await mr.json(); }
    catch (_) { status.textContent = t.js_0; return; }
    const model = catalog.find(p => p.handle === product.handle);
    const mockup=mockups[model?.key];
    const isKeychain=product.handle.includes('keychain');
    if (!model || !mockup) { status.textContent = t.js_1; return; }
    const size = $('[data-size]'), engraving = $('[data-engraving]');
    const editor = $('[data-editor]'), canvas = $('[data-canvas]'), ctx = canvas.getContext('2d');
    const upload = $('[data-upload]'),live=$('[data-live-preview]'),liveCtx=live.getContext('2d');
    const message = $('[data-message]'), font = $('[data-font]'), save = $('[data-save]'), add = $('[data-add]');
    const editorStatus = $('[data-editor-status]');
    const editCutoutButton=$('[data-edit-cutout]');
    function processingLabel(key){if(!processing)return;$('[data-processing-label]').textContent=ht[key];editorStatus.textContent=ht[key];}
    let layout={sx:1,sy:1,anchor:[627,1010]},previewGeneration=0,designSaved=false;
    let textTransform={x:mockup.text[0],y:mockup.text[1],scale:1,rotation:0},textSelected=false,textBox={w:100,h:50},textGesture=null;
    const textOverlay=$('[data-text-overlay]');
    let variant, row, image = null, photoFile = null, photoUrl = null, previewBlob = null, previewUrl = null;
    let crop={x:mockup.center[0],y:mockup.center[1],zoom:1}, busy=false, imageVersion=0, revision=0, processing=false, cutoutBlob=null, editSource=null, editCutout=null;
    const blank=new Image();blank.crossOrigin="anonymous";
    let blankReady=false,crystalLayer=null;blank.onload=()=>{blankReady=true;prepareCrystal();save.disabled=!image||processing;draw();};blank.onerror=()=>{editorStatus.textContent=ht.mockup_failed;save.disabled=true;};blank.src=mockup.blank;
    const centerUpload=$('[data-center-upload]');centerUpload.style.left=(mockup.center[0]/1254*100)+'%';centerUpload.style.top=(mockup.center[1]/1254*100)+'%';
    const unique = array => [...new Set(array)];
    function options(select, values) { const previous=select.value; select.replaceChildren(...values.map(value=>new Option(value,value))); if(values.includes(previous)) select.value=previous; }
    options(size, unique(product.variants.map(v=>v.options[0])));
    $('[data-size-picker]').hidden=size.options.length===1;
    function dirty() { designSaved=false;revision++;delete status.dataset.error; previewBlob=null;add.disabled=true;save.disabled=!image||processing||!blankReady;status.textContent=t.js_2;$('[data-saved]').hidden=true;$('.cwcr-hero').hidden=false; }
    function selected() {
      const keepSaved=designSaved;
      row=model.rows.find(r=>r.label===size.value) || model.rows[0];
      options(engraving,unique(product.variants.filter(v=>v.options[0]===size.value&&row.engravings.some(type=>v.options[1].startsWith(type))).map(v=>v.options[1])));
      $('[data-engraving-picker]').hidden=engraving.options.length===1;
      const availableEngravings = [...engraving.options].map(option => option.value);
      $('[data-engraving-help]').hidden = !(availableEngravings.some(value => value.startsWith('2D')) && availableEngravings.some(value => value.startsWith('3D')));
      [...engraving.options].forEach(option=>option.textContent=root.dataset.chooseEngraving+' '+option.value);
      variant=product.variants.filter(v=>v.options[0]===size.value&&v.options[1]===engraving.value).sort((a,b)=>a.price-b.price)[0];updateTotal();
      $('[data-variant]').value=variant?.id||'';
      $('[data-price]').textContent=variant?money(variant.price):t.js_3;
      $('[data-compare]').textContent=variant?.compare_at_price>variant?.price?money(variant.compare_at_price):'';
      $('[data-type-note]').textContent=engraving.value.startsWith('3D')?t.js_4:t.js_5;
      $('[data-size-info]').textContent=row.dimensionText+t.js_21+row.inches+t.js_22;
      const validRows=model.rows.filter(r=>!r.uncertain&&r.width>0&&r.height>0);
      layout.sx=row.uncertain?1:row.width/Math.max(...validRows.map(r=>r.width),row.width);layout.sy=row.uncertain?1:row.height/Math.max(...validRows.map(r=>r.height),row.height);
      $('[data-current-size]').textContent=row.dimensionText;
      dirty();draw();if(keepSaved&&image&&!processing){designSaved=true;savePreview(false);}
    }
    const glassPath=new Path2D(mockup.path),textPath=new Path2D(mockup.textPath);
    function prepareCrystal(){
      const mask=document.createElement('canvas');mask.width=mask.height=1254;const mc=mask.getContext('2d');mc.fillStyle='#fff';mc.strokeStyle='#fff';mc.lineJoin='round';
      const[x,y,w,h]=mockup.bounds;
      if(['square-cube','rectangle-cube','thick-rectangle'].includes(model.key)){mc.fillRect(x-45,y-65,w+140,h+115);}else{mc.fill(glassPath);mc.lineWidth=75;mc.stroke(glassPath);mc.save();mc.filter='blur(16px)';mc.fillRect(x-40,y+h-15,w+80,200);mc.restore();}
      crystalLayer=document.createElement('canvas');crystalLayer.width=crystalLayer.height=1254;const lc=crystalLayer.getContext('2d');lc.drawImage(blank,0,0,1254,1254);lc.globalCompositeOperation='destination-in';lc.drawImage(mask,0,0);lc.globalCompositeOperation='source-over';
    }
    function draw(){
      ctx.clearRect(0,0,1254,1254);$('[data-processing]').hidden=!processing;canvas.setAttribute('aria-busy',String(processing));
      if(!blankReady){ctx.fillStyle='#e5e0da';ctx.fillRect(0,0,1254,1254);return;}
      if(layout.sx===1&&layout.sy===1)ctx.drawImage(blank,0,0,1254,1254);else ctx.drawImage(blank,0,0,65,1254,0,0,1254,1254);
      ctx.save();ctx.translate(layout.anchor[0],layout.anchor[1]);ctx.scale(layout.sx,layout.sy);ctx.translate(-layout.anchor[0],-layout.anchor[1]);
      ctx.drawImage(crystalLayer||blank,0,0,1254,1254);
      if(image){
        const scale=Math.min(mockup.fit[0]/image.width,mockup.fit[1]/image.height)*crop.zoom,w=image.width*scale,h=image.height*scale;
        ctx.save();ctx.clip(glassPath);ctx.globalCompositeOperation='screen';ctx.globalAlpha=1;ctx.drawImage(image,crop.x-w/2,crop.y-h/2,w,h);ctx.restore();
      }
      const lines=isKeychain?[]:message.value.split('\n').slice(0,2);let fs=mockup.text[3];ctx.font=fs+'px '+font.value;while(fs>16&&lines.some(l=>ctx.measureText(l).width>mockup.text[2])){fs--;ctx.font=fs+'px '+font.value;}
      textBox={w:Math.max(70,...lines.map(l=>ctx.measureText(l).width))+24,h:lines.length*(fs+3)+20};
      ctx.save();ctx.clip(glassPath);ctx.translate(textTransform.x,textTransform.y);ctx.rotate(textTransform.rotation);ctx.scale(textTransform.scale,textTransform.scale);ctx.fillStyle='rgba(245,247,247,.88)';ctx.textAlign='center';ctx.textBaseline='middle';lines.forEach((line,i)=>ctx.fillText(line,0,(i-(lines.length-1)/2)*(fs+3)));ctx.restore();
      ctx.restore();liveCtx.clearRect(0,0,1254,1254);liveCtx.drawImage(canvas,0,0);live.hidden=!designSaved;$('.cwcr-hero').hidden=designSaved;$('[data-dimensions]').style.display=designSaved?'':'none';dimensions();drawTextControls();
      if(image){$('[data-saved]').hidden=true;}
      const ux=layout.anchor[0]+(mockup.center[0]-layout.anchor[0])*layout.sx,uy=layout.anchor[1]+(mockup.center[1]-layout.anchor[1])*layout.sy;centerUpload.style.left=(ux/1254*100)+'%';centerUpload.style.top=(uy/1254*100)+'%';
      $('[data-center-upload]').hidden=!!image||processing;$('[data-change-photo]').hidden=isKeychain?!photoFile:!designSaved;$('[data-upload-button]').textContent=photoFile?ht.change_photo:ht.upload_first_button;
      $('[data-upload-button]').disabled=processing;$('[data-change-photo]').disabled=processing;
    }
    let worker=null,requestId=0;const jobs=new Map();
    function getMask(working,version){
      if(!worker){worker=new Worker(root.dataset.worker);worker.onmessage=event=>{if(event.data.stage){const activeJob=jobs.get(event.data.id);if(processing&&activeJob?.version===imageVersion)processingLabel(event.data.stage);return;}const job=jobs.get(event.data.id);if(!job)return;clearTimeout(job.timer);jobs.delete(event.data.id);event.data.error?job.reject(new Error(event.data.error)):job.resolve(event.data);};worker.onerror=()=>{for(const job of jobs.values()){clearTimeout(job.timer);job.reject(new Error('Background worker unavailable'));}jobs.clear();worker.terminate();worker=null;};}
      const scale=Math.min(1,1600/Math.max(working.width,working.height)),input=document.createElement('canvas');input.width=Math.round(working.width*scale);input.height=Math.round(working.height*scale);const c=input.getContext('2d');c.drawImage(working,0,0,input.width,input.height);const rgba=c.getImageData(0,0,input.width,input.height).data;
      return new Promise((resolve,reject)=>{const id=++requestId,timer=setTimeout(()=>{jobs.delete(id);reject(new Error('Background processing timed out'));},180000);jobs.set(id,{resolve,reject,timer,version});worker.postMessage({id,width:input.width,height:input.height,rgba:rgba.buffer},[rgba.buffer]);});
    }
    async function removeBackground(source,version){
      const scale=Math.min(1,1600/Math.max(source.width,source.height));
      const working=document.createElement('canvas');working.width=Math.round(source.width*scale);working.height=Math.round(source.height*scale);const c=working.getContext('2d',{willReadFrequently:true});c.drawImage(source,0,0,working.width,working.height);
      const unmasked=document.createElement('canvas');unmasked.width=working.width;unmasked.height=working.height;unmasked.getContext('2d').drawImage(working,0,0);
      const result=await getMask(working,version);if(version!==imageVersion)throw new DOMException('Photo changed','AbortError');const values=new Uint8Array(result.mask);
      const maskCanvas=document.createElement('canvas');maskCanvas.width=result.width;maskCanvas.height=result.height;const mc=maskCanvas.getContext('2d'),md=mc.createImageData(result.width,result.height);
      for(let i=0;i<values.length;i++){md.data[i*4]=255;md.data[i*4+1]=255;md.data[i*4+2]=255;const a=Math.max(0,Math.min(1,(values[i]/255-.008)/.98));md.data[i*4+3]=Math.round(Math.pow(a,.85)*255);}mc.putImageData(md,0,0);
      c.globalCompositeOperation='destination-in';c.drawImage(maskCanvas,0,0,working.width,working.height);c.globalCompositeOperation='source-over';
      const data=c.getImageData(0,0,working.width,working.height),d=data.data;let minX=working.width,minY=working.height,maxX=0,maxY=0,count=0;
      for(let y=0;y<working.height;y++)for(let x=0;x<working.width;x++){if(d[(y*working.width+x)*4+3]>24){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}}
      if(count<working.width*working.height*.015)throw new Error(ht.no_person);
      const padding=12;minX=Math.max(0,minX-padding);minY=Math.max(0,minY-padding);maxX=Math.min(working.width-1,maxX+padding);maxY=Math.min(working.height-1,maxY+padding);processingLabel('finishing');
      const cut=document.createElement('canvas');cut.width=maxX-minX+1;cut.height=maxY-minY+1;const cc=cut.getContext('2d',{willReadFrequently:true});cc.drawImage(working,minX,minY,cut.width,cut.height,0,0,cut.width,cut.height);
      const transparentBlob=await new Promise(resolve=>cut.toBlob(resolve,'image/png'));
      const sourceCut=document.createElement('canvas');sourceCut.width=cut.width;sourceCut.height=cut.height;sourceCut.getContext('2d').drawImage(unmasked,minX,minY,cut.width,cut.height,0,0,cut.width,cut.height);
      const editableCutout=document.createElement('canvas');editableCutout.width=cut.width;editableCutout.height=cut.height;editableCutout.getContext('2d').drawImage(cut,0,0);
      const photo=cc.getImageData(0,0,cut.width,cut.height),pd=photo.data;
      for(let i=0;i<pd.length;i+=4){const light=(.2126*pd[i]+.7152*pd[i+1]+.0722*pd[i+2])/255;const tone=Math.max(0,Math.min(1,(light-.12)*1.65));const grain=.98+((i*13%101)/100)*.02;pd[i+3]=Math.round(pd[i+3]*Math.pow(tone,.8)*grain);pd[i]=mockup.tint[0];pd[i+1]=mockup.tint[1];pd[i+2]=mockup.tint[2];}
      cc.putImageData(photo,0,0);return{engraved:cut,transparentBlob,sourceCut,editableCutout};
    }
    function drawTextControls(){
      textOverlay.replaceChildren();const hideControls=isKeychain||!textSelected||!message.value.trim();textOverlay.toggleAttribute('hidden',hideControls);
      if(hideControls)return;
      const ns='http://www.w3.org/2000/svg',g=document.createElementNS(ns,'g');g.setAttribute('transform','translate('+layout.anchor.join(' ')+') scale('+layout.sx+' '+layout.sy+') translate('+layout.anchor.map(n=>-n).join(' ')+') translate('+textTransform.x+' '+textTransform.y+') rotate('+(textTransform.rotation*180/Math.PI)+') scale('+textTransform.scale+')');textOverlay.append(g);
      const el=(tag,attrs)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));g.append(n);};const w=textBox.w/2,h=textBox.h/2,sw=3/textTransform.scale;
      el('rect',{x:-w,y:-h,width:w*2,height:h*2,fill:'none',stroke:'#1680e8','stroke-width':sw});el('line',{x1:0,y1:-h,x2:0,y2:-h-58/textTransform.scale,stroke:'#1680e8','stroke-width':sw});
      const r=13/textTransform.scale;for(const [x,y] of [[-w,-h],[w,-h],[-w,h],[w,h],[0,-h-58/textTransform.scale]])el('circle',{cx:x,cy:y,r,fill:'#fff',stroke:'#1680e8','stroke-width':sw});
    }
    function textLocal(p){const dx=p.x-textTransform.x,dy=p.y-textTransform.y,c=Math.cos(textTransform.rotation),sn=Math.sin(textTransform.rotation);return{x:(dx*c+dy*sn)/textTransform.scale,y:(-dx*sn+dy*c)/textTransform.scale};}
    function textHit(p){if(isKeychain||!message.value.trim())return null;const q=textLocal(p),w=textBox.w/2,h=textBox.h/2,tolerance=32/textTransform.scale/Math.min(layout.sx,layout.sy);if(textSelected){if(Math.hypot(q.x,q.y+h+58/textTransform.scale)<tolerance)return 'rotate';for(const [x,y] of [[-w,-h],[w,-h],[-w,h],[w,h]])if(Math.hypot(q.x-x,q.y-y)<tolerance)return 'scale';}return Math.abs(q.x)<w&&Math.abs(q.y)<h?'move':null;}
    function constrainText(){const[x,y,w,h]=mockup.textBounds||mockup.bounds;textTransform.x=Math.max(x,Math.min(x+w,textTransform.x));textTransform.y=Math.max(y,Math.min(y+h,textTransform.y));textTransform.scale=Math.max(.35,Math.min(4,textTransform.scale));}
    function dimensions(){
      if(!row)return;
      const ns='http://www.w3.org/2000/svg',svg=$('[data-dimensions]');svg.replaceChildren();
      const make=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text)e.textContent=text;svg.append(e);return e;};
      if(row.uncertain){make('text',{x:627,y:1190,'text-anchor':'middle',fill:'#242424','font-size':30},row.dimensionText);return;}
      const [x,y,w,h]=mockup.bounds,a=layout.anchor,sx=layout.sx,sy=layout.sy,left=a[0]+(x-a[0])*sx,right=left+w*sx,top=a[1]+(y-a[1])*sy,bottom=top+h*sy;
      const arrow=(x1,y1,x2,y2)=>{make('line',{x1,y1,x2,y2,stroke:'#b84b0b','stroke-width':4});const angle=Math.atan2(y2-y1,x2-x1);for(const [px,py,dir] of [[x1,y1,1],[x2,y2,-1]]){for(const off of [-.5,.5])make('line',{x1:px,y1:py,x2:px+dir*18*Math.cos(angle+off),y2:py+dir*18*Math.sin(angle+off),stroke:'#b84b0b','stroke-width':4});}};
      const yy=Math.min(1135,bottom+85),xx=Math.max(90,left-90);arrow(left,yy,right,yy);arrow(xx,top,xx,bottom);
      const text=(x,y,value)=>make('text',{x,y,'text-anchor':'middle',fill:'#222','font-size':30,stroke:'#fff','stroke-width':7,'paint-order':'stroke','font-family':'Arial'},value);
      text((left+right)/2,yy+42,t.js_18+row.width+' cm');const ht=text(xx-35,(top+bottom)/2,t.js_19+row.height+' cm');ht.setAttribute('transform','rotate(-90 '+(xx-35)+' '+((top+bottom)/2)+')');text(627,1220,t.js_20+row.depth+' cm');
    }
    let selectedBase=null;
    function updateTotal(){if(variant)$('[data-total]').textContent=money(variant.price+(selectedBase?.price||0)*100);}
    $('[data-engraving-help]').addEventListener('click',()=>$('[data-engraving-dialog]').showModal());$('[data-engraving-close]').addEventListener('click',()=>$('[data-engraving-dialog]').close());
    [message,font].forEach(el=>el.addEventListener('input',()=>{textSelected=!!message.value.trim();dirty();draw();}));
    size.addEventListener('change',selected);engraving.addEventListener('change',selected);
    $('[data-open]').addEventListener('click',()=>editor.showModal());$('[data-close]').addEventListener('click',()=>editor.close());
    $('[data-upload-button]').addEventListener('click',()=>upload.click());
    $('[data-change-photo]').addEventListener('click',()=>{editor.showModal();if(isKeychain)upload.click();});
    $('[data-center-upload]').addEventListener('click',()=>upload.click());
    function positionPhoto(){crop={x:mockup.center[0],y:mockup.center[1]-(message.value.trim()&&model.key!=='two-heart'?mockup.bounds[3]*.055:0),zoom:1};dirty();draw();}
    $('[data-reset]').addEventListener('click',()=>{
      imageVersion++;previewGeneration++;processing=false;image=null;photoFile=null;cutoutBlob=null;editSource=null;editCutout=null;editCutoutButton.hidden=true;previewBlob=null;upload.value='';message.value='';font.selectedIndex=0;
      if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
      $('[data-saved]').removeAttribute('src');$('[data-photo-name]').textContent='';editorStatus.textContent='';
      textTransform={x:mockup.text[0],y:mockup.text[1],scale:1,rotation:0};textSelected=false;textGesture=null;gesture=null;pointers.clear();
      crop={x:mockup.center[0],y:mockup.center[1],zoom:1};dirty();draw();
    });
    upload.addEventListener('change',async()=>{
      const file=upload.files?.[0];if(!file)return;
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024){editorStatus.textContent=t.js_10;upload.value='';return;}
      const token=++imageVersion;processing=true;image=null;cutoutBlob=null;editSource=null;editCutout=null;editCutoutButton.hidden=true;photoFile=null;dirty();draw();processingLabel('preparing');
      const url=URL.createObjectURL(file);
      try{const candidate=new Image();candidate.src=url;await candidate.decode();if(token!==imageVersion)return;const processed=await removeBackground(candidate,token);if(token!==imageVersion)return;
        photoFile=file;$('[data-photo-name]').textContent=file.name;image=processed.engraved;cutoutBlob=processed.transparentBlob;editSource=processed.sourceCut;editCutout=processed.editableCutout;editCutoutButton.hidden=false;processing=false;positionPhoto();editorStatus.textContent=ht.ready;
      }catch(error){console.error('Crystal background removal:',error);if(token===imageVersion){processing=false;editorStatus.textContent=error.message===ht.no_person?ht.no_person:ht.failed;save.disabled=true;draw();}}
      finally{URL.revokeObjectURL(url);upload.value='';}
    });
    function engraveEditedCutout(edited){
      const result=document.createElement('canvas');result.width=edited.width;result.height=edited.height;
      const c=result.getContext('2d',{willReadFrequently:true});c.drawImage(edited,0,0);
      const photo=c.getImageData(0,0,result.width,result.height),pd=photo.data;
      for(let i=0;i<pd.length;i+=4){
        const light=(.2126*pd[i]+.7152*pd[i+1]+.0722*pd[i+2])/255;
        const tone=Math.max(0,Math.min(1,(light-.12)*1.65));
        const grain=.98+((i*13%101)/100)*.02;
        pd[i+3]=Math.round(pd[i+3]*Math.pow(tone,.8)*grain);
        pd[i]=mockup.tint[0];pd[i+1]=mockup.tint[1];pd[i+2]=mockup.tint[2];
      }
      c.putImageData(photo,0,0);return result;
    }
    editCutoutButton.addEventListener('click',()=>{
      if(!editSource||!editCutout||processing)return;
      if(!window.CartwalaCutoutEditor){editorStatus.textContent='Photo editor is loading. Please try again.';return;}
      try{
        window.CartwalaCutoutEditor.open({source:editSource,cutout:editCutout,onSave:async edited=>{
          const blob=await new Promise(resolve=>edited.toBlob(resolve,'image/png'));
          if(!blob)throw Error('Could not save edited cutout.');
          editCutout=edited;cutoutBlob=blob;image=engraveEditedCutout(edited);
          dirty();draw();editorStatus.textContent='Background edits saved. Review the crystal preview, then select Save to finish.';
        }});
      }catch(error){editorStatus.textContent=error.message||'Could not open photo editor.';}
    });
    const pointers=new Map();let gesture=null;
    const point=e=>{const r=canvas.getBoundingClientRect();return{x:layout.anchor[0]+((e.clientX-r.left)*1254/r.width-layout.anchor[0])/layout.sx,y:layout.anchor[1]+((e.clientY-r.top)*1254/r.height-layout.anchor[1])/layout.sy};};
    function beginGesture(){const p=[...pointers.values()];if(p.length>=2)gesture={type:'pinch',center:{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2},distance:Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)),crop:{...crop}};else if(p.length===1)gesture={type:'drag',point:p[0],crop:{...crop}};else gesture=null;}
    function constrain(){crop.zoom=Math.max(.45,Math.min(12,crop.zoom));if(!image)return;const[x,y,w,h]=mockup.bounds,scale=Math.min(mockup.fit[0]/image.width,mockup.fit[1]/image.height)*crop.zoom,halfW=image.width*scale/2,halfH=image.height*scale/2,overlapX=Math.min(w,halfW*2)*.1,overlapY=Math.min(h,halfH*2)*.1;crop.x=Math.max(x-halfW+overlapX,Math.min(x+w+halfW-overlapX,crop.x));crop.y=Math.max(y-halfH+overlapY,Math.min(y+h+halfH-overlapY,crop.y));}
    canvas.addEventListener('pointerdown',e=>{
      if(processing)return;const p=point(e),hit=textHit(p);if(!image&&!hit)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);
      if(pointers.size?!!textGesture:!!hit){textSelected=true;pointers.set(e.pointerId,p);const all=[...pointers.values()];if(all.length>=2){textGesture={type:'pinch',start:{...textTransform},distance:Math.max(1,Math.hypot(all[0].x-all[1].x,all[0].y-all[1].y)),angle:Math.atan2(all[1].y-all[0].y,all[1].x-all[0].x),center:{x:(all[0].x+all[1].x)/2,y:(all[0].y+all[1].y)/2}};}else{textGesture={type:hit||'move',point:p,start:{...textTransform},distance:Math.max(1,Math.hypot(p.x-textTransform.x,p.y-textTransform.y)),angle:Math.atan2(p.y-textTransform.y,p.x-textTransform.x)};}gesture=null;
      }else{textSelected=false;textGesture=null;pointers.set(e.pointerId,p);beginGesture();}draw();
    });
    canvas.addEventListener('pointermove',e=>{
      if(!pointers.has(e.pointerId))return;const current=point(e);pointers.set(e.pointerId,current);const p=[...pointers.values()];
      if(textGesture){const g=textGesture;if(g.type==='pinch'&&p.length>=2){const center={x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2};textTransform={x:g.start.x+center.x-g.center.x,y:g.start.y+center.y-g.center.y,scale:g.start.scale*Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)/g.distance,rotation:g.start.rotation+Math.atan2(p[1].y-p[0].y,p[1].x-p[0].x)-g.angle};}else if(g.type==='rotate'){textTransform.rotation=g.start.rotation+Math.atan2(current.y-g.start.y,current.x-g.start.x)-g.angle;}else if(g.type==='scale'){textTransform.scale=g.start.scale*Math.hypot(current.x-g.start.x,current.y-g.start.y)/g.distance;}else{textTransform.x=g.start.x+current.x-g.point.x;textTransform.y=g.start.y+current.y-g.point.y;}constrainText();dirty();draw();return;}
      if(!gesture)return;if(gesture.type==='pinch'&&p.length>=2){const center={x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2},zoom=Math.max(.45,Math.min(12,gesture.crop.zoom*Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)/gesture.distance)),ratio=zoom/gesture.crop.zoom;crop={zoom,x:center.x+(gesture.crop.x-gesture.center.x)*ratio,y:center.y+(gesture.crop.y-gesture.center.y)*ratio};}else{crop.x=gesture.crop.x+p[0].x-gesture.point.x;crop.y=gesture.crop.y+p[0].y-gesture.point.y;}constrain();dirty();draw();
    });
    const end=e=>{pointers.delete(e.pointerId);if(textGesture){textGesture=null;pointers.clear();gesture=null;}else beginGesture();};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    canvas.addEventListener('wheel',e=>{if(processing)return;const target=textHit(point(e));textSelected=!!target;if(target){e.preventDefault();textTransform.scale*=Math.exp(-e.deltaY*.0015);constrainText();dirty();draw();return;}if(!image)return;e.preventDefault();const p=point(e),zoom=Math.max(.45,Math.min(12,crop.zoom*Math.exp(-e.deltaY*.0015))),ratio=zoom/crop.zoom;crop={zoom,x:p.x+(crop.x-p.x)*ratio,y:p.y+(crop.y-p.y)*ratio};constrain();dirty();draw();},{passive:false});
    canvas.addEventListener('keydown',e=>{if(!image&&!textSelected)return;const step=e.shiftKey?20:5;if(textSelected){if(e.key==='ArrowLeft')textTransform.x-=step;else if(e.key==='ArrowRight')textTransform.x+=step;else if(e.key==='ArrowUp')textTransform.y-=step;else if(e.key==='ArrowDown')textTransform.y+=step;else if(e.key==='+'||e.key==='=')textTransform.scale*=1.05;else if(e.key==='-')textTransform.scale/=1.05;else if(e.key==='[')textTransform.rotation-=Math.PI/36;else if(e.key===']')textTransform.rotation+=Math.PI/36;else return;constrainText();}else{if(e.key==='ArrowLeft')crop.x-=step;else if(e.key==='ArrowRight')crop.x+=step;else if(e.key==='ArrowUp')crop.y-=step;else if(e.key==='ArrowDown')crop.y+=step;else if(e.key==='+'||e.key==='=')crop.zoom*=1.05;else if(e.key==='-')crop.zoom/=1.05;else return;constrain();}e.preventDefault();dirty();draw();});
    function savePreview(closeEditor){
      if(!image||processing||!blankReady)return;designSaved=true;draw();save.disabled=true;const savedRevision=revision,generation=++previewGeneration;
      canvas.toBlob(blob=>{if(savedRevision!==revision||generation!==previewGeneration){save.disabled=!image||processing||!blankReady;return;}if(!blob){editorStatus.textContent=t.js_13;save.disabled=false;return;}previewBlob=blob;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(blob);$('[data-saved]').src=previewUrl;live.hidden=false;$('[data-saved]').hidden=true;$('.cwcr-hero').hidden=true;add.disabled=!variant?.available;status.textContent=ht.saved;save.disabled=false;if(closeEditor)editor.close();},'image/png');
    }
    save.addEventListener('click',()=>savePreview(true));
    let uploadedPrint=null;
    async function crystalPrintProperties(){
      const key=revision+':'+variant.id;
      if(uploadedPrint?.key===key)return uploadedPrint.properties;
      if(!photoFile||!cutoutBlob||!previewBlob||processing||!designSaved||row.uncertain)throw new Error('Save your crystal photo before adding to cart.');
      const uploadAsset=async(file)=>{const body=new FormData();body.set('intent','personalizer_upload');body.set('file',file);const r=await fetch('/apps/cartwala-signature-day',{method:'POST',body});const result=await r.json();if(!r.ok||!/^https:\/\//.test(result.url||''))throw new Error(result.error||'Crystal photo could not be saved. Please retry.');return result.url;};
      const original=await uploadAsset(photoFile),cutout=await uploadAsset(new File([cutoutBlob],'crystal-cutout.png',{type:'image/png'})),preview=await uploadAsset(new File([previewBlob],'crystal-preview.png',{type:'image/png'}));
      if(key!==revision+':'+variant.id)throw new Error('The design changed while saving. Please save and try again.');
      const spec={version:1,widthCm:row.width,heightCm:row.height,bounds:mockup.bounds,path:mockup.path,fit:mockup.fit,crop:{...crop},text:mockup.text,textTransform:{...textTransform},message:isKeychain?'':message.value.split('\n').slice(0,2).join('\n'),font:font.value};
      const properties={'Original photo':original,'_Background removed photo':cutout,'_Personalised Preview':preview,'_Cartwala Crystal':'true','_Crystal Print JSON':JSON.stringify(spec)};
      uploadedPrint={key,properties};return properties;
    }
    $('[data-order]').addEventListener('submit',async event=>{event.preventDefault();event.stopImmediatePropagation();if(busy)return;if(!photoFile||!previewBlob||!variant){editor.showModal();return;}busy=true;add.disabled=true;status.textContent=t.js_15;try{const data=new FormData(event.currentTarget);data.set('id',variant.id);data.set('properties[Original photo]',photoFile,photoFile.name);data.set('properties[_Personalised Preview]',new File([previewBlob],'crystal-preview.png',{type:'image/png'}));if(cutoutBlob)data.set('properties[_Background removed photo]',new File([cutoutBlob],'crystal-cutout.png',{type:'image/png'}));if(!isKeychain){data.set('properties[Message]',message.value.split('\n').slice(0,2).join('\n'));data.set('properties[Font]',font.value);}data.set('properties[Crystal size]',row.dimensionText);data.set('properties[Engraving]',engraving.value);data.set('properties[Faces]','All faces included — no additional charge');if(selectedBase)data.set('properties[Light base]',selectedBase.title);data.set('properties[_Crystal crop]',JSON.stringify({model:model.key,...crop,sourceWidth:image.width,sourceHeight:image.height,preview:'crystal-realistic-v4',sizeTransform:layout,backgroundRemoved:true,backgroundModel:'modnet-soft-alpha',mockup:mockup.blank,photoMask:mockup.path,textPosition:mockup.text,textTransform:{...textTransform},toneVersion:'approved-clarity-v1',canvasSize:1254}));const printProperties=await crystalPrintProperties();for(const [key,value] of Object.entries(printProperties))data.set('properties['+key+']',value);if(selectedBase){data.set('items[0][id]',variant.id);data.set('items[0][quantity]',data.get('quantity'));for(const [key,value] of [...data.entries()])if(key.startsWith('properties[')){data.delete(key);data.set('items[0]['+key+']',value);}data.delete('id');data.delete('quantity');data.set('items[1][id]',selectedBase.variant.split('/').pop());data.set('items[1][quantity]',event.currentTarget.elements.quantity.value);}const response=await fetch((window.Shopify?.routes?.root||'/')+'cart/add.js',{method:'POST',headers:{Accept:'application/json'},body:data});const result=await response.json();if(!response.ok)throw new Error(result.description||t.js_16);status.textContent=t.js_17;window.location.assign((window.Shopify?.routes?.root||'/')+'cart');}catch(error){status.textContent=error.message;status.dataset.error='true';}finally{busy=false;add.disabled=false;}});
    try{const response=await fetch(root.dataset.bases),bases=await response.json();const holder=$('[data-base-options]');
      bases.forEach(b=>{const label=document.createElement('label');label.className='cwcr-base-card';const choice=document.createElement('input');choice.type='checkbox';choice.name='light-base-'+product.id;choice.checked=false;
        choice.addEventListener('change',()=>{selectedBase=choice.checked?b:null;holder.querySelectorAll('input').forEach(input=>{if(input!==choice)input.checked=false;});updateTotal();});label.append(choice);
        const img=document.createElement('img');img.src=b.image;img.alt=b.title+' with light on';img.width=400;img.height=400;img.loading='lazy';img.decoding='async';label.append(img);const span=document.createElement('span');span.textContent=b.title+' + '+money(b.price*100);label.append(span);holder.append(label);
      });
    }catch(error){status.textContent=t.js_0;}
    selected();
  }
  document.querySelectorAll('[data-heart-root]').forEach(init);
  document.addEventListener('shopify:section:load',event=>event.target.querySelectorAll('[data-heart-root]').forEach(init));
})();

