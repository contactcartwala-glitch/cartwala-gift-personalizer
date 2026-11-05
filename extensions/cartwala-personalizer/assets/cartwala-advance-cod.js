(() => {
  "use strict";
  const root = document.querySelector("[data-cw-advance-cod]");
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = "true";
  const messages = JSON.parse(root.querySelector("[data-cw-cod-i18n]").textContent);
  const form = root.querySelector("form"), status = root.querySelector("[data-cw-cod-status]"),
    pay = root.querySelector("[data-cw-cod-pay]"), recheck = root.querySelector("[data-cw-cod-recheck]");
  const base = window.Shopify?.routes?.root || "/", endpoint = `${base}apps/cartwala-signature-day/partial-cod`;
  const storageKey = "cartwala-advance-cod-v1";
  let access = "", busy = false, scriptPromise;
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
    // Require recovery storage before initiating a payment. Never persist the Paytm transaction token.
    sessionStorage.setItem(storageKey, value);
    if (sessionStorage.getItem(storageKey) !== value) throw new Error("Recovery storage unavailable");
    access = value;
  }
  async function check() {
    pay.hidden = true;
    say(messages.checking);
    const data = await request({ intent: "payment_status", access });
    recheck.hidden = false;
    say((messages[data.state] || messages.needs_review).replace('__BALANCE__', money(data.collectPaise)));
    // Keep the capability to recover on refresh and prevent accidental payment repetition.
  }
  function loadPaytm(checkout) {
    if (scriptPromise) return scriptPromise;
    if (!/^[A-Za-z0-9]{10,40}$/.test(checkout.mid) || !["staging", "production"].includes(checkout.environment))
      throw new Error("Invalid payment configuration");
    const host = checkout.environment === "staging" ? "https://securestage.paytmpayments.com" : "https://secure.paytmpayments.com";
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${host}/merchantpgpui/checkoutjs/merchants/${checkout.mid}.js`;
      const timeout = setTimeout(() => reject(new Error("Payment library unavailable")), 30000);
      script.crossOrigin = "anonymous";
      script.onload = () => {
        if (!window.Paytm?.CheckoutJS?.onLoad) { clearTimeout(timeout); reject(new Error()); return; }
        window.Paytm.CheckoutJS.onLoad(() => { clearTimeout(timeout); resolve(); });
      };
      script.onerror = () => { clearTimeout(timeout); reject(new Error()); };
      document.head.append(script);
    });
    return scriptPromise;
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
      const quote = await request({ intent: "create_quote", requestKey: crypto.randomUUID(), address,
        lines: cart.items.map(item => ({ variantId: `gid://shopify/ProductVariant/${item.variant_id}`, quantity: item.quantity,
          properties: Object.entries(item.properties || {}).map(([name, value]) => ({ name, value: String(value) })) })) });
      if (!quote.checkoutAvailable || !quote.access) throw new Error();
      saveAccess(quote.access);
      form.hidden = true; pay.hidden = false;
      say(messages.review.replace('__NOW__', money(quote.amounts.payableNowPaise)).replace('__BALANCE__', money(quote.amounts.collectOnDeliveryPaise)));
    });
  });
  pay.addEventListener("click", () => locked(async () => {
    pay.hidden = true; recheck.hidden = false;
    say(messages.opening);
    const { checkout } = await request({ intent: "begin_payment", access });
    await loadPaytm(checkout);
    if (!window.Paytm?.CheckoutJS) throw new Error();
    await window.Paytm.CheckoutJS.init({ root: "", flow: "DEFAULT",
      data: { orderId: checkout.orderId, token: checkout.txnToken, tokenType: "TXN_TOKEN", amount: checkout.amount },
      merchant: { redirect: false }, handler: {
        transactionStatus: () => { locked(check); },
        notifyMerchant: () => { say(messages.check_before_retry); },
      } });
    window.Paytm.CheckoutJS.invoke();
    say(messages.complete);
  }));
  recheck.addEventListener("click", () => locked(check));
  locked(async () => {
    access = sessionStorage.getItem(storageKey) || "";
    if (access) { root.hidden = false; form.hidden = true; recheck.hidden = false; return check(); }
    const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return;
    const config = await response.json();
    if (config.checkoutAvailable) root.hidden = false;
  });
})();
