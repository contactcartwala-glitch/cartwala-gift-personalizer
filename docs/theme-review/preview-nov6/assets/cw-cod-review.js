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
  const discountBox = dialog.querySelector('[data-cod-discount-box]'), discountInput = dialog.querySelector('[data-cod-code]'), applyCode = dialog.querySelector('[data-cod-apply]');
  const radios = [...dialog.querySelectorAll('input[name="cw_cod_choice"]')];
  const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n / 100);
  let config, cart, cartKey = '', origin, loading = false, bypass = false, leaving = false, operation = 0;
  let appliedDiscount, discountAmounts, invoiceAmounts, invoicePercent, preparing = false, retryNeeded = false;
  let access = '', invoice = '', requestKey = '', confirmed = false, blocked = false, completed = false;
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
    return { ...value, discountCodesAvailable: native?.discountCodesAvailable === true, previewOnly:native?.checkoutAvailable !== true, canPay: native?.collectAddressAtCheckout === true && (native?.checkoutAvailable === true || (native?.previewCheckoutAvailable === true && native.themeId === dialog.dataset.themeId)) && native.enabled === true &&
      native.revision === value.revision && native.advancePercent === value.advancePercent && native.codFeePaise === value.codFeePaise };
  }
  config = { enabled: false, canPay: false };
  // Install the listener even when OFF so an already-open preview can observe a later ON.
  const isCod = () => radios.some(r => r.value === 'cod' && r.checked);
  function setChoice() {
    const cod = isCod();
    const notice = dialog.querySelector('#cw-cod-review-notice');
    if (notice) notice.hidden = config.canPay && !config.previewOnly;
    const unresolved = !!(access || requestKey) && !confirmed;
    radios.forEach(r => { r.disabled = loading || leaving || unresolved || completed; });
    if (discountBox) discountBox.hidden = !cod || !config.discountCodesAvailable || completed;
    if (applyCode) applyCode.disabled = loading || !!requestKey || !!access || blocked || !cart;
    if (discountInput) discountInput.disabled = loading || !!requestKey || !!access || blocked;
    if (preparing || leaving) next.setAttribute?.('aria-busy','true');
    else next.removeAttribute?.('aria-busy');
    next.hidden = completed;
    const shopping = dialog.querySelector('[data-cod-shopping]');
    if (shopping) shopping.hidden = !completed;
    dialog.querySelector('[data-cod-breakdown]').hidden = !cod;
    recheck.hidden = !retryNeeded || !(access || requestKey) || completed;
    recheck.disabled = loading;
    next.disabled = completed || loading || leaving || (!!(access || requestKey) && !confirmed) || (cod && ((!config.canPay && !confirmed) || blocked || !cart));
    next.textContent = preparing || leaving ? labels.opening : !cod ? labels.continue_prepaid : confirmed ? labels.confirm_cod : !config.canPay ? labels.not_connected : labels.continue_cod;
  }
  function close() {
    if (loading) return;
    operation++;
    dialog.close();
    if (origin?.element?.isConnected) origin.element.focus();
  }
  function restoreOrigin() {
    if (!origin?.element) return;
    if (origin.label !== undefined) origin.element.textContent = origin.label;
    origin.element.disabled = false;
    origin.element.removeAttribute?.('aria-busy');
  }
  function resume() {
    if (!origin || leaving || loading) return;
    leaving = true;
    restoreOrigin();
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
  async function readCart(allowEmpty = false) {
    const response = await fetch(`${base}cart.js`, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error();
    const c = await response.json();
    if (!Number.isSafeInteger(c.total_price) || !Array.isArray(c.items) || (!allowEmpty && (c.total_price < 1 || !c.items.length)) || c.currency !== 'INR') throw new Error();
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
    if (access || requestKey) blocked = true;
  }
  async function post(body) {
    const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
    const data = await response.json();
    if (!response.ok || data.error) { const error = new Error(); error.quoteNotCreated = data.quoteNotCreated === true; error.discountChanged = data.discountChanged === true; throw error; }
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
    if (!Number.isInteger(data.advancePercent) || data.advancePercent < 10 || data.advancePercent > 50 ||
      a.advancePaise !== Math.floor((a.orderPaise * data.advancePercent + 50) / 100) || a.totalPaise !== a.orderPaise + a.feePaise || a.payableNowPaise !== a.advancePaise + a.feePaise ||
      a.collectOnDeliveryPaise !== a.orderPaise - a.advancePaise || Object.values(a).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error();
    renderAmounts({ full:a.orderPaise,advance:a.advancePaise,fee:a.feePaise,now:a.payableNowPaise,balance:a.collectOnDeliveryPaise,total:a.totalPaise });
    dialog.querySelector('[data-cod-percent]').textContent = `${data.advancePercent}%`;
    invoiceAmounts = a; invoicePercent = data.advancePercent;
    appliedDiscount = data.discount;
    discountAmounts = data.discount ? a : undefined;
    if (discountInput) discountInput.value = data.discount?.code || '';
    if (data.discount) dialog.querySelector('[data-cod-discount]').textContent = money(data.discount.discountPaise);
    invoice = target.toString(); confirmed = true; blocked = false; retryNeeded = false; status.textContent = labels.review_notice;
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
  async function finishPaidCart() {
    completed = true; blocked = true;
    const current = await readCart(true);
    if (await digestCart(current) === sessionStorage.getItem(`${storageKey}:cart`)) {
      const response = await fetch(`${base}cart/clear.js`, { method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error();
      const empty = await response.json();
      if (empty.item_count !== 0) throw new Error();
    }
    sessionStorage.removeItem(storageKey);
    sessionStorage.removeItem(`${storageKey}:request`);
    sessionStorage.removeItem(`${storageKey}:cart`);
    access = ''; requestKey = ''; invoice = '';
  }
  async function check() {
    const data = await post({ intent: 'payment_status', access });
    blocked = true; confirmed = false;
    status.textContent = data.state === 'completed' ? labels.completed : data.state === 'awaiting_payment' ? labels.review_notice : labels.review_required;
    retryNeeded = data.state !== 'completed' && data.state !== 'awaiting_payment';
    if (data.state === 'completed') {
      try { await finishPaidCart(); } catch { status.textContent = labels.completed_cart_pending; }
    }
    return data.state;
  }
  async function open(source) {
    if (loading || dialog.open || leaving) return;
    origin = source; loading = true;
    origin.label = origin.element.textContent;
    origin.element.disabled = true;
    origin.element.setAttribute?.('aria-busy','true');
    origin.element.textContent = labels.loading;
    if (!requestKey && !access) blocked = false;
    confirmed = false; retryNeeded = false; appliedDiscount = undefined; discountAmounts = undefined;
    if (discountInput) discountInput.value = '';
    const token = ++operation;
    readRecovery();
    try { config = await configuration(); }
    catch { config = { enabled:false, canPay:false, advancePercent:20, codFeePaise:0 }; }
    if (!config.enabled && !access && !requestKey) { loading = false; resume(); return; }
    radios.forEach(r => { r.checked = r.value === 'prepaid'; r.disabled = true; });
    restoreOrigin();
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
      if (access || requestKey) {
        try { await recover(); }
        catch { retryNeeded = true; status.textContent = labels.review_required; }
      }
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
    return open({ element, form: owner, submitter: owner ? element : null, href: element.href });
  }, true);
  document.addEventListener('submit', event => {
    if (bypass || event.defaultPrevented || dialog.contains(event.target)) return;
    const el = event.submitter;
    if (!el || (el.name !== 'checkout' && !el.hasAttribute('data-cw-place-order'))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    return open({ element: el, form: event.target, submitter: el });
  }, true);
  window.addEventListener('pageshow', event => {
    const back = event.persisted || (typeof performance !== 'undefined' && performance.getEntriesByType('navigation')[0]?.type === 'back_forward');
    if (!back || !sessionStorage.getItem(`${storageKey}:request`)) return;
    leaving = false; loading = false; preparing = false;
    restoreOrigin();
    if (dialog.open) dialog.close();
    const element = origin?.element?.isConnected ? origin.element : document.querySelector('[data-cw-place-order],button[name="checkout"]');
    if (element?.form) void open({element,form:element.form,submitter:element,href:element.href});
  });
  function showQuoteAmounts(a) {
    renderAmounts({full:a.orderPaise,advance:a.advancePaise,fee:a.feePaise,now:a.payableNowPaise,balance:a.collectOnDeliveryPaise,total:a.totalPaise});
  }
  function normalAmounts() {
    if (!cart) return;
    const advance = Math.floor((cart.total_price * config.advancePercent + 50) / 100);
    showQuoteAmounts({orderPaise:cart.total_price,advancePaise:advance,feePaise:config.codFeePaise,payableNowPaise:advance+config.codFeePaise,collectOnDeliveryPaise:cart.total_price-advance,totalPaise:cart.total_price+config.codFeePaise});
    dialog.querySelector('[data-cod-discount]').textContent = money(cart.total_discount || 0);
  }
  const quoteLines = current => current.items.map(i => ({variantId:`gid://shopify/ProductVariant/${i.variant_id}`,quantity:i.quantity,
    properties:Object.entries(i.properties || {}).map(([name,value])=>({name,value:String(value)}))}));
  radios.forEach(r => r.addEventListener('change', () => {
    if (loading) return;
    if (isCod() && confirmed && invoiceAmounts) {
      showQuoteAmounts(invoiceAmounts);
      dialog.querySelector('[data-cod-percent]').textContent = `${invoicePercent}%`;
      if(appliedDiscount) dialog.querySelector('[data-cod-discount]').textContent = money(appliedDiscount.discountPaise);
    } else if (isCod() && discountAmounts) {
      showQuoteAmounts(discountAmounts);
      dialog.querySelector('[data-cod-discount]').textContent = money(appliedDiscount.discountPaise);
    } else normalAmounts();
    status.textContent = labels.review_notice;
    setChoice();
  }));
  applyCode?.addEventListener('click', async () => {
    if (loading || access || requestKey || !isCod() || !cart || !config.discountCodesAvailable) return;
    const code = discountInput.value.trim();
    appliedDiscount = undefined; discountAmounts = undefined; normalAmounts();
    if (!code) {status.textContent = labels.review_notice;return;}
    loading = true; setChoice(); status.textContent = labels.discount_checking;
    try {
      const current = await readCart();
      if (cartFingerprint(current) !== cartKey) throw new Error();
      const data = await post({intent:'preview_discount',themeId:dialog.dataset.themeId,discountCode:code,lines:quoteLines(current)});
      const d = data.discount, a = data.amounts;
      if (!d || d.code !== code || d.originalPaise !== current.total_price || !Number.isSafeInteger(d.discountPaise) || d.discountPaise <= 0 ||
        a.orderPaise !== d.originalPaise-d.discountPaise || a.orderPaise <= 0 || a.feePaise !== config.codFeePaise || data.advancePercent !== config.advancePercent ||
        a.advancePaise !== Math.floor((a.orderPaise*data.advancePercent+50)/100) || a.payableNowPaise !== a.advancePaise+a.feePaise ||
        a.collectOnDeliveryPaise !== a.orderPaise-a.advancePaise || a.totalPaise !== a.orderPaise+a.feePaise) throw new Error();
      appliedDiscount=d;discountAmounts=a;showQuoteAmounts(a);
      dialog.querySelector('[data-cod-discount]').textContent=money(d.discountPaise);
      status.textContent=labels.discount_applied;
    } catch {status.textContent=labels.discount_rejected;}
    finally {loading=false;setChoice();}
  });
  discountInput?.addEventListener('input', () => {
    if (appliedDiscount && discountInput.value.trim() !== appliedDiscount.code) {appliedDiscount=undefined;discountAmounts=undefined;normalAmounts();}
  });
  discountInput?.addEventListener('keydown', event => {if(event.key==='Enter'){event.preventDefault();applyCode?.click();}});
  dialog.querySelector('[data-cod-close]').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  recheck.addEventListener('click', async () => {
    if (loading || !(access || requestKey)) return;
    loading = true; setChoice();
    try { await recover(); } catch { retryNeeded = true; status.textContent = labels.review_required; }
    finally { loading = false; setChoice(); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (next.disabled || loading || leaving) return;
    if (!isCod() && !access && !requestKey) { resume(); return; }
    const cod = isCod();
    if (cod && !confirmed && discountInput?.value.trim() && discountInput.value.trim() !== appliedDiscount?.code) {
      status.textContent = labels.discount_apply_first; return;
    }
    loading = true; preparing = true; setChoice(); status.textContent = labels.opening;
    try {
      const current = await readCart();
      if (cartFingerprint(current) !== cartKey) { blocked = true; status.textContent = labels.cart_changed; return; }
      if (confirmed && invoice && access) {
        if (cod) { leaving = true; window.location.assign(invoice); return; }
        if (await check() === 'awaiting_payment') { loading = false; resume(); return; }
        return;
      }
      const fresh = await configuration();
      if (!fresh.enabled) { loading = false; resume(); return; }
      if (!fresh.canPay) throw new Error();
      if (access || requestKey) { blocked = true; throw new Error(); }
      const fingerprint = await digestCart(current);
      requestKey = crypto.randomUUID();
      sessionStorage.setItem(`${storageKey}:cart`, fingerprint);
      sessionStorage.setItem(`${storageKey}:request`, requestKey);
      if (sessionStorage.getItem(`${storageKey}:request`) !== requestKey) throw new Error();
      blocked = true;
      const data = await post({ intent: 'create_quote', requestKey, themeId: dialog.dataset.themeId, collectAddressAtCheckout: true,
        ...(appliedDiscount ? {discountCode:appliedDiscount.code,expectedDiscountPaise:appliedDiscount.discountPaise,
          expectedGoodsPaise:discountAmounts.orderPaise,expectedAdvancePercent:fresh.advancePercent,expectedFeePaise:fresh.codFeePaise} : {}),
        lines:quoteLines(current) });
      if (typeof data.access !== 'string' || !data.access) throw new Error();
      sessionStorage.setItem(storageKey, data.access); access = data.access;
      if (sessionStorage.getItem(storageKey) !== access) throw new Error();
      if (data.state === 'check_existing_payment') { await check(); return; }
      const target = new URL(data.checkoutUrl);
      if (!data.checkoutAvailable || target.protocol !== 'https:' || target.hostname !== location.hostname ||
        target.search || target.hash || !/^\/[1-9]\d*\/invoices\/[a-z0-9]+$/.test(target.pathname)) throw new Error();
      const a = data.amounts;
      if (a.orderPaise !== (discountAmounts?.orderPaise ?? current.total_price) || (appliedDiscount && data.discount?.discountPaise !== appliedDiscount.discountPaise) || a.feePaise !== fresh.codFeePaise ||
        data.advancePercent !== fresh.advancePercent || a.advancePaise !== Math.floor((a.orderPaise * fresh.advancePercent + 50) / 100) ||
        a.payableNowPaise !== a.advancePaise + a.feePaise || a.collectOnDeliveryPaise !== a.orderPaise - a.advancePaise ||
        a.totalPaise !== a.orderPaise + a.feePaise) throw new Error();
      config = fresh;
      acceptInvoice(data);
      leaving = true; window.location.assign(invoice);
    } catch (error) {
      if (error.quoteNotCreated === true && !access) {
        sessionStorage.removeItem(`${storageKey}:request`);
        sessionStorage.removeItem(`${storageKey}:cart`);
        requestKey = ''; blocked = false;
      }
      retryNeeded=!!(requestKey || access);
      if (error.discountChanged) {appliedDiscount=undefined;discountAmounts=undefined;normalAmounts();}
      status.textContent = error.discountChanged ? labels.discount_apply_first : retryNeeded ? labels.review_required : labels.unavailable;
    }
    finally { loading = false; preparing = false; setChoice(); }
  });
  setChoice(); dialog.dataset.ready = 'true';
})();
