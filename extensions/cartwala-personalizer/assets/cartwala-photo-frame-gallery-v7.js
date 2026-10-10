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
    const frame = document.createElement('div');
    frame.className = 'cw-frame-v7__frame';
    const photo = document.createElement('img');
    photo.alt = panel.dataset.savedLabel;
    frame.appendChild(photo);
    stage.append(sample, frame);
    const caption = document.createElement('p');
    caption.className = 'cw-frame-v7__caption';
    caption.setAttribute('aria-live', 'polite');
    const thumbs = document.createElement('div');
    thumbs.className = 'cw-frame-v7__thumbs';
    const hint = document.createElement('p');
    hint.className = 'cw-frame-v7__hint';
    hint.textContent = panel.dataset.sampleLabel;
    const buttons = {};
    for (const kind of ['portrait', 'landscape']) {
      if (orientationIndex < 0 && kind === 'landscape') continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cw-frame-v7__thumb';
      button.setAttribute('aria-label', labels[kind]);
      const thumb = document.createElement('img');
      thumb.src = images[kind].replace('width=1400', 'width=200');
      thumb.width = 100;
      thumb.height = 100;
      thumb.alt = '';
      const text = document.createElement('span');
      text.textContent = labels[kind];
      button.append(thumb, text);
      button.addEventListener('click', () => {
        const value = variants.find((item) => new RegExp(kind, 'i').test(item.options[orientationIndex]))?.options[orientationIndex];
        const radio = Array.from(scope.querySelectorAll('input[type="radio"]')).find((input) => input.value === value);
        if (radio) radio.click();
        else {
          const select = Array.from(scope.querySelectorAll('select')).find((input) => Array.from(input.options).some((option) => option.value === value));
          if (select) {
            select.value = value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
      buttons[kind] = button;
      thumbs.appendChild(button);
    }
    gallery.append(stage, caption, thumbs, hint);
    const style = document.createElement('style');
    style.textContent = `
      .cw-frame-v7{width:100%;max-width:100%;min-width:0;margin-bottom:18px}
      .cw-frame-v7__stage{width:100%;aspect-ratio:1;position:relative;display:flex;align-items:center;justify-content:center;background:#f8f5ef;border-radius:12px;overflow:hidden}
      .cw-frame-v7__sample{position:absolute!important;inset:0!important;display:block;width:100%!important;height:100%!important;max-height:none!important;object-fit:contain!important}
      .cw-frame-v7__frame{position:relative;box-sizing:content-box;width:51%;aspect-ratio:2/3;border:clamp(9px,2.2vw,25px) solid #181818;box-shadow:inset 0 0 0 2px #393939,8px 12px 20px #0003;flex:none}
      .cw-frame-v7__frame[data-orientation="landscape"]{width:78%;aspect-ratio:3/2}
      .cw-frame-v7__frame img{display:block;position:absolute;inset:0;width:100%!important;height:100%!important;object-fit:contain!important;max-height:none!important}
      .cw-frame-v7 [hidden]{display:none!important}
      .cw-frame-v7__caption{margin:12px 0 10px;text-align:center;color:#242424;font-size:14px;font-weight:650}
      .cw-frame-v7__thumbs{display:flex;justify-content:center;gap:12px}
      .cw-frame-v7__thumb{width:132px;max-width:45%;display:flex;flex-direction:column;align-items:center;gap:5px;background:#fff;border:2px solid #e5e2dc;border-radius:8px;padding:6px;cursor:pointer;color:#242424}
      .cw-frame-v7__thumb[aria-pressed="true"]{border-color:#ff6200}
      .cw-frame-v7__thumb:focus-visible{outline:2px solid #171717;outline-offset:3px}
      .cw-frame-v7__thumb img{width:76px;height:76px;object-fit:contain}
      .cw-frame-v7__thumb span{font-size:12px;line-height:1.4}
      .cw-frame-v7__hint{font-size:12px;text-align:center;color:#666;margin:12px 0 0}
      body.cw-photo-frame-master-page [data-cw-personalizer] [data-cw-open].cw-ux-edit-source-hidden{display:block!important}
      [data-cw-frame-original-hidden="true"]{display:none!important}
    `;
    document.head.appendChild(style);
    original.before(gallery);
    original.dataset.cwFrameOriginalHidden = 'true';
    document.body.classList.add('cw-photo-frame-master-page');
    const render = () => {
      const kind = orientation();
      sample.src = images[kind];
      sample.alt = `${panel.dataset.galleryLabel} — ${labels[kind]}`;
      sample.hidden = Boolean(artwork);
      frame.hidden = !artwork;
      frame.dataset.orientation = kind;
      if (artwork) photo.src = artwork;
      const size = String(variant?.options?.[sizeIndex] || '').split(/x|×/i);
      const dimensions = kind === 'landscape' ? size.slice().reverse() : size;
      caption.textContent = `${labels[kind]}${dimensions.length === 2 ? ` · ${dimensions.join(' × ')} inches` : ''}`;
      hint.hidden = Boolean(artwork);
      for (const [key, button] of Object.entries(buttons)) button.setAttribute('aria-pressed', String(key === kind));
    };
    const sync = () => {
      const next = selected();
      if (!next) return;
      if (String(next.id) !== String(variant?.id)) artwork = '';
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
      setPrintDimensions();
      render();
    });
    scope.addEventListener('change', (event) => {
      if (!event.target.matches('input[type="radio"],select,[name="id"]')) return;
      sync();
    });
    sync();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  document.addEventListener('shopify:section:load', mount);
})();
