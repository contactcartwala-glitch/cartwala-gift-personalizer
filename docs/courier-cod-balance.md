# Courier receives ordinary COD and the remaining balance

The internal order retains the goods amount, verified online advance, full COD charge collected upfront, and outstanding goods balance. A courier does not need a special Advance COD payment method.

The provider-neutral shipment contract sends `paymentType: COD` and `collectPaise` equal to the frozen remaining goods amount. It no longer exposes the internal prepaid amount. NimbusPost maps these to `payment_mode: cod` and `order_collectable_amount` in rupees. No separate advance fields or COD-charge product line are sent to NimbusPost.

For ₹400 goods and 20% advance:

| Extra charge collected upfront | Paid online | Courier collects | Goods invoice value |
| --- | --- | --- | --- |
| ₹0 | ₹80 | ₹320 | ₹400 |
| ₹50 | ₹130 | ₹320 | ₹400 |
| ₹80 | ₹160 | ₹320 | ₹400 |

The courier collection amount is not the invoice value. Original goods prices stay unchanged for shipment documentation. Courier freight/rate charges are separate from the customer-facing extra COD charge.

Tests cover 10/20/30/50% and zero, ₹40/₹50/₹80/fractional charges. They reject provider read-backs containing the full goods total, the full total with charge, the advance instead of the balance, prepaid classification and one-paise discrepancies.

The adapter arithmetic tests use mocked provider responses. Separate observed automatic-import evidence is recorded below. Do not create a second courier order alongside automatic import or book a shipment until the imported remaining balance has been checked.

## Observed automatic sync — 6 November 2026

The authenticated NimbusPost UI now independently shows the existing diagnostic TEST order #1034 on the **Cartwala - 1** Shopify channel. It was already synced on 5 November, 17:34 IST; no order was created or edited during this inspection.

| Source | Total | Test payment recorded | Outstanding / collectable | State |
| --- | --- | --- | --- | --- |
| Shopify Admin API | ₹1,080 | ₹280 | ₹800 | test=true, PARTIALLY_PAID |
| NimbusPost UI | ₹1,080 | Not displayed in the inspected row | ₹800 | COD, INCOMPLETE |

This is direct evidence that the current automatic Shopify channel imported the remaining balance as ordinary COD for this existing test order. The Shopify channel is Active. No channel settings, tags, order amounts, courier allocation or booking were changed. The incomplete status is consistent with the diagnostic's lack of a delivery address; this is not a bookable shipment test and did not collect real Paytm money.

The earlier blanket statement that automatic remaining-balance sync was unverified is superseded for this exact test. A separate API-created courier order must not be added alongside this automatic import. The production design should use one shipping path and verify each imported order's exact remaining balance before booking. The draft now requires the explicit single path ADVANCE_COD_SHIPPING_PATH=shopify_auto instead of mandatory automatic-sync exclusion. The checkout/order worker creates only the Shopify order and does not call the direct NimbusPost create/booking adapter. Missing, dual and direct-API paths fail closed. No environment setting has been changed and full production activation remains blocked. This is not end-to-end completion.

## Merchant correction: existing Shopify gateways — 6 November 2026

The merchant explicitly requires the advance to be collected through the Shopify checkout's currently active gateway, with no Paytm-specific setup or gateway-specific Advance COD integration. For ₹400 goods and no fee this means ₹400 prepaid, or ₹80 paid online and ₹320 ordinary COD at 20%. An upfront ₹50 fee would make the advance checkout ₹130 while the courier still collects ₹320.

The historical Paytm-direct candidate is not the accepted final customer-payment path. No new test credentials were saved, no payment endpoint was enabled, no customer payment UI was deployed, and no order was submitted in response to this correction. The independent preview-admin routes, schema and migration are now included in the draft so a future backend release will preserve the already-live controls. Test order creation now bypasses variant inventory instead of decrementing real stock; production still obeys inventory policy.

A fresh Admin API read confirmed Basic and shopifyPlus=false. Shopify's native DraftOrderInput.deposit requires Plus. A separate native advance checkout followed by reconciliation is an architecture candidate, not a completed implementation: it must preserve original merchandise/artwork, one correct sale, tax/accounting, exact payment proof, cancellation/refunds and the already-imported NimbusPost order without duplicates. Order-edit APIs can change a paid order total and expose an outstanding balance, but their suitability for this specific advance workflow and automatic NimbusPost updates has not been proven. Do not represent two independent full-value sales or a false discount as a completed solution.

Official references checked:
- https://shopify.dev/changelog/posts/draft-order-deposit-fields-now-available-in-the-admin-and-customer-account-graphql-apis
- https://help.shopify.com/en/manual/fulfillment/managing-orders/editing-orders/considerations
- https://shopify.dev/docs/api/admin-graphql/latest/mutations/orderEditCommit

No new end-to-end test order or real payment has been made. Live theme and deployed app remain unchanged.

Native gateway feasibility and the unpaid #D1 preview are documented in [native-cod-feasibility.md](native-cod-feasibility.md). No new end-to-end test order has been created.

A subsequent explicitly simulated TEST order #1035 independently confirmed the exact ₹400 goods + ₹50 shipping example: Shopify total ₹450, TEST received ₹130, outstanding ₹320; NimbusPost automatically imported ordinary COD with collectable ₹320. This is not a real native-checkout payment or a shipment test. Full proof is in [cod-exact-breakdown-test.md](cod-exact-breakdown-test.md).
