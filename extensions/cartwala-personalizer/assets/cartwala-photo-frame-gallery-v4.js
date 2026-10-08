// Cartwala master photo-frame gallery v4 — non-destructive live photo overlays.
(() => {
  if (window.cartwalaPhotoFrameGalleryV4Loaded) return;
  window.cartwalaPhotoFrameGalleryV4Loaded = true;

  const MASTER = 1254;
  const sizeViews = {
    "8x12":  { match: "photo-frame-8x12-black-beading",  rects: [[576,326,666,476]] },
    "10x15": { match: "photo-frame-10x15-black-beading", rects: [[553,270,680,476]] },
    "12x18": { match: "photo-frame-12x18-black-beading", rects: [[535,229,704,506]] },
    "16x24": { match: "photo-frame-16x24-black-beading", rects: [[517,197,732,558]] },
    "20x30": { match: "photo-frame-20x30-black-beading", rects: [[478,156,767,607]] },
    "24x36": { match: "photo-frame-24x36-black-beading", rects: [[469,115,785,635]] },
  };
  const guideMatches = ["photo-frame-size-guide-black-beading","photo-frame-size-guide.png"];
  const guideRects = [
    [93,452,176,586],
    [231,428,329,594],
    [387,399,501,594],
    [562,363,696,594],
    [759,326,928,595],
    [993,288,1186,596],
  ];
  const sideMatches = ["photo-frame-side-view-black-beading","photo-frame-side-view.png"];
  const sideQuad = [[466,221],[863,188],[815,958],[408,922]];

  let artworkUrl = "";
  let raf = 0;
  let timer = 0;

  const root = () =>
    document.querySelector('[data-cw-personalizer][data-cw-photo-frame-master="true"]');

  const cleanUrl = (value) => {
    try {
      const u = new URL(value, location.href);
      ["width","height","crop","pad","format"].forEach((k) => u.searchParams.delete(k));
      return u.href.toLowerCase();
    } catch {
      return String(value || "").toLowerCase();
    }
  };

  const descriptorFor = (url) => {
    const value = cleanUrl(url);
    for (const [size, view] of Object.entries(sizeViews)) {
      if (value.includes(view.match)) return { key:`size:${size}`, type:"rect", rects:view.rects };
    }
    if (guideMatches.some((m) => value.includes(m))) return { key:"guide", type:"rect", rects:guideRects };
    if (sideMatches.some((m) => value.includes(m))) return { key:"side", type:"quad", quad:sideQuad };
    return null;
  };

  const isThumb = (img) =>
    !!img.closest('.thumbnail-list,[class*="thumb" i],[data-thumbnail],[data-product-thumbnails],[data-thumbnails]') ||
    img.getBoundingClientRect().width < 120 ||
    img.getBoundingClientRect().height < 120;

  const removeOverlays = (parent, owner) => {
    parent.querySelectorAll(':scope > [data-cw-frame-live-overlay]').forEach((node) => {
      if (!owner || node.dataset.owner === owner) node.remove();
    });
  };

  const positionRect = (overlay, imgRect, parentRect, rect) => {
    const [x0,y0,x1,y1] = rect;
    Object.assign(overlay.style, {
      left: `${imgRect.left-parentRect.left + (x0/MASTER)*imgRect.width}px`,
      top: `${imgRect.top-parentRect.top + (y0/MASTER)*imgRect.height}px`,
      width: `${((x1-x0)/MASTER)*imgRect.width}px`,
      height: `${((y1-y0)/MASTER)*imgRect.height}px`,
    });
  };

  const positionQuad = (overlay, imgRect, parentRect, quad) => {
    const xs=quad.map(p=>p[0]), ys=quad.map(p=>p[1]);
    const x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
    Object.assign(overlay.style, {
      left: `${imgRect.left-parentRect.left + (x0/MASTER)*imgRect.width}px`,
      top: `${imgRect.top-parentRect.top + (y0/MASTER)*imgRect.height}px`,
      width: `${((x1-x0)/MASTER)*imgRect.width}px`,
      height: `${((y1-y0)/MASTER)*imgRect.height}px`,
    });
    const points=quad.map(([x,y])=>`${((x-x0)/(x1-x0))*100}% ${((y-y0)/(y1-y0))*100}%`).join(",");
    overlay.style.clipPath=`polygon(${points})`;
  };

  const overlayImage = (parent, owner) => {
    const img=document.createElement("img");
    img.src=artworkUrl;
    img.alt="";
    img.setAttribute("aria-hidden","true");
    img.dataset.cwFrameLiveOverlay="true";
    img.dataset.owner=owner;
    Object.assign(img.style,{
      position:"absolute",
      zIndex:"3",
      objectFit:"cover",
      display:"block",
      pointerEvents:"none",
      margin:"0",
      padding:"0",
      border:"0",
      maxWidth:"none",
      maxHeight:"none",
    });
    parent.appendChild(img);
    return img;
  };

  const decorateImage = (img, descriptor, index) => {
    img.dataset.cwFrameKind=descriptor.key;
    img.dataset.cwFrameBase=cleanUrl(img.currentSrc || img.src);
    if (!artworkUrl || isThumb(img)) return;

    const parent=img.parentElement;
    if (!parent) return;
    const imgRect=img.getBoundingClientRect();
    const parentRect=parent.getBoundingClientRect();
    if (imgRect.width < 120 || imgRect.height < 120) return;

    const owner=`${descriptor.key}:${index}`;
    removeOverlays(parent);
    if (getComputedStyle(parent).position === "static") parent.style.position="relative";

    if (descriptor.type === "rect") {
      descriptor.rects.forEach((rect, slot) => {
        const overlay=overlayImage(parent,`${owner}:${slot}`);
        positionRect(overlay,imgRect,parentRect,rect);
      });
    } else {
      const overlay=overlayImage(parent,owner);
      positionQuad(overlay,imgRect,parentRect,descriptor.quad);
    }
  };

  const apply = () => {
    if (!root()) return;
    document.querySelectorAll("img").forEach((img,index) => {
      if (img.hasAttribute("data-cw-frame-live-overlay")) return;
      const descriptor=descriptorFor(img.currentSrc || img.src);
      if (!descriptor) return;
      decorateImage(img,descriptor,index);
    });
  };
  const activateMediaControl = (control) => {
    if (!(control instanceof Element)) return;
    const thumbImage = control.querySelector("img") || (control.matches("img") ? control : null);
    const descriptor = thumbImage ? descriptorFor(thumbImage.currentSrc || thumbImage.src) : null;
    if (!descriptor) return;

    const mediaGallery =
      control.closest("media-gallery") ||
      document.querySelector("media-gallery, [id^='MediaGallery-']");
    const targetId =
      control.getAttribute("data-target") ||
      control.dataset?.target ||
      control.getAttribute("aria-controls") ||
      "";

    const force = () => {
      // Dawn / modern Shopify themes expose setActiveMedia on media-gallery.
      if (mediaGallery && typeof mediaGallery.setActiveMedia === "function" && targetId) {
        try { mediaGallery.setActiveMedia(targetId, true); } catch {}
      }

      const gallery =
        mediaGallery ||
        document.querySelector(".product-gallery, [id^='MediaGallery-'], .product__media-wrapper") ||
        document;

      // Locate the actual product-media slide even when it is currently hidden.
      // Hidden slides have a 0x0 rect, so visibility-based lookup incorrectly misses
      // the Size Guide / Side View and leaves the selected-size slide active.
      const mediaImage = [...gallery.querySelectorAll(
        ".product__media-item img, [id*='Slide-'] img, li[id*='media'] img, .slider__slide img, [data-media-id] img"
      )].find((img) => {
        if (img.hasAttribute("data-cw-frame-live-overlay")) return false;
        const d = descriptorFor(img.currentSrc || img.src);
        return !!d && d.key === descriptor.key;
      });

      const item =
        mediaImage?.closest(".product__media-item, [id*='Slide-'], li[id*='media'], .slider__slide, [data-media-id]") ||
        null;

      if (item) {
        const siblings = item.parentElement
          ? [...item.parentElement.children].filter((node) => node instanceof HTMLElement)
          : [];
        siblings.forEach((node) => {
          if (
            node.matches?.(".product__media-item, [id*='Slide-'], li[id*='media'], .slider__slide, [data-media-id]")
          ) {
            node.classList.toggle("is-active", node === item);
            if (node === item) {
              node.removeAttribute("hidden");
              node.setAttribute("aria-hidden", "false");
            } else {
              node.setAttribute("aria-hidden", "true");
            }
          }
        });

        const scroller = item.parentElement;
        if (scroller && typeof scroller.scrollTo === "function") {
          try {
            scroller.scrollTo({ left: item.offsetLeft, behavior: "auto" });
          } catch {}
        }
        try {
          item.scrollIntoView({ block: "nearest", inline: "start", behavior: "auto" });
        } catch {}
      }

      apply();
    };

    [0, 60, 160, 360, 700].forEach((delay) => setTimeout(force, delay));
  };


  const schedule = () => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    timer=setTimeout(()=>{ raf=requestAnimationFrame(apply); },60);
  };

  const bind = () => {
    const host=root();
    if (!host || host.dataset.cwFrameV4Bound==="true") return;
    host.dataset.cwFrameV4Bound="true";

    host.addEventListener("cartwala:preview-ready",(event)=>{
      if (!event.detail?.url) return;
      artworkUrl=event.detail.url;
      document.body.classList.add("cw-photo-frame-personalized");
      schedule();
      [150,350,700,1200].forEach((d)=>setTimeout(schedule,d));
    });

    document.addEventListener("click",(event)=>{
      if (!artworkUrl) return;
      const target=event.target instanceof Element?event.target:null;
      if (!target) return;

      const galleryControl = target.closest(
        '.thumbnail-list button, .thumbnail-list a, [class*="thumb" i] button, [class*="thumb" i] a, [data-thumbnail] button, [data-thumbnail] a, [data-product-thumbnails] button, [data-product-thumbnails] a, [data-thumbnails] button, [data-thumbnails] a, button[data-target], a[data-target]'
      );
      if (galleryControl) activateMediaControl(galleryControl);

      if (
        target.closest('.thumbnail-list,[class*="thumb" i],[data-thumbnail],[data-product-thumbnails],[data-thumbnails]') ||
        target.closest('.cw-photo-frame-size-picker,variant-radios,variant-selects')
      ) {
        [0,100,260,550].forEach((d)=>setTimeout(schedule,d));
      }
    },true);

    document.addEventListener("change",(event)=>{
      const target=event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        /^option[1-3]$/.test(target.getAttribute("name")||"") ||
        target.getAttribute("name")==="id" ||
        target.closest(".cw-photo-frame-size-picker")
      ) {
        [0,100,260,550].forEach((d)=>setTimeout(schedule,d));
      }
    },true);

    ["variant:change","product:variant-change","theme:variant:change","shopify:section:load"].forEach((name)=>
      document.addEventListener(name,()=>[0,120,300].forEach((d)=>setTimeout(schedule,d)))
    );

    new MutationObserver(schedule).observe(document.body,{
      childList:true,subtree:true,attributes:true,attributeFilter:["src","srcset","class","aria-hidden"]
    });
    window.addEventListener("resize",schedule,{passive:true});
    apply();
  };

  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();
})();