# NimbusPost verification — merchant pilot #1039

Read-only browser verification on 17 November 2026 confirms NimbusPost order #1039, record e73eac6f-9cf5-4fb3-9234-c24dd4d2eb99, channel Cartwala - 1, New status. Payment Mode is COD, Collectable Amount INR320.00, Order Value INR450.00. The product summary shows subtotal INR400.00 and shipping INR50.00. Native intent tag matches 7f2d3978-d494-4919-ac39-921285bec6c8. The do-not-ship pilot tag remains present. No shipment, wallet recharge, refund, cancellation, order edit or customer-data reveal was performed.

This resolves the pending NimbusPost proof in cod-razorpay-pilot-20261117.md: Shopify order #1039 received the real Razorpay advance INR130 and NimbusPost independently shows COD320. The courier-visible tags still include advance cod; only payment classification and collectable balance are verified, not absence of internal metadata from the courier.

Remaining: customer-facing Cloudflare cutover has not been performed; global isolated Worker customer checkout remains disabled. Both existing Render and pilot Worker paid hooks remain configured, so pilot reconciliation has not been independently attributed exclusively to the Worker webhook. Do not claim the complete live migration is finished. Do not pay or dispatch this pilot again.
