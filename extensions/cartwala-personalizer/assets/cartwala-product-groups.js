(() => {
 const initialize=()=>document.querySelectorAll('[data-cw-product-group]').forEach(panel=>{
  if(panel.dataset.ready)return;panel.dataset.ready='true';let config,variants,names;
  try{config=JSON.parse(panel.dataset.config||'{}');variants=JSON.parse(panel.dataset.variants||'[]');names=JSON.parse(panel.dataset.options||'[]');}catch{return;}
  if(!config.groupId)return;
  const root=document.querySelector(`[data-cw-personalizer][data-product-id="${panel.dataset.productId}"]`);
  const gallery=document.querySelector('[data-gallery-main]')||document.querySelector('.product__media-list .product__media-item')||document.querySelector('.product__media');
  if(!gallery)return;
  const original=gallery.querySelector('img');let selected=variants.find(v=>String(v.id)===new URLSearchParams(location.search).get('variant'))||variants.find(v=>String(v.id)===panel.dataset.variant)||variants[0];if(!selected)return;
  const preview=document.createElement('div');preview.className='cw-group-preview';preview.hidden=true;
  preview.innerHTML='<div class="cw-group-background"></div><div class="cw-group-photo"><img alt="Your customized product"><span class="cw-group-studs"></span></div><img class="cw-group-overlay" alt=""><span class="cw-group-height"></span><span class="cw-group-width"></span>';
  gallery.classList.add('cw-group-gallery');gallery.append(preview);let artwork='',customer=false;
  const show=(visible)=>{preview.hidden=!visible;original?.classList.toggle('cw-group-original-hidden',visible);};
  const render=()=>{
   const t=config.previews?.[String(selected.id)];if(!t){show(false);return;}
   const photo=preview.querySelector('.cw-group-photo'),img=photo.querySelector('img'),overlay=preview.querySelector('.cw-group-overlay');
   if(!customer){artwork=config.customization==='design'?(panel.dataset.artwork||t.image||''):t.image||'';}
   const bg=t.background||'';
   preview.querySelector('.cw-group-background').style.backgroundImage=bg?`url("${bg}")`:'none';
   overlay.hidden=!t.overlay;overlay.src=t.overlay||'';
   let x=t.x,y=t.y,w=t.width,h=t.height;
   if(config.previewMode==='automatic'){x=50;y=34;w=t.widthInches/60*78;h=t.heightInches/60*78;}
   Object.assign(photo.style,{left:`${x}%`,top:`${y}%`,width:`${w}%`,height:`${h}%`});
   photo.classList.toggle('cw-group-photo--studs',!!t.studs);photo.style.setProperty('--cw-group-stud',`url("${panel.dataset.stud}")`);photo.style.setProperty('--cw-group-stud-size',`${Math.max(4,Math.min(12,Math.round(Math.min(t.widthInches,t.heightInches)/2)))}px`);
   const height=preview.querySelector('.cw-group-height'),width=preview.querySelector('.cw-group-width');height.textContent=`${t.heightInches}″ height`;width.textContent=`← ${t.widthInches}″ width →`;
   Object.assign(height.style,{left:`${x}%`,top:`${Math.max(0,y-h/2-5)}%`});Object.assign(width.style,{left:`${x}%`,top:`${Math.min(95,y+h/2+2)}%`});
   // A finished product image is displayed directly before customization; artwork
   // after upload is rendered inside the selected room template.
   const completeImage=!customer&&config.customization!=='design'&&!!t.image;
   if(completeImage){img.src=t.image;Object.assign(photo.style,{left:'50%',top:'50%',width:'100%',height:'100%'});photo.classList.remove('cw-group-photo--studs');overlay.hidden=true;height.hidden=true;width.hidden=true;}
   else{img.src=artwork;height.hidden=false;width.hidden=false;}
   show(!!artwork&&config.previewMode!=='off');
   if(customer&&config.previewMode==='off'&&original)original.src=artwork;
   if(root&&config.customization==='plain')root.dispatchEvent(new CustomEvent('cw:acrylic-selection',{detail:{ratio:`${Math.round(t.widthInches*100)}:${Math.round(t.heightInches*100)}`,variantId:String(selected.id)}}));
  };
  const choose=(v)=>{if(!v||v.id===selected.id)return;selected=v;document.querySelectorAll('form[action*="/cart/add"] input[name="id"]').forEach(i=>{i.value=String(v.id);});render();};
  (root||document).addEventListener('cartwala:preview-ready',event=>{if(root&&event.target!==root)return;if(!event.detail?.url)return;artwork=event.detail.url;customer=true;render();});
  document.addEventListener('change',event=>{
   const target=event.target;if(!(target instanceof HTMLElement))return;
   if(target.getAttribute('name')==='id')choose(variants.find(v=>String(v.id)===target.value));
   else if(/^option[1-3]$/.test(target.getAttribute('name')||'')){
    const values=names.map((_,i)=>document.querySelector(`input[name="option${i+1}"]:checked`)?.value||document.querySelector(`select[name="option${i+1}"]`)?.value||selected.options?.[i]||selected[`option${i+1}`]);
    choose(variants.find(v=>values.every((value,i)=>(v.options?.[i]||v[`option${i+1}`])===value)));
   }
  });
  render();
 });
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();document.addEventListener('shopify:section:load',initialize);
})();
