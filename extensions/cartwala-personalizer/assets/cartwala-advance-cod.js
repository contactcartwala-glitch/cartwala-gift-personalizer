(() => {
  "use strict";
  const root = document.querySelector("[data-cw-advance-cod]");
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = "true";
  const messages = JSON.parse(root.querySelector("[data-cw-cod-i18n]").textContent);
  const form = root.querySelector("form"), status = root.querySelector("[data-cw-cod-status]"),
    pay = root.querySelector("[data-cw-cod-pay]"), recheck = root.querySelector("[data-cw-cod-recheck]");
  const base = window.Shopify?.routes?.root || "/", endpoint = `${base}apps/cartwala-signature-day-1/native-cod`;
  const storageKey = "cartwala-advance-cod-v1";
  let access = "", busy = false, checkoutUrl = "";
  const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);
  const say = text => { status.textContent = text; };
  async function request(body) {
    const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error("Checkout could not be confirmed. Check payment status before paying again.");
    return data;
  }
  async function locked(action) {
    if (busy) return;
    busy = true;
    root.setAttribute("aria-busy", "true");
    root.querySelectorAll("button").forEach(button => { button.disabled = true; });
    try { await action(); }
    catch { say(messages.error); }
    finally {
      busy = false; root.removeAttribute("aria-busy");
      root.querySelectorAll("button").forEach(button => { button.disabled = false; });
    }
  }
  function saveAccess(value) {
    // Require recovery storage before initiating a payment. No gateway credential is stored.
    sessionStorage.setItem(storageKey, value);
    if (sessionStorage.getItem(storageKey) !== value) throw new Error("Recovery storage unavailable");
    access = value;
  }
  async function check() {
    pay.hidden = true;
    say(messages.checking);
    const data = await request({ intent: "payment_status", access });
    recheck.hidden = false;
    say((messages[data.state === "completed" ? "order_confirmed" : data.state === "awaiting_payment" ? "payment_pending" : data.state] || messages.needs_review).replace('__BALANCE__', money(data.collectPaise)));
    // Keep the capability to recover on refresh and prevent accidental payment repetition.
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    locked(async () => {
      if (access) return check();
      say(messages.calculating);
      const response = await fetch(`${base}cart.js`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error();
      const cart = await response.json();
      if (!cart.items?.length || cart.items.some(item => item.selling_plan_allocation) || cart.total_discount)
        throw new Error();
      const address = Object.fromEntries(new FormData(form));
      address.phone = `+91${address.phone}`; address.countryCode = "IN";
      const quote = await request({ intent: "create_quote", requestKey: sessionStorage.getItem(`${storageKey}:request`) || (() => { const id = crypto.randomUUID(); sessionStorage.setItem(`${storageKey}:request`, id); return id; })(), themeId: root.dataset.themeId, address,
        lines: cart.items.map(item => ({ variantId: `gid://shopify/ProductVariant/${item.variant_id}`, quantity: item.quantity,
          properties: Object.entries(item.properties || {}).map(([name, value]) => ({ name, value: String(value) })) })) });
      if (!quote.checkoutAvailable || !quote.access || !quote.checkoutUrl) throw new Error();
      const target = new URL(quote.checkoutUrl);
      if (target.protocol !== "https:" || target.hostname !== location.hostname || !/^\/[1-9]\d*\/invoices\/[a-z0-9]+$/.test(target.pathname)) throw new Error();
      checkoutUrl = target.toString();
      saveAccess(quote.access);
      form.hidden = true; pay.hidden = false;
      say(messages.review.replace('__NOW__', money(quote.amounts.payableNowPaise)).replace('__BALANCE__', money(quote.amounts.collectOnDeliveryPaise)).replace('__CHARGE__', money(quote.amounts.feePaise)));
    });
  });
  pay.addEventListener("click", () => locked(async () => {
    pay.hidden = true; recheck.hidden = false;
    say(messages.opening);
    if (!checkoutUrl) return check();
    window.location.assign(checkoutUrl);
    say(messages.complete);
  }));
  recheck.addEventListener("click", () => locked(check));
  locked(async () => {
    const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return;
    const config = await response.json();
    if (!config.checkoutAvailable) return;
    root.hidden = false;
    access = sessionStorage.getItem(storageKey) || "";
    if (access) { form.hidden = true; recheck.hidden = false; return check(); }
  });
})();
