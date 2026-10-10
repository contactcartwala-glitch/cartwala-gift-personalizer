(() => {
  const mount = () => {
    const host = document.querySelector('[data-cw-personalizer][data-cw-photo-frame-master="true"]');
    const panel = host?.querySelector('[data-cw-photo-frame-data]');
    if (!panel || panel.dataset.bound === 'true') return;
    const original = document.querySelector('.product-gallery, media-gallery, [id^="MediaGallery-"], .product__media-wrapper, .product-media, [data-product-gallery]');
    if (!original) return;
    panel.dataset.bound = 'true';
    const variants = JSON.parse(panel.dataset.variants || '[]');
    const options = JSON.parse(panel.dataset.options || '[]');
    const scope = host.closest('.shopify-section') || document;
    const orientationIndex = options.findIndex(name => name.toLowerCase() === 'orientation');
    const sizeIndex = options.findIndex(name => name.toLowerCase() === 'size');
    const fixedOrientation = panel.dataset.fixedOrientation || '';
    const images = {
      portrait: 'https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-black-beading-frame-portrait-2x3.png?v=1791608460&width=1400',
      landscape: 'https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-black-beading-frame-landscape-3x2.png?v=1791608451&width=1400'
    };
    const roomUrl = 'https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-frame-size-room-background.png?v=1791610937&width=1400';
    const optionValue = (name, index) => {
      const radio = scope.querySelector(`input[name="option${index + 1}"]:checked, input[name="options[${CSS.escape(name)}]"]:checked`);
      return radio?.value || scope.querySelector(`select[name="option${index + 1}"], select[name="options[${CSS.escape(name)}]"]`)?.value;
    };
    const selected = () => {
      const values = options.map(optionValue);
      if (values.every(Boolean)) {
        const found = variants.find(v => v.options.every((value, index) => value === values[index]));
        if (found) return found;
      }
      const id = scope.querySelector('form[action*="/cart/add"] [name="id"]')?.value || panel.dataset.selectedVariant;
      return variants.find(v => String(v.id) === String(id)) || variants[0];
    };
    let variant = selected();
    let artwork = '';
    const design = panel.dataset.designImage || '';
    const orientation = () => /landscape/i.test(fixedOrientation || variant?.options?.[orientationIndex] || '') ? 'landscape' : 'portrait';
    const dimensions = (size) => {
      const values = String(size || '8x12').match(/\d+(?:\.\d+)?/g)?.slice(0, 2).map(Number) || [8, 12];
      const short = Math.min(...values), long = Math.max(...values);
      return orientation() === 'landscape' ? [long, short] : [short, long];
    };
    const setPrintDimensions = () => {
      const form = scope.querySelector('form[action*="/cart/add"]');
      if (!form) return;
      const [width, height] = dimensions(variant?.options?.[sizeIndex]);
      for (const [key, value] of Object.entries({ '_Cartwala Print Width': width, '_Cartwala Print Height': height, '_Cartwala Frame Orientation': orientation() })) {
        let input = form.querySelector(`[name="properties[${key}]"]`);
        if (!input) {
          input = document.createElement('input'); input.type = 'hidden';
          input.name = `properties[${key}]`; input.dataset.cwFrameProperty = 'true'; form.appendChild(input);
        }
        input.value = String(value);
      }
    };
    const gallery = document.createElement('section');
    gallery.className = 'cw-frame-v7'; gallery.dataset.cwFrameV7 = 'true';
    gallery.setAttribute('aria-label', panel.dataset.galleryLabel);
    const stage = document.createElement('div'); stage.className = 'cw-frame-v7__stage';
    const track = document.createElement('div'); track.className = 'cw-frame-v7__track'; track.tabIndex = 0;
    track.setAttribute('aria-label', panel.dataset.galleryLabel);
    const frames = [];
    const makeFrame = (parent, className = '') => {
      const frame = document.createElement('div'); frame.className = `cw-frame-v7__frame ${className}`;
      const sample = document.createElement('div'); sample.className = 'cw-frame-v7__sample-photo';
      const photo = document.createElement('img'); photo.alt = panel.dataset.savedLabel; photo.draggable = false;
      frame.append(sample, photo); parent.appendChild(frame); frames.push({ frame, sample, photo }); return frame;
    };
    const makeSlide = (kind, label) => {
      const slide = document.createElement('div'); slide.className = `cw-frame-v7__slide cw-frame-v7__slide--${kind}`;
      slide.dataset.frameView = kind; slide.setAttribute('role', 'group'); slide.setAttribute('aria-label', label);
      track.appendChild(slide); return slide;
    };
    const roomSlide = makeSlide('room', panel.dataset.roomLabel);
    const room = document.createElement('img'); room.className = 'cw-frame-v7__room'; room.src = roomUrl;
    room.alt = ''; room.width = room.height = 1254; room.fetchPriority = 'high'; room.draggable = false;
    roomSlide.appendChild(room);
    const roomFrame = makeFrame(roomSlide, 'cw-frame-v7__frame--room');
    const sizeLabel = document.createElement('p'); sizeLabel.className = 'cw-frame-v7__size'; sizeLabel.setAttribute('aria-live', 'polite'); roomSlide.appendChild(sizeLabel);
    const productSlide = makeSlide('product', panel.dataset.productLabel);
    const productImage = document.createElement('img'); productImage.className = 'cw-frame-v7__sample'; productImage.alt = panel.dataset.productLabel;
    productImage.width = productImage.height = 1254; productImage.loading = 'lazy'; productImage.draggable = false; productSlide.appendChild(productImage);
    const productFrame = makeFrame(productSlide, 'cw-frame-v7__frame--product');
    const guideSlide = makeSlide('guide', panel.dataset.guideLabel);
    const guideTitle = document.createElement('h3'); guideTitle.textContent = panel.dataset.guideLabel; guideSlide.appendChild(guideTitle);
    const guide = document.createElement('div'); guide.className = 'cw-frame-v7__guide'; guideSlide.appendChild(guide);
    const sizes = [...new Set(variants.map(v => v.options[sizeIndex]))];
    const guideFrames = sizes.map(size => {
      const cell = document.createElement('div'); cell.className = 'cw-frame-v7__guide-cell';
      const holder = document.createElement('div'); holder.className = 'cw-frame-v7__guide-holder';
      const frame = makeFrame(holder); const label = document.createElement('span');
      cell.append(holder, label); guide.appendChild(cell); return { size, frame, label };
    });
    const sideSlide = makeSlide('side', panel.dataset.sideLabel);
    const sideFrame = makeFrame(sideSlide, 'cw-frame-v7__frame--side');
    const counter = document.createElement('span'); counter.className = 'cw-frame-v7__counter'; counter.setAttribute('aria-live', 'polite');
    const arrows = [-1, 1].map(direction => {
      const button = document.createElement('button'); button.type = 'button';
      button.className = `cw-frame-v7__arrow cw-frame-v7__arrow--${direction === 1 ? 'next' : 'previous'}`;
      button.setAttribute('aria-label', direction === 1 ? panel.dataset.nextLabel : panel.dataset.previousLabel);
      button.textContent = direction === 1 ? '›' : '‹';
      button.addEventListener('click', () => show(current + direction)); return button;
    });
    stage.append(track, ...arrows, counter); gallery.appendChild(stage);
    const description = scope.querySelector('.cartwala-frame-details, [data-tab-panel="description"], [data-product-description], .product-description, .product__description, .product-tabs__panel .rte, #tab-description');
    const descriptionPreview = document.createElement('figure'); descriptionPreview.className = 'cw-frame-v7__description';
    descriptionPreview.dataset.cwFrameDescription = 'true';
    descriptionPreview.setAttribute('aria-label', panel.dataset.savedLabel);
    const descriptionFrame = makeFrame(descriptionPreview, 'cw-frame-v7__frame--description');
    const descriptionLabel = document.createElement('figcaption'); descriptionPreview.appendChild(descriptionLabel);
    if (description) description.prepend(descriptionPreview);
    const style = document.createElement('style');
    style.textContent = `
      .cw-frame-v7{width:100%;max-width:100%;min-width:0;margin-bottom:18px}
      .cw-frame-v7__stage,.cw-frame-v7__description{width:100%;aspect-ratio:1;position:relative;container-type:inline-size;background:#f6f2eb;border-radius:12px;overflow:hidden}
      .cw-frame-v7__track{display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;width:100%;height:100%;overscroll-behavior-x:contain;touch-action:pan-x pan-y}
      .cw-frame-v7__track::-webkit-scrollbar{display:none}
      .cw-frame-v7__track:focus-visible{outline:2px solid #ff6200;outline-offset:-3px}
      .cw-frame-v7__slide{position:relative;flex:0 0 100%;height:100%;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;user-select:none}
      .cw-frame-v7__sample,.cw-frame-v7__room{position:absolute!important;inset:0!important;display:block;width:100%!important;height:100%!important;max-height:none!important;object-fit:contain!important;pointer-events:none}
      .cw-frame-v7__frame{position:relative;box-sizing:content-box;border:.85cqw solid #181818;box-shadow:inset 0 0 0 1px #393939,.5cqw .75cqw 1.2cqw #0005;overflow:hidden;background:#faf8f4;transition:width .25s ease,height .25s ease}
      .cw-frame-v7__frame--room{position:absolute;left:45%;top:31.5%;transform:translate(-50%,-50%)}
      .cw-frame-v7__frame img,.cw-frame-v7__sample-photo{display:block;position:absolute;inset:0;width:100%!important;height:100%!important;object-fit:cover!important;max-height:none!important;background-repeat:no-repeat;background-position:50% 50%;pointer-events:none}
      .cw-frame-v7__sample-photo{background-size:auto 130%}
      .cw-frame-v7__frame[data-orientation="landscape"] .cw-frame-v7__sample-photo{background-size:123% auto;background-position:50% 49%}
      .cw-frame-v7__frame--product,.cw-frame-v7__frame--side,.cw-frame-v7__frame--description{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);border-width:1.7cqw;box-shadow:1cqw 1.5cqw 2.2cqw #0005}
      .cw-frame-v7__frame--side{transform:translate(-50%,-50%) perspective(900px) rotateY(-22deg) rotateZ(3deg);box-shadow:1.3cqw .25cqw 0 #080808,2cqw 2cqw 3cqw #0004}
      .cw-frame-v7__size{position:absolute;top:1.4%;left:50%;transform:translateX(-50%);margin:0;padding:.7cqw 3cqw;border-radius:20cqw;background:#35291fee;color:#fff;font-size:4.6cqw;font-weight:750;line-height:1.35;white-space:nowrap}
      .cw-frame-v7 [hidden],.cw-frame-v7__description [hidden]{display:none!important}
      .cw-frame-v7__arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:4;width:36px;height:42px;display:grid;place-items:center;padding:0;border:0;border-radius:20px;background:#ffffffda;color:#222;font:30px/1 sans-serif;box-shadow:0 1px 4px #0002;cursor:pointer}
      .cw-frame-v7__arrow--previous{left:10px}.cw-frame-v7__arrow--next{right:10px}
      .cw-frame-v7__counter{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);padding:4px 12px;border-radius:20px;background:#ffffffdb;color:#222;font-size:12px;pointer-events:none}
      .cw-frame-v7__slide--guide h3{margin:6% 12% 0;text-align:center;font-size:5cqw;color:#28221d}
      .cw-frame-v7__guide{position:absolute;left:5%;right:5%;top:15%;bottom:10%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:4%}
      .cw-frame-v7__guide-cell{display:flex;flex-direction:column;min-width:0;justify-content:flex-end;align-items:center;gap:2cqw}
      .cw-frame-v7__guide-holder{width:100%;height:100%;display:flex;align-items:flex-end;justify-content:center}
      .cw-frame-v7__guide .cw-frame-v7__frame{border-width:.35cqw;flex:none}
      .cw-frame-v7__guide-cell>span{font-size:2.8cqw;white-space:nowrap;color:#332a22}
      .cw-frame-v7__description{margin:0 0 24px;max-width:680px}
      .cw-frame-v7__description figcaption{position:absolute;bottom:4%;width:100%;text-align:center;font-size:3cqw;color:#51473c}
      [data-cw-frame-original-hidden="true"]{display:none!important}
      @media(max-width:600px){.cw-frame-v7__arrow{width:30px;height:36px;font-size:26px}.cw-frame-v7__arrow--previous{left:6px}.cw-frame-v7__arrow--next{right:6px}}
      @media(prefers-reduced-motion:reduce){.cw-frame-v7__frame{transition:none}}
    `;
    document.head.appendChild(style); original.before(gallery); original.dataset.cwFrameOriginalHidden = 'true';
    document.body.classList.add('cw-photo-frame-master-page');
    let current = 0;
    const count = track.children.length;
    const updateCounter = () => { current = Math.max(0, Math.min(count - 1, Math.round(track.scrollLeft / (track.clientWidth || 1)))); counter.textContent = `${current + 1} / ${count}`; };
    const show = index => { current = (index + count) % count; track.scrollTo({ left: current * track.clientWidth, behavior: 'instant' }); updateCounter(); };
    track.addEventListener('scroll', updateCounter, { passive: true });
    track.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); show(current + (event.key === 'ArrowRight' ? 1 : -1));
    });
    let drag;
    track.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY };
      track.setPointerCapture(event.pointerId);
    });
    track.addEventListener('pointerup', event => {
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y; drag = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) show(current + (dx < 0 ? 1 : -1));
    });
    track.addEventListener('pointercancel', () => { drag = null; });
    const render = () => {
      const kind = orientation(); const url = artwork || design;
      const [width, height] = dimensions(variant?.options?.[sizeIndex]);
      productImage.src = images[kind]; productImage.hidden = Boolean(url); productFrame.hidden = !url;
      for (const { frame, sample, photo } of frames) {
        frame.dataset.orientation = kind; sample.hidden = Boolean(url); photo.hidden = !url;
        sample.style.backgroundImage = `url("${images[kind]}")`; if (url) photo.src = url;
      }
      roomFrame.style.width = `${width * 1.15}%`; roomFrame.style.height = `${height * 1.15}%`;
      const caption = `${width} × ${height} in`; sizeLabel.textContent = caption;
      roomFrame.setAttribute('aria-label', `${panel.dataset.galleryLabel}, ${caption}`);
      for (const frame of [productFrame, sideFrame, descriptionFrame]) {
        frame.style.width = kind === 'landscape' ? '78%' : '52%'; frame.style.height = kind === 'landscape' ? '52%' : '78%';
      }
      const maxDimension = Math.max(...sizes.flatMap(size => dimensions(size)));
      for (const item of guideFrames) {
        const [w, h] = dimensions(item.size);
        item.frame.style.width = `${w / maxDimension * 27}cqw`;
        item.frame.style.height = `${h / maxDimension * 27}cqw`;
        item.label.textContent = `${w} × ${h}`;
      }
      descriptionLabel.textContent = artwork ? panel.dataset.savedLabel : panel.dataset.sampleLabel;
      updateCounter();
    };
    const sync = () => {
      const next = selected(); if (!next) return;
      const nextOrientation = /landscape/i.test(fixedOrientation || next.options[orientationIndex] || '') ? 'landscape' : 'portrait';
      if (nextOrientation !== orientation()) artwork = '';
      variant = next; panel.dataset.selectedVariant = String(variant.id); setPrintDimensions();
      host.dispatchEvent(new CustomEvent('cw:photo-frame-selection', { detail: { variantId: String(variant.id), ratio: orientation() === 'landscape' ? '3:2' : '2:3' } }));
      render();
    };
    host.addEventListener('cw:photo-frame-ready', sync);
    host.addEventListener('cartwala:preview-ready', event => {
      if (!event.detail?.url) return; artwork = event.detail.url; setPrintDimensions(); render(); show(0);
    });
    scope.addEventListener('change', event => {
      if (!event.target.matches('input[type="radio"],select,[name="id"]') || host.contains(event.target)) return;
      sync(); show(0);
    });
    sync();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
  document.addEventListener('shopify:section:load', mount);
})();
