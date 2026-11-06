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

This is draft code and mocked-provider validation, not proof that the current automatic Shopify-to-NimbusPost import uses the balance. Automatic import exclusion and provider read-back of the exact collectable amount remain release blockers. Do not create a second courier order alongside automatic import or book a shipment until those are resolved.

## Observed automatic sync — 6 November 2026

The authenticated NimbusPost UI now independently shows the existing diagnostic TEST order #1034 on the **Cartwala - 1** Shopify channel. It was already synced on 5 November, 17:34 IST; no order was created or edited during this inspection.

| Source | Total | Test payment recorded | Outstanding / collectable | State |
| --- | --- | --- | --- | --- |
| Shopify Admin API | ₹1,080 | ₹280 | ₹800 | test=true, PARTIALLY_PAID |
| NimbusPost UI | ₹1,080 | Not displayed in the inspected row | ₹800 | COD, INCOMPLETE |

This is direct evidence that the current automatic Shopify channel imported the remaining balance as ordinary COD for this existing test order. The Shopify channel is Active. No channel settings, tags, order amounts, courier allocation or booking were changed. The incomplete status is consistent with the diagnostic's lack of a delivery address; this is not a bookable shipment test and did not collect real Paytm money.

The earlier blanket statement that automatic remaining-balance sync was unverified is superseded for this exact test. A separate API-created courier order must not be added alongside this automatic import. The production design should use one shipping path and verify each imported order's exact remaining balance before booking. The current draft's mandatory automatic-sync exclusion/API-dispatch gate still needs to be revised around the observed channel behavior; it must not simply be enabled or marked end-to-end complete.
