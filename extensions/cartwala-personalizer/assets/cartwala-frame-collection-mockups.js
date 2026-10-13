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
  const geometry = (mockup) => {
    const width = mockup.orientation === 'Landscape' ? 63 : 42;
    const height = mockup.orientation === 'Landscape' ? 42 : 63;
    const scaleX = width / mockup.width;
    const scaleY = height / mockup.height;
    return {
      art: { left: `${50 - width / 2}%`, top: `${48 - height / 2}%`, width: `${width}%`, height: `${height}%` },
      overlay: { left: `${50 - (mockup.x + mockup.width / 2) * scaleX}%`, top: `${48 - (mockup.y + mockup.height / 2) * scaleY}%`, width: `${100 * scaleX}%`, height: `${100 * scaleY}%` }
    };
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
    style.textContent = '.cw-frame-card-scene{position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none}.cw-frame-card-scene img{position:absolute!important;display:block!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important;transition:none!important}.cw-frame-card-scene .cw-frame-card-art{object-fit:cover!important}.cw-frame-card-scene .cw-frame-card-overlay{object-fit:fill!important}';
    document.head.appendChild(style);
    const mount = () => {
      const links = [...document.querySelectorAll('#MainContent .product-card__media > a[href*="/products/"]')];
      const masterHandle = 'customized-photo-frame-black-beading';
      const orderedHandles = [...new Set(links.map(link => new URL(link.href, location.href).pathname.match(/\/products\/([^/]+)/)?.[1]).filter(handle => handle !== masterHandle && byHandle.has(handle)))];
      for (const link of links) {
        if (link.dataset.cwCollectionMockup) continue;
        const handle = new URL(link.href, location.href).pathname.match(/\/products\/([^/]+)/)?.[1];
        const record = byHandle.get(handle);
        const mockup = record && choose(handle === masterHandle ? 0 : orderedHandles.indexOf(handle), templates, record.orientation);
        const original = link.querySelector('img');
        if (!mockup || !record.artwork || !original) continue;
        link.dataset.cwCollectionMockup = mockup.id;
        const scene = document.createElement('span'); scene.className = 'cw-frame-card-scene'; scene.setAttribute('aria-hidden', 'true'); scene.style.visibility = 'hidden';
        const art = document.createElement('img'); art.className = 'cw-frame-card-art'; art.alt = ''; art.loading = 'lazy'; art.draggable = false;
        const layout = geometry(mockup);
        Object.assign(art.style, layout.art);
        let artworkLayer = art;
        if (handle === masterHandle) {
          const viewport = document.createElement('span');
          Object.assign(viewport.style, layout.art, { position: 'absolute', overflow: 'hidden' });
          // The master image includes a frame and wall. Show only its inner
          // photograph so the collection overlay supplies one consistent frame.
          Object.assign(art.style, { left: '-47.65625%', top: '-15.234375%', width: '195.3125%', height: '130.208333%' });
          viewport.appendChild(art);
          artworkLayer = viewport;
        }
        const overlay = document.createElement('img'); overlay.className = 'cw-frame-card-overlay'; overlay.alt = ''; overlay.loading = 'lazy'; overlay.draggable = false;
        Object.assign(overlay.style, layout.overlay);
        let loaded = 0;
        const ready = () => { if (++loaded === 2) { original.style.visibility = 'hidden'; scene.style.visibility = 'visible'; } };
        const failed = () => { scene.remove(); original.style.visibility = ''; };
        art.onload = overlay.onload = ready; art.onerror = overlay.onerror = failed;
        scene.append(artworkLayer, overlay); link.style.position = 'relative'; link.appendChild(scene);
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
