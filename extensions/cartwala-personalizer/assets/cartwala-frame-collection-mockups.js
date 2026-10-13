(() => {
  if (/\/products\//.test(location.pathname)) return;
  const data = document.querySelector('[data-cw-frame-collection]');
  if (!data) return;
  const records = [...data.querySelectorAll('[data-handle]')];
  const byHandle = new Map(records.map((record, index) => [record.dataset.handle, { ...record.dataset, index }]));
  const choose = (index, templates, orientation) => {
    const choices = templates.filter(item => item.orientation === orientation);
    return choices.length ? choices[Math.floor(index / 5) % choices.length] : null;
  };
  const start = async () => {
    let saved;
    try { saved = JSON.parse(data.dataset.mockups || 'null'); } catch { return; }
    let templates = saved?.templates;
    if (!Array.isArray(templates)) {
      try {
        const response = await fetch('https://cartwala-gift-personalizer.fly.dev/api/frame-mockup/manifest');
        if (!response.ok) return;
        templates = await response.json();
      } catch { return; }
    }
    if (!templates.length) return;
    const style = document.createElement('style');
    style.textContent = '.cw-frame-card-scene{position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none}.cw-frame-card-scene img{position:absolute!important;display:block!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important;transition:none!important}.cw-frame-card-scene .cw-frame-card-art{object-fit:cover!important}.cw-frame-card-scene .cw-frame-card-overlay{inset:0!important;width:100%!important;height:100%!important;object-fit:contain!important}';
    document.head.appendChild(style);
    const mount = () => {
      for (const link of document.querySelectorAll('#MainContent .product-card__media > a[href*="/products/"]')) {
        if (link.dataset.cwCollectionMockup) continue;
        const handle = new URL(link.href, location.href).pathname.match(/\/products\/([^/]+)/)?.[1];
        const record = byHandle.get(handle);
        const mockup = record && choose(record.index, templates, record.orientation);
        const original = link.querySelector('img');
        if (!mockup || !record.artwork || !original) continue;
        link.dataset.cwCollectionMockup = mockup.id;
        const scene = document.createElement('span'); scene.className = 'cw-frame-card-scene'; scene.setAttribute('aria-hidden', 'true'); scene.style.visibility = 'hidden';
        const art = document.createElement('img'); art.className = 'cw-frame-card-art'; art.alt = ''; art.loading = 'lazy'; art.draggable = false;
        Object.assign(art.style, { left: `${mockup.x}%`, top: `${mockup.y}%`, width: `${mockup.width}%`, height: `${mockup.height}%` });
        const overlay = document.createElement('img'); overlay.className = 'cw-frame-card-overlay'; overlay.alt = ''; overlay.loading = 'lazy'; overlay.draggable = false;
        let loaded = 0;
        const ready = () => { if (++loaded === 2) { original.style.visibility = 'hidden'; scene.style.visibility = 'visible'; } };
        const failed = () => { scene.remove(); original.style.visibility = ''; };
        art.onload = overlay.onload = ready; art.onerror = overlay.onerror = failed;
        scene.append(art, overlay); link.style.position = 'relative'; link.appendChild(scene);
        art.src = record.artwork; overlay.src = mockup.url;
      }
    };
    mount();
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; mount(); });
    }).observe(document.querySelector('#MainContent') || document.body, { childList: true, subtree: true });
    document.addEventListener('shopify:section:load', mount);
  };
  start();
})();
