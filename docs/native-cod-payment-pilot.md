# Native Advance COD payment pilot — 6 November 2026

## Candidate behavior

The new merchant-only `/app/cod-native-checkout` pilot uses the currently active Shopify checkout gateway. It prepares a real-variant draft containing the advance portion of the original goods, exact quantities and copied artwork properties, plus the upfront COD/shipping charge. It uses no gateway SDK, Paytm credential, custom gateway transaction or manually marked-paid order. A payable invoice is exposed only after native calculations, draft readback and event-subscription checks pass.

Example: ₹400 goods at 20% plus ₹50 charge → native checkout ₹130. Only after authenticated Shopify reads prove successful **nonmanual** online capture/sale, the same order is edited to ₹450 full value, received ₹130 and outstanding ₹320. A nonshipping deferred-goods line carries the balance; original physical variants retain their quantities and artwork. A whole-paise allocation splits a quantity into at most two variant lines when necessary, preserving the summed quantity. Full original unit price is retained as an item property. No deferred amount is described as a discount. The six human-readable Shopify order fields, including Online amount received, are written only after payment verification.

TEST #1036 previously established that this same-order transition automatically updates the existing NimbusPost record from Prepaid to COD ₹320. This candidate never creates a second Shopify order, courier record, allocation or shipment.

## Tax and native calculation evidence

Server-side Shopify calculations freeze original product prices, tax flags, quantity and properties. Three calculations verify the full original goods plus charge, advance plus charge, and final advance plus deferred balance. INR, zero discounts, exact total/shipping, merchandise identity and native tax signatures must match. Mixed tax flags/rates, bundles, discounts, foreign addresses, excessive lines/properties and tax-exclusive goods with tax use full prepaid checkout. Native per-line rounding is accepted only within a bound of one paise per additional line; rates must match. Final order-edit totals and tax are checked again before commit and re-read afterward.

Independent Shopify draftOrderCalculate calls on real Magic Mirror variant `gid://shopify/ProductVariant/49065013412025`, with a clearly fictitious Telangana test address, confirmed: original goods ₹400 + shipping ₹50 = ₹450, IGST 18% ₹61.02; advance goods ₹80 + shipping ₹50 = ₹130, tax ₹12.20; advance goods ₹80 + deferred balance ₹320 + shipping ₹50 = ₹450, tax ₹61.02. All had zero discounts and taxesIncluded=true. These calculations created no draft, order, contact, reservation or payment. A real invoice/order with merchant-supplied address still requires acceptance.

## State, recovery and events

An additive `NativeCodCheckout` table stores an immutable server quote, unique draft/order bindings, unique payment fingerprint and a durable edit claim. Claim before each first external create/edit; do not re-post after ambiguous outcomes. Lost draft results are found by exact unique tag and fully verified. Lost edit commits are reconciled by re-reading the same order. A consumed edit claim never adds the balance again automatically. Only genuine unchanged paid orders can claim a new edit; mismatches, refunds, cancellations and unsupported modifications require review.

A shop-scoped event setup uses the exact installed app offline client and the existing app URL. It subscribes to ORDERS_PAID, ORDERS_CANCELLED and REFUNDS_CREATE with identifier-only payload fields, and reads subscriptions back before providing a payable link. Webhooks use Shopify's authenticated handler and re-read current draft/order/transactions; payload money and browser success flags are not proof. Refund/cancellation processing stops financial edits and records review; it never initiates a refund or courier booking. Real native refund/cancel behavior, Nimbus cancellation propagation and actual stock restoration still require the controlled merchant test.

## Activation and merchant test

`NATIVE_CUSTOMER_PAYMENTS_ENABLED=false`. The public app-proxy endpoint exists but cannot create customer checkouts. Existing quoted payment status remains recoverable independently of the merchant ON/OFF switch. The duplicate theme and normal live prepaid flow are unchanged. No theme/extension publication is part of the pilot deployment. The full-feature branch replaces its selected storefront gateway SDK with native invoice navigation, durable request key/capability and provider-independent server status; that extension change is not published by the isolated backend pilot.

The operator page selects the existing ₹400 Heart Shape LED Magic Mirror and requests the merchant's delivery address and phone. Prepare checkout performs calculations and creates a single unpaid native draft; it does not charge or send an email. The eventual order is tagged CARTWALA PILOT - DO NOT SHIP. The merchant must review the native checkout and perform its payment. After payment, verify the webhook result, same-order accounting, unchanged actual variant quantities/properties, tax, stock and the existing Nimbus record. Then use Shopify's native refund/cancellation workflow with the merchant to verify returned funds and stock restoration. Never reuse disconnected feasibility draft #D1 for this test.

## Validation

- Eight concurrent draft/paid-order callers; one draft and one begin/add/commit sequence.
- Lost create/begin/add/commit, manual/wrong-amount/foreign payment, calculated-total mismatch, refund/cancellation review, shop isolation and metadata readback.
- Whole-paise quantity allocation, artwork preservation, native tax rounding/rate/price tampering, zero discounts and no gateway credentials.
- Storefront twelve-click quote/redirect guard, durable request key/capability, same-host native invoice URL, OFF/refresh/storage guards and server-only confirmation.
- Full and isolated typecheck, scoped ESLint, isolated production build, migration exercised with PGlite, and all thirteen generated GraphQL operations validated against Shopify 2026-07.

This is a merchant payment pilot, not a completed or activated customer feature. A real payment/refund and final merchant approval remain required before customer activation or publication.

## Deployment and handoff

The isolated pilot code commit **2db23c3bb3b0105f59afec0e0424875f98847859** is live in Render deploy **dep-dbmpog6gekts73e5u040**, finished **6 November 2026 14:54:09 IST**. The authenticated admin pilot page loaded successfully with the new table present, no existing native pilot checkouts, settings ON / 20% / ₹50, and the actual ₹400 Heart Magic Mirror selected. The merchant name and TS state code were prefilled in the handoff form; delivery address, city, PIN and +91 phone remain for the merchant to supply. No native pilot draft, genuine payment, refund, shipment or new event subscription has yet been created through this pilot. Event setup runs only when a valid checkout is prepared, then is confirmed before exposing the invoice.

Post-deploy public app-proxy reads are used to verify both preview settings and customer checkout gating. The merchant pilot is available at:
https://admin.shopify.com/store/0k9icg-ns/apps/gift-personalizer/app/cod-native-checkout

The next dependent step is merchant-provided delivery details, followed by Prepare checkout. Review the resulting invoice and amount before the merchant performs the real payment. The earlier #1036 remains synthetic proof and must not be described as this genuine native payment test. Customer checkout placement/activation and final acceptance remain pending along with real payment/refund/cancellation/stock/courier checks. No theme or extension was published.

## Prepare-checkout input correction

The first merchant submit returned a generic error and the native checkout table remained empty. No invoice or payment was created by that attempt. The exact failing stage was not exposed by the old route. The pilot now accepts Indian ten-digit/91/+91 phone formats, offers named Indian states, preserves delivery inputs, quantity and the checkout reference on failure, and reports a sanitized stage without logging address, phone or upstream payloads. Local action fixtures verify normalization, retained inputs/reference, pre-draft failures and shop isolation. This correction alone does not establish successful native checkout creation or genuine payment.

The input correction code commit **83125124ce02f7d9740dfddd6734fd8990febb23** is live in Render deploy **dep-dbmq192jnfac73b6581g**, finished **6 November 2026 15:13:15 IST**. The admin page was reloaded and verified to show the ten-digit/+91 phone field and named state selector (Telangana selected). Existing checkouts remained empty. The previous failed submit had cleared delivery fields; the merchant must supply them again. No native invoice or real payment has yet been produced. Full/isolated typecheck, scoped lint, route fixture and isolated production build passed.

## Genuine native payment — order #1037

Merchant completed payment on 6 November 2026 after refreshing the Paytm payment page. Independent Shopify Admin API reads confirmed order `gid://shopify/Order/18981514739897`, native intent `bd544aeb-9b6c-4a45-b180-56b034e9f48f`, test=false, PARTIALLY_PAID, goods subtotal ₹400, shipping ₹50, full total ₹450, received ₹130 and outstanding ₹320. One successful nonmanual Paytm SALE ₹130 exists (transaction20891812266169), alongside two failed attempts; no second successful payment was present. All six readable accounting fields were present. The actual Magic Mirror variant49065013412025 remained quantity/currentQuantity1, requiresShipping=true; the deferred₹320 line is nonshipping. Taxes included ₹61.02. Tag CARTWALA PILOT - DO NOT SHIP remained present. No manual reconciliation action was needed to reach these final accounting values during this verification.

This proves genuine active-gateway payment and same-order accounting, superseding the earlier no-real-payment status above. It does NOT prove NimbusPost #1037 acceptance yet: browser connector was unavailable in this turn and no Nimbus connector existed. Genuine Nimbus COD320, stock restoration/refund/cancellation, Paytm first-load reliability and customer UI activation remain pending. Customer payment gating and duplicate theme publication remain unchanged. Never pay this invoice again or dispatch this test order.

## NimbusPost merchant screenshot evidence

The merchant supplied the #1037 NimbusPost order detail screenshot. It shows Order Value₹450, Payment ModeCOD, Collectable Amount₹320 and DO NOT SHIP pilot tag. This is screenshot evidence supplied by the merchant, not a direct API/browser read in that turn. Genuine native payment→same Shopify order→Nimbus COD320 is now confirmed for #1037. No shipment booking was performed. Refund/cancellation and stock restoration remain untested.

## Recovery update deployment — 6 November 2026

Code commit a5d0f51a716488bf5bc465cc964b7ad60f8180cb is live in Render deploy dep-dbmralu7bikc73bq9cq0, completed16:41:10IST. Deployed the isolated native pilot delta through Render specific-commit UI; auto-deploy remains off. Theme remains unpublished and customer native quote creation remains gated OFF.

Post-live public app-proxy checks: cod-review ON/20%/₹50/revision5/paymentsEnabledfalse; native-cod checkoutAvailablefalse. A create_quote recovery request for existing intent bd544aeb-9b6c-4a45-b180-56b034e9f48f returned check_existing_payment, checkoutAvailablefalse and a signed recovery capability. No capability was logged or persisted. No new draft, payment, order or financial edit was initiated by these checks. The same ID is correctly recovered despite customer creation gating.

Prepared the Shopify native Cancel order#1037 dialog for merchant handoff: Original payment method selected, displayed Refund₹130.00INR viaPaytm, ReasonOther, explanatory TEST staff note, Restock inventory checked, customer notification unchecked. Final Cancel order button has NOT been clicked. Refund/cancel/actualrestock and Nimbus cancellation are still pending. User must perform the final financial cancellation action, then independently verify Shopify transactions/status, inventory46→expected47 absentotherchanges, and Nimbus existingrecord. No publication or new customer activation.
