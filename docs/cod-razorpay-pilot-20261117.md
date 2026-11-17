# Cloudflare native COD merchant receipt — 17 November 2026

Merchant completed the isolated native pilot through the official Shopify Razorpay provider after repeated Paytm hosted-page loading failures. Razorpay was installed with merchant approval of store-owner contact and payment gateway/session permissions, activated with test mode OFF, and verified present at the existing draft checkout. Paytm was not disabled. No operator payment, refund or shipment was performed.

Verified through independent read-only Shopify Admin API reads:
- Draft #D17 (1627899920569) COMPLETED at 2026-11-17T16:12:44Z.
- Order #1039 (19004580495545), test=false, cancelledAt=null, PARTIALLY_PAID.
- Goods value INR400; shipping/COD charge INR50; total INR450.
- Received INR130; outstanding INR320.
- Exactly one successful non-test Razorpay SALE INR130, transaction20929672085689; five failed Paytm attempts on the order.
- All six order accounting attributes match the expected amounts.
- CARTWALA CLOUDFLARE PILOT - DO NOT SHIP remains present.

Shared PostgreSQL NativeCodCheckout record 7f2d3978-d494-4919-ac39-921285bec6c8 is completed and bound to the same order, updated 2026-11-17T16:13:00.497Z.

Signed, read-only hosted Cloudflare receipt check returned receiptVerified=true, receiptPhase=completed, paidPaise=13000, plannedRemainingCodPaise=32000, sessionNonExpiring=true, payments=0, shopifyWrites=0.

Limits: existing Render webhook remains registered as well as the pilot-only Worker webhook, so these observations do not independently attribute reconciliation exclusively to the Worker callback. NimbusPost verification of #1039 is pending because its browser session requires merchant login. No courier COD claim is made for this order yet. Full customer Cloudflare cutover is not done; global Worker checkout remains disabled. Do not dispatch this pilot or repay its invoice.
