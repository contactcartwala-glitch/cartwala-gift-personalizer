(() => {
  const mount = () => {
    const main = document.querySelector('main#MainContent, main');
    if (!main || main.dataset.cwGalleryEditBound) return;
    main.dataset.cwGalleryEditBound = 'true';
    const style = document.createElement('style');
    style.textContent = `
      [data-cw-gallery-edit-host]{position:relative!important}
      main.cw-gallery-edit-managed .cw-ux-edit-overlay{display:none!important}
      main.cw-gallery-edit-managed .cw-gallery-edit-source{display:none!important}
      .cw-gallery-edit-button{position:absolute!important;top:12px!important;right:12px!important;left:auto!important;bottom:auto!important;z-index:30;display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 17px;border:0;border-radius:22px;background:#ff6200!important;color:#fff!important;box-shadow:0 2px 9px #0003;font-family:inherit;font-size:14px;font-weight:700;line-height:1.2;cursor:pointer;touch-action:manipulation}
      .cw-gallery-edit-button[hidden]{display:none!important}
      .cw-gallery-edit-button:focus-visible{outline:3px solid #171717;outline-offset:3px}
      @media(max-width:749px){.cw-gallery-edit-button{top:10px!important;right:10px!important;min-height:40px;padding:9px 14px;font-size:13px}}
    `;
    document.head.appendChild(style);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cw-gallery-edit-button';
    button.hidden = true;
    let source = null;
    let host = null;
    let pending = false;
    const visible = (element) => {
      if (!element || element.closest('[hidden],dialog,[role="dialog"],[data-cw-frame-original-hidden="true"]')) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
    };
    const findGallery = () => {
      for (const selector of ['.cw-frame-v7__stage', '[data-cw-clock-product-preview]:not([hidden]) .cw-clock-product-preview__stage', '.cw-mug-gallery-host', '[data-gallery-main]', '[data-product-gallery]', '.product__media-wrapper', 'media-gallery', '.product-gallery']) {
        const match = Array.from(main.querySelectorAll(selector)).find(visible);
        if (match) return match;
      }
      return null;
    };
    const update = () => {
      pending = false;
      const roots = Array.from(main.querySelectorAll('[data-cw-personalizer], [data-cw-gift-personalizer]'));
      const found = roots.map((root) => root.querySelector('[data-cw-open]')).find((element) => {
        if (!element || element.disabled || element.closest('[hidden]')) return false;
        const label = element.closest('[data-cw-personalizer], [data-cw-gift-personalizer]')?.dataset.labelEdit || 'Edit Again';
        return element.textContent.trim() === label;
      });
      const nextHost = found ? findGallery() : null;
      if (source !== found) source?.classList.remove('cw-gallery-edit-source');
      source = found || null;
      if (host !== nextHost) {
        host?.removeAttribute('data-cw-gallery-edit-host');
        host = nextHost;
        if (host) {
          host.setAttribute('data-cw-gallery-edit-host', 'true');
          host.appendChild(button);
        }
      }
      const show = Boolean(source && host);
      if (main.classList.contains('cw-gallery-edit-managed') !== show) main.classList.toggle('cw-gallery-edit-managed', show);
      if (button.hidden === show) button.hidden = !show;
      if (source?.classList.contains('cw-gallery-edit-source') !== show) source?.classList.toggle('cw-gallery-edit-source', show);
      if (show && button.textContent !== source.textContent.trim()) button.textContent = source.textContent.trim();
    };
    const schedule = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(update);
    };
    button.addEventListener('click', () => source?.click());
    new MutationObserver(schedule).observe(main, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'disabled'] });
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('cartwala:personalization-saved', schedule);
    document.addEventListener('cartwala:preview-ready', schedule);
    document.addEventListener('shopify:section:load', schedule);
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
