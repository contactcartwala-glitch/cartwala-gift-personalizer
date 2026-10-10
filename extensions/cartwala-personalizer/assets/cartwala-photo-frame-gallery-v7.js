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
    const orientationIndex = options.findIndex((name) => name.toLowerCase() === 'orientation');
    const sizeIndex = options.findIndex((name) => name.toLowerCase() === 'size');
    const images = {
      portrait: 'https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-black-beading-frame-portrait-2x3.png?v=1791608460&width=1400',
      landscape: 'https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-black-beading-frame-landscape-3x2.png?v=1791608451&width=1400'
    };
    const labels = { portrait: panel.dataset.portraitLabel, landscape: panel.dataset.landscapeLabel };
    const optionValue = (name, index) => {
      const radio = scope.querySelector(`input[name="option${index + 1}"]:checked, input[name="options[${CSS.escape(name)}]"]:checked`);
      if (radio) return radio.value;
      const select = scope.querySelector(`select[name="option${index + 1}"], select[name="options[${CSS.escape(name)}]"]`);
      return select?.value;
    };
    const selected = () => {
      const values = options.map(optionValue);
      if (values.every(Boolean)) {
        const found = variants.find((variant) => variant.options.every((value, index) => value === values[index]));
        if (found) return found;
      }
      const id = scope.querySelector('form[action*="/cart/add"] [name="id"]')?.value || panel.dataset.selectedVariant;
      return variants.find((variant) => String(variant.id) === String(id)) || variants[0];
    };
    let variant = selected();
    let artwork = '';
    let view = 'product';
    const orientation = () => /landscape/i.test(variant?.options?.[orientationIndex] || '') ? 'landscape' : 'portrait';
    const setPrintDimensions = () => {
      const form = scope.querySelector('form[action*="/cart/add"]');
      const size = String(variant?.options?.[sizeIndex] || '').split(/x|×/i).map(Number);
      if (!form || size.length !== 2 || !size.every((value) => value > 0)) return;
      const dimensions = orientation() === 'landscape' ? size.slice().reverse() : size;
      for (const [key, value] of Object.entries({
        '_Cartwala Print Width': dimensions[0],
        '_Cartwala Print Height': dimensions[1],
        '_Cartwala Frame Orientation': orientation()
      })) {
        let input = form.querySelector(`[name="properties[${key}]"]`);
        if (!input) {
          input = document.createElement('input');
          input.type = 'hidden';
          input.name = `properties[${key}]`;
          input.dataset.cwFrameProperty = 'true';
          form.appendChild(input);
        }
        input.value = String(value);
      }
    };
    const gallery = document.createElement('section');
    gallery.className = 'cw-frame-v7';
    gallery.setAttribute('aria-label', panel.dataset.galleryLabel);
    gallery.dataset.cwFrameV7 = 'true';
    const stage = document.createElement('div');
    stage.className = 'cw-frame-v7__stage';
    const sample = document.createElement('img');
    sample.className = 'cw-frame-v7__sample';
    sample.width = 1254;
    sample.height = 1254;
    sample.fetchPriority = 'high';
    const room = document.createElement('img');
    room.className = 'cw-frame-v7__room';
    room.src = 'https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-frame-size-room-background.png?v=1791610937&width=1400';
    room.alt = '';
    room.width = room.height = 1254;
    const frame = document.createElement('div');
    frame.className = 'cw-frame-v7__frame';
    const samplePhoto = document.createElement('div');
    samplePhoto.className = 'cw-frame-v7__sample-photo';
    const photo = document.createElement('img');
    photo.alt = panel.dataset.savedLabel;
    frame.append(samplePhoto, photo);
    const sizeLabel = document.createElement('p');
    sizeLabel.className = 'cw-frame-v7__size';
    sizeLabel.setAttribute('aria-live', 'polite');
    stage.append(sample, room, frame, sizeLabel);
    const thumbs = document.createElement('div');
    thumbs.className = 'cw-frame-v7__thumbs';
    const hint = document.createElement('p');
    hint.className = 'cw-frame-v7__hint';
    hint.textContent = panel.dataset.sampleLabel;
    const buttons = {};
    for (const kind of ['product', 'room']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cw-frame-v7__thumb';
      button.setAttribute('aria-label', kind === 'product' ? panel.dataset.productLabel : panel.dataset.roomLabel);
      const thumb = document.createElement('img');
      thumb.width = thumb.height = 76;
      thumb.alt = '';
      thumb.src = kind === 'product' ? images[orientation()].replace('width=1400', 'width=200') : room.src.replace('width=1400', 'width=200');
      const text = document.createElement('span');
      text.textContent = kind === 'product' ? panel.dataset.productLabel : panel.dataset.roomLabel;
      button.append(thumb, text);
      button.addEventListener('click', () => { view = kind; render(); });
      buttons[kind] = button;
      thumbs.appendChild(button);
    }
    gallery.append(stage, thumbs, hint);
    const style = document.createElement('style');
    style.textContent = `
      .cw-frame-v7{width:100%;max-width:100%;min-width:0;margin-bottom:18px}
      .cw-frame-v7__stage{width:100%;aspect-ratio:1;position:relative;container-type:inline-size;background:#f8f5ef;border-radius:12px;overflow:hidden}
      .cw-frame-v7__sample,.cw-frame-v7__room{position:absolute!important;inset:0!important;display:block;width:100%!important;height:100%!important;max-height:none!important;object-fit:contain!important}
      .cw-frame-v7__frame{position:absolute;box-sizing:content-box;left:45%;top:31.5%;transform:translate(-50%,-50%);border:.85cqw solid #181818;box-shadow:inset 0 0 0 1px #393939,.5cqw .75cqw 1.2cqw #0005;transition:width .25s ease,height .25s ease}
      .cw-frame-v7__frame img,.cw-frame-v7__sample-photo{display:block;position:absolute;inset:0;width:100%!important;height:100%!important;object-fit:cover!important;max-height:none!important;background-repeat:no-repeat;background-position:50% 50%}
      .cw-frame-v7__sample-photo{background-size:auto 130%}
      .cw-frame-v7__frame[data-orientation="landscape"] .cw-frame-v7__sample-photo{background-size:123% auto;background-position:50% 49%}
      .cw-frame-v7__size{position:absolute;top:1.4%;left:50%;transform:translateX(-50%);margin:0;padding:.7cqw 3cqw;border-radius:20cqw;background:#35291fee;color:#fff;font-size:4.6cqw;font-weight:750;line-height:1.35;white-space:nowrap}
      .cw-frame-v7 [hidden]{display:none!important}
      .cw-frame-v7__thumbs{display:flex;justify-content:center;gap:10px;margin-top:12px}
      .cw-frame-v7__thumb{width:100px;max-width:45%;display:flex;flex-direction:column;align-items:center;gap:5px;background:#fff;border:2px solid #e5e2dc;border-radius:8px;padding:5px;cursor:pointer;color:#242424}
      .cw-frame-v7__thumb[aria-pressed="true"]{border-color:#ff6200}
      .cw-frame-v7__thumb:focus-visible{outline:2px solid #171717;outline-offset:3px}
      .cw-frame-v7__thumb img{width:62px;height:62px;object-fit:contain}
      .cw-frame-v7__thumb span{font-size:11px;line-height:1.4}
      .cw-frame-v7__hint{font-size:12px;text-align:center;color:#666;margin:10px 0 0}
      [data-cw-frame-original-hidden="true"]{display:none!important}
      @media(prefers-reduced-motion:reduce){.cw-frame-v7__frame{transition:none}}
    `;
    document.head.appendChild(style);
    original.before(gallery);
    original.dataset.cwFrameOriginalHidden = 'true';
    document.body.classList.add('cw-photo-frame-master-page');
    const render = () => {
      const kind = orientation();
      const isRoom = view === 'room';
      sample.src = images[kind];
      sample.alt = panel.dataset.galleryLabel;
      sample.hidden = isRoom;
      room.hidden = frame.hidden = sizeLabel.hidden = !isRoom;
      frame.dataset.orientation = kind;
      photo.hidden = !artwork;
      samplePhoto.hidden = Boolean(artwork);
      samplePhoto.style.backgroundImage = `url("${images[kind]}")`;
      if (artwork) photo.src = artwork;
      const size = String(variant?.options?.[sizeIndex] || '8x12').split(/x|×/i).map(Number);
      const dimensions = kind === 'landscape' ? size.slice().reverse() : size;
      frame.style.width = `${dimensions[0] * 1.15}%`;
      frame.style.height = `${dimensions[1] * 1.15}%`;
      sizeLabel.textContent = `${dimensions.join(' × ')} in`;
      frame.setAttribute('aria-label', `${panel.dataset.galleryLabel}, ${dimensions.join(' × ')} inches`);
      hint.hidden = Boolean(artwork);
      buttons.product.querySelector('img').src = images[kind].replace('width=1400', 'width=200');
      for (const [key, button] of Object.entries(buttons)) button.setAttribute('aria-pressed', String(key === view));
    };
    const sync = () => {
      const next = selected();
      if (!next) return;
      const nextOrientation = /landscape/i.test(next.options[orientationIndex] || '') ? 'landscape' : 'portrait';
      if (nextOrientation !== orientation()) artwork = '';
      variant = next;
      panel.dataset.selectedVariant = String(variant.id);
      setPrintDimensions();
      host.dispatchEvent(new CustomEvent('cw:photo-frame-selection', {
        detail: { variantId: String(variant.id), ratio: orientation() === 'landscape' ? '3:2' : '2:3' }
      }));
      render();
    };
    host.addEventListener('cw:photo-frame-ready', sync);
    host.addEventListener('cartwala:preview-ready', (event) => {
      if (!event.detail?.url) return;
      artwork = event.detail.url;
      view = 'room';
      setPrintDimensions();
      render();
    });
    scope.addEventListener('change', (event) => {
      if (!event.target.matches('input[type="radio"],select,[name="id"]')) return;
      view = 'room';
      sync();
    });
    sync();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  document.addEventListener('shopify:section:load', mount);
})();
