(() => {
 const initialize=()=>document.querySelectorAll('[data-cw-product-group]').forEach(panel=>{
  if(panel.dataset.ready)return;panel.dataset.ready='true';let config,variants,names;
  try{config=JSON.parse(panel.dataset.config||'{}');variants=JSON.parse(panel.dataset.variants||'[]');names=JSON.parse(panel.dataset.options||'[]');}catch{return;}
  if(!config.groupId)return;
  const liveAcrylic=panel.dataset.productId==='15402886135993'&&config.customization==='plain'&&!!panel.dataset.acrylicLiveRoom;
  if(liveAcrylic){
   const option=(v,name)=>{const i=names.findIndex(n=>n.toLowerCase()===name.toLowerCase());return v.options?.[i]||v[`option${i+1}`]||'';};
   const previews={};
   for(const v of variants){
    const dimensions=option(v,'Size').match(/^(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/i);if(!dimensions)continue;
    const a=Number(dimensions[1]),b=Number(dimensions[2]);if(!(a>0&&b>0))continue;
    const direction=config.fixedDirection||option(v,config.orientationOption||'Orientation')||'Portrait';
    previews[String(v.id)]={background:panel.dataset.acrylicLiveRoom,image:v.featured_image?.src||'',overlay:'',x:50,y:34,width:0,height:0,widthInches:direction==='Landscape'?Math.max(a,b):Math.min(a,b),heightInches:direction==='Landscape'?Math.min(a,b):Math.max(a,b),direction,studs:/^5\s*mm\b/i.test(option(v,'Thickness')||option(v,'Acrylic'))};
   }
   config={...config,previewMode:'automatic',previews};panel.dataset.config=JSON.stringify(config);
  }
  const root=document.querySelector(`[data-cw-personalizer][data-product-id="${panel.dataset.productId}"]`);
  const gallery=document.querySelector('[data-gallery-main]')||document.querySelector('.product__media-list .product__media-item')||document.querySelector('.product__media');
  if(!gallery)return;
  const original=gallery.querySelector('img');let selected=variants.find(v=>String(v.id)===new URLSearchParams(location.search).get('variant'))||variants.find(v=>String(v.id)===panel.dataset.variant)||variants[0];if(!selected)return;selected=variants.find(v=>v.id===selected.id&&config.previews?.[String(v.id)])||variants.find(v=>config.previews?.[String(v.id)]);if(!selected)return;panel.dataset.variant=String(selected.id);
  const preview=document.createElement('div');preview.className='cw-group-preview';preview.hidden=true;if(liveAcrylic)preview.classList.add('cw-group-preview--acrylic-live');
  preview.innerHTML='<div class="cw-group-stage"><div class="cw-group-background"></div><div class="cw-group-photo"><img alt="Your customized product"><span class="cw-group-studs"></span></div><img class="cw-group-overlay" alt=""><span class="cw-group-height"></span><span class="cw-group-width"></span></div>';
  gallery.classList.add('cw-group-gallery');gallery.append(preview);let artwork='',customer=false;
  const stage=preview.querySelector('.cw-group-stage');
  const fitStage=(t)=>{if(!stage)return;const box=gallery.getBoundingClientRect(),aspect=config.previewMode==='png'?(t.mockupAspect||1):(box.width/box.height||1);const w=Math.min(box.width,box.height*aspect);Object.assign(stage.style,{width:`${w}px`,height:`${w/aspect}px`,left:'50%',top:'50%',transform:'translate(-50%,-50%)'});};
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{const t=config.previews?.[String(selected.id)];if(t)fitStage(t);}).observe(gallery);
  const productForms=()=>Array.from(document.querySelectorAll('form[action*="/cart/add"]')).filter(form=>variants.some(v=>String(v.id)===form.querySelector('[name="id"]')?.value));
  const printProperties=(t)=>productForms().forEach(form=>{for(const [name,value] of Object.entries({'_Cartwala Print Width':t.widthInches,'_Cartwala Print Height':t.heightInches,'_Cartwala Print DPI':300})){let input=form.querySelector(`input[name="properties[${name}]"]`);if(!input){input=document.createElement('input');input.type='hidden';input.name=`properties[${name}]`;form.appendChild(input);}input.value=String(value);}});
  const show=(visible)=>{preview.hidden=!visible;original?.classList.toggle('cw-group-original-hidden',visible);};
  const render=()=>{
   const t=config.previews?.[String(selected.id)];if(!t){show(false);return;}panel.dataset.variant=String(selected.id);fitStage(t);printProperties(t);
   const photo=preview.querySelector('.cw-group-photo'),img=photo.querySelector('img'),overlay=preview.querySelector('.cw-group-overlay');
   if(!customer){artwork=config.previewMode==='png'?(panel.dataset.artwork||''):config.customization==='design'?(panel.dataset.artwork||t.image||''):t.image||'';}
   const png=config.previewMode==='png',bg=png?'':t.background||'';preview.classList.toggle('cw-group-preview--png',png);
   preview.querySelector('.cw-group-background').style.backgroundImage=bg?`url("${bg}")`:'none';
   overlay.hidden=!(png?t.mockup:t.overlay);overlay.src=(png?t.mockup:t.overlay)||'';
   let x=t.x,y=t.y,w=t.width,h=t.height;
   if(config.previewMode==='automatic'){x=50;y=34;w=t.widthInches/60*78;h=t.heightInches/60*78;}
   Object.assign(photo.style,{left:`${x}%`,top:`${y}%`,width:`${w}%`,height:`${h}%`});
   photo.classList.toggle('cw-group-photo--studs',!png&&!!t.studs);photo.style.setProperty('--cw-group-stud',`url("${panel.dataset.stud}")`);photo.style.setProperty('--cw-group-stud-size',`${Math.max(4,Math.min(12,Math.round(Math.min(t.widthInches,t.heightInches)/2)))}px`);
   const height=preview.querySelector('.cw-group-height'),width=preview.querySelector('.cw-group-width');height.textContent=`${t.heightInches}″ height`;width.textContent=`← ${t.widthInches}″ width →`;
   Object.assign(height.style,{left:`${x}%`,top:`${Math.max(0,y-h/2-5)}%`});Object.assign(width.style,{left:`${x}%`,top:`${Math.min(95,y+h/2+2)}%`});
   // A finished product image is displayed directly before customization; artwork
   // after upload is rendered inside the selected room template.
   const completeImage=!png&&!customer&&config.customization!=='design'&&!!t.image;
   if(completeImage){img.src=t.image;Object.assign(photo.style,{left:'50%',top:'50%',width:'100%',height:'100%'});photo.classList.remove('cw-group-photo--studs');overlay.hidden=true;height.hidden=true;width.hidden=true;}
   else{img.src=artwork;height.hidden=png;width.hidden=png;}
   show((!liveAcrylic||customer)&&!!artwork&&config.previewMode!=='off'&&(!png||!!t.mockup));
   if(customer&&(config.previewMode==='off'||(png&&!t.mockup))&&original)original.src=artwork;
   if(root&&config.customization==='plain')root.dispatchEvent(new CustomEvent('cw:acrylic-selection',{detail:{ratio:`${Math.round(t.widthInches*100)}:${Math.round(t.heightInches*100)}`,variantId:String(selected.id)}}));
  };
  const choose=(v)=>{if(!v||!config.previews?.[String(v.id)]||v.id===selected.id)return;selected=v;productForms().forEach(form=>{form.querySelector('[name="id"]').value=String(v.id);});render();};
  (root||document).addEventListener('cartwala:preview-ready',event=>{if(root&&event.target!==root)return;if(!event.detail?.url)return;artwork=event.detail.url;customer=true;render();});
  document.addEventListener('change',event=>{
   const target=event.target;if(!(target instanceof HTMLElement))return;
   if(target.getAttribute('name')==='id')choose(variants.find(v=>String(v.id)===target.value));
   else if(/^option[1-3]$/.test(target.getAttribute('name')||'')){
    const values=names.map((_,i)=>document.querySelector(`input[name="option${i+1}"]:checked`)?.value||document.querySelector(`select[name="option${i+1}"]`)?.value||selected.options?.[i]||selected[`option${i+1}`]);
    choose(variants.find(v=>values.every((value,i)=>(v.options?.[i]||v[`option${i+1}`])===value)));
   }
  });
  if(config.fixedDirection){
   const index=names.indexOf(config.orientationOption);if(index>=0){
    document.querySelectorAll(`input[name="option${index+1}"]`).forEach(input=>{input.checked=input.value===config.fixedDirection;const label=input.closest('label')||document.querySelector(`label[for="${input.id}"]`);if(label)label.hidden=true;const field=input.closest('fieldset');if(field&&Array.from(field.querySelectorAll('input')).every(i=>i.name===input.name))field.hidden=true;});
    document.querySelectorAll(`select[name="option${index+1}"]`).forEach(input=>{input.value=config.fixedDirection;input.hidden=true;});
   }
   productForms().forEach(form=>{const input=form.querySelector('[name="id"]');if(input.value!==String(selected.id)){input.value=String(selected.id);input.dispatchEvent(new Event('change',{bubbles:true}));}});
  }
  render();
 });
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();document.addEventListener('shopify:section:load',initialize);
})();
