// Cartwala master photo-frame gallery v5 — deterministic custom personalized gallery.
(() => {
  if (window.cartwalaPhotoFrameGalleryV5Loaded) return;
  window.cartwalaPhotoFrameGalleryV5Loaded = true;

  const MASTER = 1254;
  const order = ["size:8x12","guide","side","size:10x15","size:12x18","size:16x24","size:20x30","size:24x36"];
  const assets = {
    "size:8x12":  "https://cdn.shopify.com/s/files/1/0803/7931/4361/files/photo-frame-8x12-black-beading.png?v=1791315873",
    "guide":      "https://cdn.shopify.com/s/files/1/0803/7931/4361/files/photo-frame-size-guide-black-beading.png?v=1791315973",
    "side":       "https://cdn.shopify.com/s/files/1/0803/7931/4361/files/photo-frame-side-view-black-beading.png?v=1791315983",
    "size:10x15": "https://cdn.shopify.com/s/files/1/0803/7931/4361/files/photo-frame-10x15-black-beading.png?v=1791315884",
    "size:12x18": "https://cdn.shopify.com/s/files/1/0803/7931/4361/files/photo-frame-12x18-black-beading.png?v=1791315894",
    "size:16x24": "https://cdn.shopify.com/s/files/1/0803/7931/4361/files/photo-frame-16x24-black-beading.png?v=1791315907",
    "size:20x30": "https://cdn.shopify.com/s/files/1/0803/7931/4361/files/photo-frame-20x30-black-beading.png?v=1791315916",
    "size:24x36": "https://cdn.shopify.com/s/files/1/0803/7931/4361/files/photo-frame-24x36-black-beading.png?v=1791315927"
  };
  const rects = {
    "size:8x12": [[576,326,666,476]],
    "size:10x15":[[553,270,680,476]],
    "size:12x18":[[535,229,704,506]],
    "size:16x24":[[517,197,732,558]],
    "size:20x30":[[478,156,767,607]],
    "size:24x36":[[469,115,785,635]],
    "guide":[
      [93,452,176,586],
      [231,428,329,594],
      [387,399,501,594],
      [562,363,696,594],
      [759,326,928,595],
      [993,288,1186,596]
    ]
  };
  const sideQuad = [[466,221],[863,188],[815,958],[408,922]];

  let artworkUrl = "";
  let activeKind = "";
  let mounted = false;

  const root = () =>
    document.querySelector('[data-cw-personalizer][data-cw-photo-frame-master="true"]');

  const originalGallery = () =>
    document.querySelector(".product-gallery, media-gallery, [id^='MediaGallery-'], .product__media-wrapper, .product-media, [data-product-gallery]");

  const selectedSize = () => {
    const selectors = [
      'input[type="radio"][value="8x12"]:checked',
      'input[type="radio"][value="10x15"]:checked',
      'input[type="radio"][value="12x18"]:checked',
      'input[type="radio"][value="16x24"]:checked',
      'input[type="radio"][value="20x30"]:checked',
      'input[type="radio"][value="24x36"]:checked'
    ];
    for (const selector of selectors) {
      const el=document.querySelector(selector);
      if (el) return el.value;
    }
    const select=[...document.querySelectorAll("select")].find(s=>/^(8x12|10x15|12x18|16x24|20x30|24x36)$/.test(s.value));
    if (select) return select.value;
    const idInput=document.querySelector('form[action*="/cart/add"] [name="id"]');
    const map={
      "67654678773945":"8x12","67654678806713":"10x15","67654678839481":"12x18",
      "67654678872249":"16x24","67654678905017":"20x30","67654678937785":"24x36"
    };
    const raw=String(idInput?.value||"").replace(/\D/g,"");
    return map[raw] || "8x12";
  };

  const label = (kind) => kind==="guide" ? "Size Guide" : kind==="side" ? "Side View" : kind.replace("size:","");

  const ensureStyles = () => {
    if (document.getElementById("cw-frame-v5-style")) return;
    const style=document.createElement("style");
    style.id="cw-frame-v5-style";
    style.textContent=`
      body.cw-photo-frame-master-page
      :is(.product-gallery, media-gallery, [id^="MediaGallery-"], .product__media-wrapper, .product-media, [data-product-gallery])
      :is(.product__media-item, [id*="Slide-"], .slider__slide, [data-media-id]) {
        aspect-ratio: 1 / 1 !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow: hidden !important;
      }

      body.cw-photo-frame-master-page
      :is(.product-gallery, media-gallery, [id^="MediaGallery-"], .product__media-wrapper, .product-media, [data-product-gallery])
      :is(.product__media-item, [id*="Slide-"], .slider__slide, [data-media-id])
      > :is(div,figure,a,picture) {
        width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
      }

      body.cw-photo-frame-master-page
      :is(.product-gallery, media-gallery, [id^="MediaGallery-"], .product__media-wrapper, .product-media, [data-product-gallery])
      :is(.product__media-item, [id*="Slide-"], .slider__slide, [data-media-id])
      img {
        width: 100% !important;
        height: 100% !important;
        max-height: none !important;
        object-fit: contain !important;
        object-position: center center !important;
      }

      body.cw-photo-frame-master-page
      :is(.thumbnail-list,[class*="thumb" i],[data-product-thumbnails],[data-thumbnails])
      :is(button,a,li) {
        aspect-ratio: 1 / 1 !important;
        height: auto !important;
      }

      .cw-frame-v5{width:100%;margin:0 0 14px;box-sizing:border-box}
      .cw-frame-v5__stage{position:relative;width:100%;aspect-ratio:1/1;background:#fff;border-radius:10px;overflow:hidden}
      .cw-frame-v5__base{width:100%;height:100%;display:block;object-fit:contain;object-position:center}
      .cw-frame-v5__overlay{position:absolute;z-index:3;object-fit:cover;display:block;pointer-events:none;max-width:none!important;max-height:none!important}
      .cw-frame-v5__thumbs{display:flex;gap:8px;overflow-x:auto;padding:10px 1px 2px;-webkit-overflow-scrolling:touch}
      .cw-frame-v5__thumb{flex:0 0 68px;width:68px;aspect-ratio:1/1;border:2px solid transparent;border-radius:8px;padding:0;background:#fff;overflow:hidden}
      .cw-frame-v5__thumb.is-active{border-color:#ff6200}
      .cw-frame-v5__thumb img{width:100%;height:100%;object-fit:cover;display:block}
      [data-cw-frame-original-hidden="true"]{display:none!important}
      @media(max-width:749px){.cw-frame-v5__thumb{flex-basis:62px;width:62px}.cw-frame-v5__thumbs{gap:7px}}
    `;
    document.head.appendChild(style);
  };

  const clearOverlays = (stage) => {
    stage.querySelectorAll(".cw-frame-v5__overlay").forEach(n=>n.remove());
  };

  const addRectOverlay = (stage, rect) => {
    if (!artworkUrl) return;
    const [x0,y0,x1,y1]=rect;
    const img=document.createElement("img");
    img.className="cw-frame-v5__overlay";
    img.src=artworkUrl;
    img.alt="";
    img.setAttribute("aria-hidden","true");
    Object.assign(img.style,{
      left:`${(x0/MASTER)*100}%`,
      top:`${(y0/MASTER)*100}%`,
      width:`${((x1-x0)/MASTER)*100}%`,
      height:`${((y1-y0)/MASTER)*100}%`
    });
    stage.appendChild(img);
  };

  const addSideOverlay = (stage) => {
    if (!artworkUrl) return;
    const xs=sideQuad.map(p=>p[0]), ys=sideQuad.map(p=>p[1]);
    const x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
    const img=document.createElement("img");
    img.className="cw-frame-v5__overlay";
    img.src=artworkUrl;
    img.alt="";
    img.setAttribute("aria-hidden","true");
    Object.assign(img.style,{
      left:`${(x0/MASTER)*100}%`,
      top:`${(y0/MASTER)*100}%`,
      width:`${((x1-x0)/MASTER)*100}%`,
      height:`${((y1-y0)/MASTER)*100}%`
    });
    const points=sideQuad.map(([x,y])=>`${((x-x0)/(x1-x0))*100}% ${((y-y0)/(y1-y0))*100}%`).join(",");
    img.style.clipPath=`polygon(${points})`;
    stage.appendChild(img);
  };

  const render = (kind) => {
    const gallery=document.querySelector("[data-cw-frame-v5]");
    if (!gallery || !assets[kind]) return;
    activeKind=kind;
    const base=gallery.querySelector("[data-cw-frame-v5-base]");
    const stage=gallery.querySelector("[data-cw-frame-v5-stage]");
    if (!base || !stage) return;
    base.src=assets[kind];
    base.alt=`Personalized photo frame ${label(kind)}`;
    base.dataset.cwFrameKind=kind;
    base.dataset.cwFrameBase=assets[kind];
    clearOverlays(stage);
    if (kind==="side") addSideOverlay(stage);
    else (rects[kind]||[]).forEach(r=>addRectOverlay(stage,r));
    gallery.querySelectorAll("[data-cw-frame-v5-thumb]").forEach(btn=>{
      const on=btn.dataset.kind===kind;
      btn.classList.toggle("is-active",on);
      btn.setAttribute("aria-current",on?"true":"false");
    });
  };

  const mount = () => {
    if (!artworkUrl || mounted) return;
    const original=originalGallery();
    if (!original) return;
    ensureStyles();
    const gallery=document.createElement("section");
    gallery.className="cw-frame-v5";
    gallery.dataset.cwFrameV5="true";
    gallery.setAttribute("aria-label","Personalized photo frame gallery");
    gallery.innerHTML=
      '<div class="cw-frame-v5__stage" data-cw-frame-v5-stage><img class="cw-frame-v5__base" data-cw-frame-v5-base></div>'+
      '<div class="cw-frame-v5__thumbs" data-cw-frame-v5-thumbs></div>';
    const thumbs=gallery.querySelector("[data-cw-frame-v5-thumbs]");
    order.forEach(kind=>{
      const btn=document.createElement("button");
      btn.type="button";
      btn.className="cw-frame-v5__thumb";
      btn.dataset.cwFrameV5Thumb="true";
      btn.dataset.kind=kind;
      btn.setAttribute("aria-label",`View ${label(kind)}`);
      const img=document.createElement("img");
      img.src=assets[kind];
      img.alt=label(kind);
      img.dataset.cwFrameKind=kind;
      btn.appendChild(img);
      btn.addEventListener("click",()=>render(kind));
      thumbs.appendChild(btn);
    });
    original.insertAdjacentElement("beforebegin",gallery);
    original.dataset.cwFrameOriginalHidden="true";
    mounted=true;
    render(`size:${selectedSize()}`);
  };

  const onSizeChange = () => {
    if (!mounted) return;
    render(`size:${selectedSize()}`);
  };

  const bind = () => {
    const host=root();
    if (!host || host.dataset.cwFrameV5Bound==="true") return;
    host.dataset.cwFrameV5Bound="true";
    document.body.classList.add("cw-photo-frame-master-page");
    ensureStyles();

    host.addEventListener("cartwala:preview-ready",(event)=>{
      if (!event.detail?.url) return;
      artworkUrl=event.detail.url;
      document.body.classList.add("cw-photo-frame-personalized","cw-photo-frame-master-page");
      mount();
      if (mounted) render(`size:${selectedSize()}`);
    });

    document.addEventListener("change",(event)=>{
      const t=event.target;
      if (!(t instanceof HTMLElement)) return;
      if (
        t.matches('input[type="radio"][value="8x12"],input[type="radio"][value="10x15"],input[type="radio"][value="12x18"],input[type="radio"][value="16x24"],input[type="radio"][value="20x30"],input[type="radio"][value="24x36"]') ||
        (t instanceof HTMLSelectElement && /^(8x12|10x15|12x18|16x24|20x30|24x36)$/.test(t.value))
      ) {
        setTimeout(onSizeChange,0);
        setTimeout(onSizeChange,120);
      }
    },true);

    document.addEventListener("click",(event)=>{
      const t=event.target instanceof Element?event.target:null;
      if (!t) return;
      const sizeText=t.closest("label,button");
      if (sizeText && /^(8x12|10x15|12x18|16x24|20x30|24x36)$/.test((sizeText.textContent||"").trim())) {
        setTimeout(onSizeChange,80);
        setTimeout(onSizeChange,220);
      }
    },true);
  };

  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();
})();