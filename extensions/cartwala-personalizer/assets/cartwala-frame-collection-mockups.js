(() => {
  if (/\/products\//.test(location.pathname)) return;
  const data = document.querySelector('[data-cw-frame-collection]');
  if (!data) return;
  const records = [...data.querySelectorAll('[data-handle]')];
  const byHandle = new Map(records.map((record, index) => [record.dataset.handle, { ...record.dataset, index }]));
  const choose = (handle, templates, orientation) => {
    const choices = templates.filter(item => item.orientation === orientation);
    let selected = null, highest = -1;
    for (const item of choices) {
      let score = 2166136261;
      for (const character of `cartwala-mixed-frames|${handle}|${item.id}`) {
        score = Math.imul(score ^ character.charCodeAt(0), 16777619);
      }
      score ^= score >>> 16;
      score = Math.imul(score, 0x85ebca6b);
      score ^= score >>> 13;
      score = Math.imul(score, 0xc2b2ae35);
      score = (score ^ (score >>> 16)) >>> 0;
      if (score > highest) { highest = score; selected = item; }
    }
    return selected;
  };
  const geometry = (mockup) => {
    const width = mockup.orientation === 'Landscape' ? 75 : 50;
    const height = mockup.orientation === 'Landscape' ? 50 : 75;
    const scaleX = width / mockup.width;
    const scaleY = height / mockup.height;
    return {
      art: { left: `${50 - width / 2}%`, top: `${50 - height / 2}%`, width: `${width}%`, height: `${height}%` },
      overlay: { left: `${50 - (mockup.x + mockup.width / 2) * scaleX}%`, top: `${50 - (mockup.y + mockup.height / 2) * scaleY}%`, width: `${100 * scaleX}%`, height: `${100 * scaleY}%` }
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
    const repairedDefaults = new Map([{"id":"room-01","name":"Brick shelf","url":"https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-complete-beading-room-01.png?v=1791959548","orientation":"Portrait","x":27.27272727272727,"y":11.084529505582138,"width":45.85326953748006,"height":63.79585326953748},{"id":"room-02","name":"Industrial concrete","url":"https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-complete-beading-room-02.png?v=1791959534","orientation":"Portrait","x":29.106858054226475,"y":11.323763955342903,"width":42.10526315789473,"height":59.88835725677831},{"id":"room-03","name":"Marble luxury","url":"https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-complete-beading-room-03.png?v=1791959560","orientation":"Portrait","x":28.4688995215311,"y":10.76555023923445,"width":43.0622009569378,"height":64.5933014354067},{"id":"room-04","name":"Walnut living room","url":"https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-complete-beading-room-04.png?v=1791959673","orientation":"Portrait","x":29.106858054226475,"y":9.808612440191387,"width":41.706539074960126,"height":62.44019138755981},{"id":"room-05","name":"Library","url":"https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-complete-beading-room-05.png?v=1791959579","orientation":"Portrait","x":30.063795853269536,"y":10.127591706539075,"width":40.03189792663477,"height":57.73524720893142},{"id":"room-06","name":"Bohemian rattan","url":"https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-complete-beading-room-06.png?v=1791959609","orientation":"Portrait","x":31.658692185007975,"y":13.31738437001595,"width":36.76236044657097,"height":54.54545454545454},{"id":"room-07","name":"Navy lounge","url":"https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-complete-beading-room-07.png?v=1791959625","orientation":"Portrait","x":27.67145135566188,"y":10.287081339712918,"width":44.73684210526316,"height":66.4274322169059},{"id":"room-08","name":"Terracotta","url":"https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-complete-beading-room-08.png?v=1791959592","orientation":"Portrait","x":29.505582137161085,"y":13.157894736842104,"width":40.98883572567783,"height":58.69218500797449},{"id":"room-09","name":"Window desk","url":"https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-complete-beading-room-09.png?v=1791959640","orientation":"Portrait","x":29.1866028708134,"y":14.992025518341306,"width":46.01275917065391,"height":64.83253588516746},{"id":"room-10","name":"Minimal gallery","url":"https://cdn.shopify.com/s/files/1/0803/7931/4361/files/cartwala-complete-beading-room-10.png?v=1791959656","orientation":"Portrait","x":30.22328548644338,"y":9.569377990430622,"width":39.633173843700156,"height":56.29984051036683}].map(item => [item.id, item]));
    templates = templates.map(item => item.url.startsWith(`https://cartwala-gift-personalizer.fly.dev/api/frame-mockup/${item.id}`) && repairedDefaults.has(item.id) ? repairedDefaults.get(item.id) : item);
    if (!templates.length) return;
    const style = document.createElement('style');
    style.textContent = '.cw-frame-card-scene{position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none}.cw-frame-card-scene img{position:absolute!important;display:block!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important;transition:none!important}.cw-frame-card-scene .cw-frame-card-art{object-fit:cover!important}.cw-frame-card-scene .cw-frame-card-overlay{object-fit:fill!important}';
    document.head.appendChild(style);
    const mount = () => {
      const links = [...document.querySelectorAll('#MainContent .product-card__media > a[href*="/products/"]')];
      const masterHandle = 'customized-photo-frame-black-beading';
      for (const link of links) {
        if (link.dataset.cwCollectionMockup) continue;
        const handle = new URL(link.href, location.href).pathname.match(/\/products\/([^/]+)/)?.[1];
        const record = byHandle.get(handle);
        const mockup = record && choose(handle, templates, record.orientation);
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
