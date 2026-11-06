(async () => {
  'use strict';
  const dialog = document.querySelector('[data-cw-cod-review]');
  if (!dialog || dialog.dataset.ready || !window.HTMLDialogElement || typeof dialog.showModal !== 'function') return;
  const labels = JSON.parse(dialog.querySelector('script[type="application/json"]').textContent);
  const base = window.Shopify?.routes?.root || '/';
  const endpoint = `${base}apps/cartwala-signature-day-1/native-cod`;
  const storageKey = 'cartwala-native-cod-review-v1';
  const form = dialog.querySelector('form'), status = dialog.querySelector('[role="status"]');
  const next = dialog.querySelector('[data-cod-next]'), recheck = dialog.querySelector('[data-cod-recheck]');
  const address = dialog.querySelector('[data-cod-address]');
  const radios = [...dialog.querySelectorAll('input[name="cw_cod_choice"]')];
  const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n / 100);
  let config, cart, cartKey = '', origin, loading = false, bypass = false, leaving = false, operation = 0;
  let access = '', invoice = '', requestKey = '', confirmed = false, blocked = false;
  async function configuration() {
    const response = await fetch(`${base}apps/cartwala-signature-day-1/cod-review`, {
      cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error();
    const value = await response.json();
    if (value.available !== true || value.themeId !== dialog.dataset.themeId ||
      typeof value.enabled !== 'boolean' || !Number.isInteger(value.advancePercent) || value.advancePercent < 10 ||
      value.advancePercent > 50 || !Number.isSafeInteger(value.codFeePaise) || value.codFeePaise < 0 || value.codFeePaise > 1000000) throw new Error();
    let native;
    try {
      const result = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(8000) });
      if (result.ok) native = await result.json();
    } catch { /* Normal prepaid checkout remains available. */ }
    return { ...value, canPay: native?.checkoutAvailable === true && native.enabled === true &&
      native.revision === value.revision && native.advancePercent === value.advancePercent && native.codFeePaise === value.codFeePaise };
  }
  try { config = await configuration(); } catch { return; }
  // Install the listener even when OFF so an already-open preview can observe a later ON.
  const isCod = () => radios.some(r => r.value === 'cod' && r.checked);
  function setChoice() {
    const cod = isCod();
    address.hidden = !cod;
    address.querySelectorAll('input,select').forEach(el => { el.disabled = !cod || loading || confirmed || blocked; });
    dialog.querySelector('[data-cod-breakdown]').hidden = !cod;
    recheck.hidden = !(access || requestKey);
    recheck.disabled = loading;
    next.disabled = loading || leaving || (cod && ((!config.canPay && !confirmed) || blocked || !cart));
    next.textContent = !cod ? labels.continue_prepaid : !config.canPay ? labels.not_connected : confirmed ? labels.confirm_cod : labels.continue_cod;
  }
  function close() {
    if (loading) return;
    operation++;
    dialog.close();
    if (origin?.element?.isConnected) origin.element.focus();
  }
  function resume() {
    if (!origin || leaving || loading) return;
    leaving = true;
    dialog.close();
    bypass = true;
    if (origin.form) {
      try { origin.form.requestSubmit(origin.submitter || undefined); }
      finally { bypass = false; leaving = false; }
    } else window.location.assign(origin.href);
  }
  function renderAmounts(a) {
    for (const [key, value] of Object.entries(a)) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error();
      dialog.querySelectorAll(`[data-cod-${key}]`).forEach(el => { el.textContent = money(value); });
    }
    dialog.querySelector('[data-cod-percent]').textContent = `${config.advancePercent}%`;
    dialog.querySelector('[data-cod-amounts]').hidden = false;
  }
  const cartFingerprint = c => JSON.stringify(c.items.map(i => [i.key, i.variant_id, i.quantity, i.final_line_price, i.properties]));
  async function readCart() {
    const response = await fetch(`${base}cart.js`, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error();
    const c = await response.json();
    if (!Number.isSafeInteger(c.total_price) || c.total_price < 1 || !c.items?.length || c.currency !== 'INR') throw new Error();
    return c;
  }
  function showItems(c) {
    const list = dialog.querySelector('[data-cod-items]');
    list.replaceChildren();
    for (const item of c.items) {
      const li = document.createElement('li'), image = document.createElement('img');
      const title = document.createElement('span'), amount = document.createElement('strong');
      const src = item.featured_image?.url || item.image;
      if (src) {
        const url = new URL(src, location.origin);
        if (url.protocol === 'https:' && (url.hostname === location.hostname || url.hostname === 'cdn.shopify.com')) {
          image.src = url.toString(); image.alt = ''; image.loading = 'lazy'; li.append(image);
        }
      }
      title.textContent = `${item.product_title || item.title} × ${item.quantity}`;
      amount.textContent = money(item.final_line_price);
      li.append(title, amount); list.append(li);
    }
    dialog.querySelector('[data-cod-discount]').textContent = money(c.total_discount || 0);
  }
  function readRecovery() {
    access = sessionStorage.getItem(storageKey) || '';
    requestKey = sessionStorage.getItem(`${storageKey}:request`) || '';
    if (access || requestKey) { blocked = true; status.textContent = labels.restore; }
  }
  async function post(body) {
    const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error();
    return data;
  }
  async function digestCart(c) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cartFingerprint(c)));
    return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2,'0')).join('');
  }
  function acceptInvoice(data) {
    const target = new URL(data.checkoutUrl);
    if (!data.checkoutAvailable || target.protocol !== 'https:' || target.hostname !== location.hostname ||
      target.search || target.hash || !/^\/[1-9]\d*\/invoices\/[a-z0-9]+$/.test(target.pathname)) throw new Error();
    const a = data.amounts;
    if (a.totalPaise !== a.orderPaise + a.feePaise || a.payableNowPaise !== a.advancePaise + a.feePaise ||
      a.collectOnDeliveryPaise !== a.orderPaise - a.advancePaise || Object.values(a).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error();
    renderAmounts({ full:a.orderPaise,advance:a.advancePaise,fee:a.feePaise,now:a.payableNowPaise,balance:a.collectOnDeliveryPaise,total:a.totalPaise });
    dialog.querySelector('[data-cod-percent]').textContent = `${Math.round(a.advancePaise * 100 / a.orderPaise)}%`;
    invoice = target.toString(); confirmed = true; blocked = false; status.textContent = labels.saved;
  }
  async function recover() {
    if (access) {
      const state = await check();
      if (state !== 'awaiting_payment') return;
    }
    const current = await readCart();
    if (await digestCart(current) !== sessionStorage.getItem(`${storageKey}:cart`)) { blocked = true; status.textContent = labels.cart_changed; return; }
    const data = await post({ intent:'create_quote',requestKey,themeId:dialog.dataset.themeId });
    if (!data.access) throw new Error();
    sessionStorage.setItem(storageKey,data.access);access=data.access;
    if (data.state === 'check_existing_payment') { await check(); return; }
    acceptInvoice(data);
  }
  async function check() {
    const data = await post({ intent: 'payment_status', access });
    blocked = true; confirmed = false;
    status.textContent = data.state === 'completed' ? labels.completed : data.state === 'awaiting_payment' ? labels.pending : labels.review_required;
    return data.state;
  }
  async function open(source) {
    if (loading || dialog.open || leaving) return;
    origin = source; loading = true;
    if (!requestKey && !access) blocked = false;
    const token = ++operation;
    try { config = await configuration(); }
    catch { loading = false; resume(); return; }
    if (!config.enabled) { loading = false; resume(); return; }
    radios.forEach(r => { r.checked = r.value === 'prepaid'; r.disabled = true; });
    dialog.querySelector('[data-cod-amounts]').hidden = true;
    status.textContent = labels.loading; cart = undefined;
    setChoice(); dialog.showModal();
    try {
      const c = await readCart(); if (token !== operation) return;
      cart = c; cartKey = cartFingerprint(c); showItems(c);
      const advance = Math.floor((c.total_price * config.advancePercent + 50) / 100);
      renderAmounts({ full: c.total_price, advance, fee: config.codFeePaise, now: advance + config.codFeePaise,
        balance: c.total_price - advance, total: c.total_price + config.codFeePaise });
      status.textContent = labels.review_notice;
      readRecovery();
      if (c.total_discount || c.items.some(i => i.selling_plan_allocation)) { blocked = true; status.textContent = labels.unavailable; }
    } catch { blocked = true; status.textContent = labels.unavailable; }
    finally { loading = false; radios.forEach(r => { r.disabled = false; }); setChoice(); }
  }
  window.addEventListener('click', event => {
    if (bypass || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const element = event.target.closest?.('[data-cw-place-order],button[name="checkout"],a[href="/checkout"]');
    if (!element || dialog.contains(element) || element.disabled) return;
    const owner = element.form;
    if (!owner && element.tagName !== 'A') return;
    if (element.tagName === 'A') {
      const url = new URL(element.href, location.href);
      if (url.origin !== location.origin || !/\/checkout\/?$/.test(url.pathname)) return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
    open({ element, form: owner, submitter: owner ? element : null, href: element.href });
  }, true);
  document.addEventListener('submit', event => {
    if (bypass || event.defaultPrevented || dialog.contains(event.target)) return;
    const el = event.submitter;
    if (!el || (el.name !== 'checkout' && !el.hasAttribute('data-cw-place-order'))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    open({ element: el, form: event.target, submitter: el });
  }, true);
  radios.forEach(r => r.addEventListener('change', () => { if (!loading) setChoice(); }));
  dialog.querySelector('[data-cod-close]').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  recheck.addEventListener('click', async () => {
    if (loading || !(access || requestKey)) return;
    loading = true; setChoice();
    try { await recover(); } catch { status.textContent = labels.review_required; }
    finally { loading = false; setChoice(); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (next.disabled || loading) return;
    if (!isCod()) { resume(); return; }
    loading = true; setChoice(); status.textContent = labels.opening;
    try {
      const current = await readCart();
      if (cartFingerprint(current) !== cartKey) { blocked = true; status.textContent = labels.cart_changed; return; }
      if (confirmed && invoice && access) { leaving = true; window.location.assign(invoice); return; }
      const fresh = await configuration();
      if (!fresh.enabled) { loading = false; resume(); return; }
      if (!fresh.canPay) throw new Error();
      if (access || requestKey) { blocked = true; throw new Error(); }
      const input = Object.fromEntries(new FormData(form));
      const phone = String(input.phone || '').replace(/[\s()-]/g, '');
      input.phone = /^[6-9]\d{9}$/.test(phone) ? `+91${phone}` : /^91[6-9]\d{9}$/.test(phone) ? `+${phone}` : phone;
      input.countryCode = 'IN';
      const fingerprint = await digestCart(current);
      requestKey = crypto.randomUUID();
      sessionStorage.setItem(`${storageKey}:cart`, fingerprint);
      sessionStorage.setItem(`${storageKey}:request`, requestKey);
      if (sessionStorage.getItem(`${storageKey}:request`) !== requestKey) throw new Error();
      blocked = true;
      const data = await post({ intent: 'create_quote', requestKey, themeId: dialog.dataset.themeId, address: input,
        lines: current.items.map(i => ({ variantId: `gid://shopify/ProductVariant/${i.variant_id}`, quantity: i.quantity,
          properties: Object.entries(i.properties || {}).map(([name,value]) => ({ name, value: String(value) })) })) });
      if (typeof data.access !== 'string' || !data.access) throw new Error();
      sessionStorage.setItem(storageKey, data.access); access = data.access;
      if (sessionStorage.getItem(storageKey) !== access) throw new Error();
      if (data.state === 'check_existing_payment') { await check(); return; }
      const target = new URL(data.checkoutUrl);
      if (!data.checkoutAvailable || target.protocol !== 'https:' || target.hostname !== location.hostname ||
        target.search || target.hash || !/^\/[1-9]\d*\/invoices\/[a-z0-9]+$/.test(target.pathname)) throw new Error();
      const a = data.amounts;
      if (a.orderPaise !== current.total_price || a.feePaise !== fresh.codFeePaise ||
        a.advancePaise !== Math.floor((a.orderPaise * fresh.advancePercent + 50) / 100) ||
        a.payableNowPaise !== a.advancePaise + a.feePaise || a.collectOnDeliveryPaise !== a.orderPaise - a.advancePaise ||
        a.totalPaise !== a.orderPaise + a.feePaise) throw new Error();
      config = fresh;
      acceptInvoice(data);
    } catch { status.textContent = requestKey || access ? labels.review_required : labels.unavailable; }
    finally { loading = false; setChoice(); }
  });
  setChoice(); dialog.dataset.ready = 'true';
})();
