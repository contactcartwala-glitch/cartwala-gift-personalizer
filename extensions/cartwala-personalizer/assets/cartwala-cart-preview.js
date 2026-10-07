(()=>{
  if(window.cartwalaCartPreviewLoaded)return;window.cartwalaCartPreviewLoaded=true;
  const pagePath=window.location.pathname.replace(/\/+$/,'');
  const isMugCollectionPage=(pagePath==='/collections/customised-mugs'||pagePath.startsWith('/collections/customised-mugs/'))&&!pagePath.includes('/products/');
  document.documentElement.classList.toggle('cw-mug-collection-page',isMugCollectionPage);
  window.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');
    if(!link?.closest('cart-drawer,#CartDrawer,#cart-drawer,[data-cart-drawer],.cart-drawer'))return;
    const url=new URL(link.href,window.location.href);
    const cartUrl=new URL((window.Shopify?.routes?.root||'/')+'cart',window.location.href);
    if(url.origin!==cartUrl.origin||url.pathname.replace(/\/$/,'')!==cartUrl.pathname.replace(/\/$/,''))return;
    event.stopImmediatePropagation();
  },true);
  const rowSelector='[data-cart-line-key],[data-line-key],[data-cart-item],cart-drawer-item,.cart-item,.drawer__cart-item';
  const containerSelector='cart-drawer,#CartDrawer,[data-cart-drawer],#main-cart-items,form[action*="/cart"],.cart__items';
  const draftUrls=new Map();let timer;let running=false;let pending=false;
  const database=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('cartwala-designs',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  const draftPreview=async designId=>{if(!designId)return null;if(draftUrls.has(designId))return draftUrls.get(designId);try{const db=await database();const records=await new Promise((resolve,reject)=>{const request=db.transaction('drafts').objectStore('drafts').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});const record=records.find(item=>item?.designId===designId&&item?.blob);if(!record)return null;const url=URL.createObjectURL(record.blob);draftUrls.set(designId,url);return url}catch(error){console.warn('Cartwala saved preview unavailable',error);return null}};
  const rowKey=row=>{if(row.dataset.cartLineKey)return row.dataset.cartLineKey;if(row.dataset.lineKey)return row.dataset.lineKey;const quantity=row.querySelector('input[name^="updates["]');const match=quantity?.name?.match(/^updates\[(.+)\]$/);return match?.[1]||null};
  const rowIndex=row=>{const explicit=Number(row.dataset.index||row.querySelector('[data-index]')?.dataset.index||String(row.id||'').match(/(?:CartDrawer-Item|CartItem)-(\d+)/)?.[1]);if(Number.isInteger(explicit)&&explicit>0)return explicit-1;const container=row.closest(containerSelector)||document;const rows=[...container.querySelectorAll(rowSelector)].filter(candidate=>!candidate.parentElement?.closest(rowSelector));const index=rows.indexOf(row);return index<0?0:index};
  const rowItem=(row,cart)=>{const key=rowKey(row);if(key){const found=cart.items.find(item=>item.key===key);if(found)return found}const variant=String(row.dataset.variantId||row.querySelector('[data-variant-id]')?.dataset.variantId||'');if(variant){const matches=cart.items.filter(item=>String(item.variant_id)===variant);if(matches.length===1)return matches[0]}const href=row.querySelector('a[href*="/products/"]')?.getAttribute('href')||'';const handle=href.match(/\/products\/([^?/#]+)/)?.[1];if(handle){const matches=cart.items.filter(item=>item.handle===handle);if(matches.length===1)return matches[0]}return cart.items[rowIndex(row)]};
  const safePreviewUrl=value=>{if(typeof value!=='string'||!value.trim())return null;const clean=value.trim();if(clean.startsWith('//'))return `https:${clean}`;try{const url=new URL(clean);return url.protocol==='https:'||url.protocol==='blob:'?url.href:null}catch{return null}};
  const previewValue=async item=>{const property=safePreviewUrl(item?.properties?.['_Personalised Preview']);if(property)return property;return draftPreview(item?.properties?.['_Cartwala Design ID'])};
  const replaceImage=(row,url)=>{const image=row.querySelector('.cart-item__image,img');if(!image||image.dataset.cwPreview===url)return;image.dataset.cwPreview=url;image.removeAttribute('srcset');image.removeAttribute('sizes');image.closest('picture')?.querySelectorAll('source').forEach(source=>{source.removeAttribute('srcset');source.removeAttribute('sizes')});image.src=url;image.style.objectFit='contain';image.style.background='transparent'};
  const update=async()=>{if(running){pending=true;return}running=true;try{const rows=[...new Set(document.querySelectorAll(rowSelector))];if(!rows.length)return;const response=await fetch((window.Shopify?.routes?.root||'/')+'cart.js',{headers:{Accept:'application/json'},cache:'no-store'});if(!response.ok)return;const cart=await response.json();for(const row of rows){const item=rowItem(row,cart);const url=await previewValue(item);if(url)replaceImage(row,url)}}catch(error){console.warn('Cartwala cart preview unavailable',error)}finally{running=false;if(pending){pending=false;schedule()}}};
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(update,100)};
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  ['shopify:section:load','cart:updated','cart:refresh','product:added'].forEach(name=>document.addEventListener(name,schedule));
  window.addEventListener('pageshow',schedule);schedule();
})();(()=>{
  if(window.cartwalaCartPreviewLoaded)return;window.cartwalaCartPreviewLoaded=true;
  const pagePath=window.location.pathname.replace(/\/+$/,'');
  if(pagePath==='/collections/customised-mugs'||pagePath.startsWith('/collections/customised-mugs/'))document.documentElement.classList.add('cw-mug-collection-page');
  window.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');
    if(!link?.closest('cart-drawer,#CartDrawer,#cart-drawer,[data-cart-drawer],.cart-drawer'))return;
    const url=new URL(link.href,window.location.href);
    const cartUrl=new URL((window.Shopify?.routes?.root||'/')+'cart',window.location.href);
    if(url.origin!==cartUrl.origin||url.pathname.replace(/\/$/,'')!==cartUrl.pathname.replace(/\/$/,''))return;
    event.stopImmediatePropagation();
  },true);
  const rowSelector='[data-cart-line-key],[data-line-key],[data-cart-item],cart-drawer-item,.cart-item,.drawer__cart-item';
  const containerSelector='cart-drawer,#CartDrawer,[data-cart-drawer],#main-cart-items,form[action*="/cart"],.cart__items';
  const draftUrls=new Map();let timer;let running=false;let pending=false;
  const database=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('cartwala-designs',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  const draftPreview=async designId=>{if(!designId)return null;if(draftUrls.has(designId))return draftUrls.get(designId);try{const db=await database();const records=await new Promise((resolve,reject)=>{const request=db.transaction('drafts').objectStore('drafts').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});const record=records.find(item=>item?.designId===designId&&item?.blob);if(!record)return null;const url=URL.createObjectURL(record.blob);draftUrls.set(designId,url);return url}catch(error){console.warn('Cartwala saved preview unavailable',error);return null}};
  const rowKey=row=>{if(row.dataset.cartLineKey)return row.dataset.cartLineKey;if(row.dataset.lineKey)return row.dataset.lineKey;const quantity=row.querySelector('input[name^="updates["]');const match=quantity?.name?.match(/^updates\[(.+)\]$/);return match?.[1]||null};
  const rowIndex=row=>{const explicit=Number(row.dataset.index||row.querySelector('[data-index]')?.dataset.index||String(row.id||'').match(/(?:CartDrawer-Item|CartItem)-(\d+)/)?.[1]);if(Number.isInteger(explicit)&&explicit>0)return explicit-1;const container=row.closest(containerSelector)||document;const rows=[...container.querySelectorAll(rowSelector)].filter(candidate=>!candidate.parentElement?.closest(rowSelector));const index=rows.indexOf(row);return index<0?0:index};
  const rowItem=(row,cart)=>{const key=rowKey(row);if(key){const found=cart.items.find(item=>item.key===key);if(found)return found}const variant=String(row.dataset.variantId||row.querySelector('[data-variant-id]')?.dataset.variantId||'');if(variant){const matches=cart.items.filter(item=>String(item.variant_id)===variant);if(matches.length===1)return matches[0]}const href=row.querySelector('a[href*="/products/"]')?.getAttribute('href')||'';const handle=href.match(/\/products\/([^?/#]+)/)?.[1];if(handle){const matches=cart.items.filter(item=>item.handle===handle);if(matches.length===1)return matches[0]}return cart.items[rowIndex(row)]};
  const safePreviewUrl=value=>{if(typeof value!=='string'||!value.trim())return null;const clean=value.trim();if(clean.startsWith('//'))return `https:${clean}`;try{const url=new URL(clean);return url.protocol==='https:'||url.protocol==='blob:'?url.href:null}catch{return null}};
  const previewValue=async item=>{const property=safePreviewUrl(item?.properties?.['_Personalised Preview']);if(property)return property;return draftPreview(item?.properties?.['_Cartwala Design ID'])};
  const replaceImage=(row,url)=>{const image=row.querySelector('.cart-item__image,img');if(!image||image.dataset.cwPreview===url)return;image.dataset.cwPreview=url;image.removeAttribute('srcset');image.removeAttribute('sizes');image.closest('picture')?.querySelectorAll('source').forEach(source=>{source.removeAttribute('srcset');source.removeAttribute('sizes')});image.src=url;image.style.objectFit='contain';image.style.background='transparent'};
  const update=async()=>{if(running){pending=true;return}running=true;try{const rows=[...new Set(document.querySelectorAll(rowSelector))];if(!rows.length)return;const response=await fetch((window.Shopify?.routes?.root||'/')+'cart.js',{headers:{Accept:'application/json'},cache:'no-store'});if(!response.ok)return;const cart=await response.json();for(const row of rows){const item=rowItem(row,cart);const url=await previewValue(item);if(url)replaceImage(row,url)}}catch(error){console.warn('Cartwala cart preview unavailable',error)}finally{running=false;if(pending){pending=false;schedule()}}};
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(update,100)};
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  ['shopify:section:load','cart:updated','cart:refresh','product:added'].forEach(name=>document.addEventListener(name,schedule));
  window.addEventListener('pageshow',schedule);schedule();
})();


/* Cartwala site-wide sticky product Add to Cart */
(()=>{
  if(window.cartwalaStickyAtcLoaded)return;
  window.cartwalaStickyAtcLoaded=true;
  const pagePath=window.location.pathname.replace(/\/+$/,'');
  if(!/\/products\//.test(pagePath))return;

  let syncTimer=0;
  let productData=null;
  let productDataPromise=null;
  const routeRoot=window.Shopify?.routes?.root||'/';
  const visible=el=>!!(el&&el.getClientRects().length);
  const normaliseOption=value=>String(value||'').replace(/\s+/g,' ').trim();

  const productForms=()=>[...document.querySelectorAll('form[action*="/cart/add"]')]
    .filter(form=>!form.closest('.cw-site-sticky-atc'));
  const productForm=()=>productForms().find(form=>form.querySelector('[name="id"]'))||productForms()[0]||null;
  const originalAdd=()=>{
    const form=productForm();
    if(!form)return null;
    return [...form.querySelectorAll('button[name="add"],input[name="add"],button[type="submit"]')]
      .find(button=>!button.closest('.shopify-payment-button'))||null;
  };
  const quantityInput=()=>{
    const form=productForm();
    return form?.querySelector('input[name="quantity"]')||document.querySelector('input[name="quantity"]');
  };

  const selectedOptions=()=>{
    const scope=productForm()||document;
    const byIndex=new Map();
    scope.querySelectorAll('select[name^="option"]').forEach(select=>{
      const match=String(select.name||'').match(/option(\d+)/i);
      const index=match?Number(match[1]):byIndex.size+1;
      const value=select.value||select.options?.[select.selectedIndex]?.value||select.options?.[select.selectedIndex]?.textContent;
      if(value)byIndex.set(index,normaliseOption(value));
    });
    scope.querySelectorAll('input[name^="option"]:checked').forEach(input=>{
      const match=String(input.name||'').match(/option(\d+)/i);
      const index=match?Number(match[1]):byIndex.size+1;
      if(input.value)byIndex.set(index,normaliseOption(input.value));
    });
    return [...byIndex.entries()].sort((a,b)=>a[0]-b[0]).map(([,value])=>value);
  };

  const urlVariantId=()=>new URLSearchParams(window.location.search).get('variant')||'';
  const formVariantId=()=>String(productForm()?.querySelector('[name="id"]')?.value||'');

  const matchingProductVariant=()=>{
    if(!productData?.variants?.length)return null;
    const explicit=String(formVariantId()||urlVariantId()||'');
    if(explicit){
      const found=productData.variants.find(v=>String(v.id)===explicit);
      if(found)return found;
    }
    const options=selectedOptions();
    if(options.length){
      const found=productData.variants.find(v=>{
        const candidate=[v.option1,v.option2,v.option3].filter(Boolean).map(normaliseOption);
        return options.every((value,index)=>candidate[index]===value);
      });
      if(found)return found;
    }
    return productData.variants.find(v=>v.available)||productData.variants[0]||null;
  };

  const selectedVariantId=()=>String(formVariantId()||urlVariantId()||matchingProductVariant()?.id||'');
  const selectedVariant=()=>{
    const id=selectedVariantId();
    return productData?.variants?.find(v=>String(v.id)===id)||matchingProductVariant();
  };

  const loadProductData=()=>{
    if(productDataPromise)return productDataPromise;
    productDataPromise=fetch(pagePath+'.js',{headers:{Accept:'application/json'},cache:'no-store'})
      .then(response=>response.ok?response.json():null)
      .then(data=>{productData=data;return data})
      .catch(()=>null)
      .finally(()=>schedule());
    return productDataPromise;
  };

  const optionText=()=>{
    const values=selectedOptions();
    if(values.length)return values.slice(0,2).join(' · ');
    const title=selectedVariant()?.title;
    return title&&title!=='Default Title'?title:'';
  };

  const formatMoney=cents=>{
    if(cents==null||Number.isNaN(Number(cents)))return '';
    const currency=window.Shopify?.currency?.active||'INR';
    try{
      return new Intl.NumberFormat('en-IN',{
        style:'currency',
        currency,
        maximumFractionDigits:Number(cents)%100===0?0:2
      }).format(Number(cents)/100);
    }catch{
      return '₹'+(Number(cents)/100).toFixed(0);
    }
  };

  const priceText=()=>{
    const selectors=[
      '.product__info-container .price',
      '.product-info .price',
      '.product__price',
      '[data-product-price]',
      '.price'
    ];
    const node=selectors.flatMap(sel=>[...document.querySelectorAll(sel)])
      .find(el=>visible(el)&&!el.closest('.cw-site-sticky-atc'));
    const text=(node?.innerText||'').replace(/\s+/g,' ').trim();
    const matches=text.match(/(?:Rs\.?|₹)\s*[\d,]+(?:\.\d+)?/gi)||[];
    if(matches.length)return {sale:matches[0],compare:matches[1]||''};
    const current=selectedVariant();
    return {
      sale:formatMoney(current?.price),
      compare:current?.compare_at_price&&Number(current.compare_at_price)>Number(current.price)
        ?formatMoney(current.compare_at_price):''
    };
  };

  const bar=document.createElement('div');
  bar.className='cw-site-sticky-atc';
  bar.setAttribute('role','region');
  bar.setAttribute('aria-label','Quick add to cart');
  bar.innerHTML=`
    <div class="cw-site-sticky-atc__inner">
      <div class="cw-site-sticky-atc__summary">
        <div class="cw-site-sticky-atc__prices">
          <s data-cw-sticky-compare hidden></s>
          <strong data-cw-sticky-price></strong>
        </div>
        <small data-cw-sticky-variant></small>
      </div>
      <div class="cw-site-sticky-atc__qty" aria-label="Quantity">
        <button type="button" data-cw-sticky-minus aria-label="Decrease quantity">−</button>
        <input type="number" min="1" value="1" inputmode="numeric" data-cw-sticky-qty aria-label="Quantity">
        <button type="button" data-cw-sticky-plus aria-label="Increase quantity">+</button>
      </div>
      <button type="button" class="cw-site-sticky-atc__button" data-cw-sticky-add disabled>
        <span aria-hidden="true">▣</span><strong>Add to Cart</strong>
      </button>
    </div>`;
  document.body.appendChild(bar);
  document.body.classList.add('cw-site-sticky-atc-active');

  const price=bar.querySelector('[data-cw-sticky-price]');
  const compare=bar.querySelector('[data-cw-sticky-compare]');
  const variant=bar.querySelector('[data-cw-sticky-variant]');
  const qty=bar.querySelector('[data-cw-sticky-qty]');
  const add=bar.querySelector('[data-cw-sticky-add]');
  const minus=bar.querySelector('[data-cw-sticky-minus]');
  const plus=bar.querySelector('[data-cw-sticky-plus]');

  const setQty=value=>{
    const input=quantityInput();
    const min=Math.max(1,Number(input?.min)||1);
    const max=Number(input?.max)||999;
    const next=Math.min(max,Math.max(min,Math.round(Number(value)||min)));
    qty.value=String(next);
    if(input){
      input.value=String(next);
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }
  };

  const fixedAncestor=node=>{
    let current=node;
    while(current&&current!==document.body){
      if(current.closest?.('.cw-site-sticky-atc'))return null;
      const style=getComputedStyle(current);
      if(style.position==='fixed'||style.position==='sticky')return current;
      current=current.parentElement;
    }
    return null;
  };

  const moveFloatingWhatsApp=()=>{
    const stickyRect=bar.getBoundingClientRect();
    if(!stickyRect.height)return;
    const selectors=[
      'a[href*="wa.me"]',
      'a[href*="api.whatsapp.com"]',
      'a[href*="whatsapp"]',
      'iframe[src*="whatsapp"]',
      '[class*="whatsapp" i]',
      '[id*="whatsapp" i]',
      '[aria-label*="whatsapp" i]'
    ];
    const candidates=[...new Set(selectors.flatMap(selector=>[...document.querySelectorAll(selector)]))];
    const fixed=[...new Set(candidates.map(fixedAncestor).filter(Boolean))];
    fixed.forEach(node=>{
      const rect=node.getBoundingClientRect();
      const overlaps=
        Math.max(0,Math.min(stickyRect.right,rect.right)-Math.max(stickyRect.left,rect.left))>2&&
        Math.max(0,Math.min(stickyRect.bottom,rect.bottom)-Math.max(stickyRect.top,rect.top))>2;
      if(overlaps||rect.bottom>stickyRect.top-8){
        node.dataset.cwRaisedForSticky='true';
        node.style.setProperty('bottom',`calc(${Math.ceil(stickyRect.height)+14}px + env(safe-area-inset-bottom))`,'important');
        node.style.setProperty('z-index','2147482999','important');
      }
    });
  };

  const removeInvalidLiquidImages=()=>{
    document.querySelectorAll('img').forEach(img=>{
      const raw=String(img.getAttribute('src')||img.currentSrc||'');
      let decoded=raw;
      try{decoded=decodeURIComponent(raw)}catch{}
      if(/Liquid error .*invalid url input/i.test(decoded)){
        img.setAttribute('aria-hidden','true');
        img.style.setProperty('display','none','important');
        img.removeAttribute('srcset');
      }
    });
  };

  const sync=()=>{
    bar.hidden=false;
    const p=priceText();
    price.textContent=p.sale||'';
    compare.textContent=p.compare||'';
    compare.hidden=!p.compare;
    variant.textContent=optionText();

    const sourceQty=quantityInput();
    if(sourceQty&&document.activeElement!==qty)qty.value=String(sourceQty.value||1);

    const sourceAdd=originalAdd();
    const current=selectedVariant();
    const unavailable=
      (!!sourceAdd&&(sourceAdd.disabled||/sold out|unavailable/i.test(sourceAdd.textContent||sourceAdd.value||'')))||
      (!!current&&current.available===false);
    const haveVariant=!!selectedVariantId();
    add.disabled=unavailable||!haveVariant;
    add.querySelector('strong').textContent=unavailable?'Sold Out':'Add to Cart';
    bar.dataset.variantId=selectedVariantId();

    removeInvalidLiquidImages();
    moveFloatingWhatsApp();
  };

  const schedule=()=>{
    clearTimeout(syncTimer);
    syncTimer=setTimeout(sync,70);
  };

  const fallbackAdd=async()=>{
    const id=selectedVariantId();
    if(!id)return;
    add.disabled=true;
    const label=add.querySelector('strong');
    const old=label.textContent;
    label.textContent='Adding…';
    try{
      const response=await fetch(routeRoot+'cart/add.js',{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({items:[{id:Number(id),quantity:Number(qty.value)||1}]})
      });
      if(!response.ok)throw new Error('Cart add failed');
      document.dispatchEvent(new CustomEvent('cart:refresh',{bubbles:true}));
      document.dispatchEvent(new CustomEvent('cart:updated',{bubbles:true}));
      document.dispatchEvent(new CustomEvent('product:added',{bubbles:true}));
      label.textContent='Added ✓';
      setTimeout(()=>{label.textContent='Add to Cart';schedule()},1200);
    }catch(error){
      console.warn('Cartwala quick add unavailable',error);
      label.textContent=old||'Add to Cart';
      add.disabled=false;
    }
  };

  minus.addEventListener('click',()=>setQty(Number(qty.value)-1));
  plus.addEventListener('click',()=>setQty(Number(qty.value)+1));
  qty.addEventListener('change',()=>setQty(qty.value));
  add.addEventListener('click',async()=>{
    if(add.disabled)return;
    setQty(qty.value);
    const personalizer=document.querySelector('[data-cw-personalizer]');
    const customizer=personalizer?.querySelector('[data-cw-open]');
    if(customizer&&!/edit again/i.test(customizer.textContent||'')){
      customizer.click();
      return;
    }
    const sourceAdd=originalAdd();
    if(sourceAdd&&!sourceAdd.disabled){
      sourceAdd.click();
      return;
    }
    const form=productForm();
    if(form?.requestSubmit){
      form.requestSubmit();
      return;
    }
    await fallbackAdd();
  });

  ['change','input','variant:change','product:variant-change','shopify:section:load']
    .forEach(name=>document.addEventListener(name,schedule));
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','src','srcset','value','checked']});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('pageshow',schedule);
  loadProductData();
  sync();
})();
