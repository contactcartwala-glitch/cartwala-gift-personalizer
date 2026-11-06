(() => {
  'use strict';
  const dialog = document.querySelector('[data-cw-cod-review]');
  if (!dialog || !window.HTMLDialogElement || typeof dialog.showModal !== 'function') return;
  const labels = JSON.parse(dialog.querySelector('script[type="application/json"]').textContent);
  const percent = Number(dialog.dataset.percent), fee = Number(dialog.dataset.fee);
  if (!Number.isInteger(percent) || percent < 10 || percent > 50 || !Number.isSafeInteger(fee) || fee < 0 || fee > 1000000) return;
  const form = dialog.querySelector('form'), status = dialog.querySelector('[role="status"]');
  const next = dialog.querySelector('[data-cod-next]');
  const radios = [...dialog.querySelectorAll('input[name="cw_cod_choice"]')];
  const base = window.Shopify?.routes?.root || '/';
  let origin, loading = false, bypass = false, leaving = false, operation = 0;
  const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);
  function setChoice() {
    const cod = radios.some(r => r.value === 'cod' && r.checked);
    dialog.querySelector('[data-cod-breakdown]').hidden = !cod;
    next.disabled = loading || cod || leaving;
    next.textContent = cod ? labels.not_connected : labels.continue_prepaid;
  }
  function close() {
    operation++;
    loading = false;
    dialog.close();
    if (origin?.element?.isConnected) origin.element.focus();
  }
  function resume() {
    if (!origin || leaving) return;
    leaving = true;
    setChoice();
    dialog.close();
    bypass = true;
    if (origin.form) {
      try { origin.form.requestSubmit(origin.submitter || undefined); }
      finally { bypass = false; }
      leaving = false;
      setChoice();
    } else {
      window.location.assign(origin.href);
    }
  }
  async function open(source) {
    if (loading || dialog.open || leaving) return;
    origin = source;
    const token = ++operation;
    loading = true;
    radios.forEach(r => { r.checked = r.value === 'prepaid'; r.disabled = true; });
    dialog.querySelector('[data-cod-amounts]').hidden = true;
    status.textContent = labels.loading;
    setChoice();
    dialog.showModal();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${base}cart.js`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) throw new Error();
      const cart = await response.json();
      if (token !== operation) return;
      if (!Number.isSafeInteger(cart.total_price) || cart.total_price < 1 || !cart.items?.length || cart.currency !== 'INR') throw new Error();
      const advance = Math.round(cart.total_price * percent / 100);
      const amounts = { full: cart.total_price, advance, fee, now: advance + fee,
        balance: cart.total_price - advance, total: cart.total_price + fee };
      for (const [key, value] of Object.entries(amounts))
        dialog.querySelectorAll(`[data-cod-${key}]`).forEach(element => { element.textContent = money(value); });
      dialog.querySelector('[data-cod-percent]').textContent = `${percent}%`;
      dialog.querySelector('[data-cod-amounts]').hidden = false;
      status.textContent = labels.review_notice;
      radios.forEach(r => { r.disabled = false; });
    } catch {
      if (token !== operation) return;
      status.textContent = labels.unavailable;
    } finally {
      clearTimeout(timer);
      if (token === operation) { loading = false; setChoice(); }
    }
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
    event.preventDefault();
    event.stopImmediatePropagation();
    open({ element, form: owner, submitter: owner ? element : null, href: element.href });
  }, true);
  document.addEventListener('submit', event => {
    if (bypass || event.defaultPrevented || dialog.contains(event.target)) return;
    const submitter = event.submitter;
    if (!submitter || (submitter.name !== 'checkout' && !submitter.hasAttribute('data-cw-place-order'))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open({ element: submitter, form: event.target, submitter });
  }, true);
  radios.forEach(r => r.addEventListener('change', setChoice));
  dialog.querySelector('[data-cod-close]').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!next.disabled && radios.some(r => r.value === 'prepaid' && r.checked)) resume();
  });
  dialog.dataset.ready = 'true';
})();
