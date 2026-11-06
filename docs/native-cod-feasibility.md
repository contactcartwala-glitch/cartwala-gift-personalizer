# Native gateway-independent advance checkout — feasibility, 6 November 2026

## Accepted payment requirement

The merchant requires the currently active Shopify checkout gateway to collect only the advance. The app must not require Paytm-specific credentials or a special gateway Advance COD feature. Changing the Shopify gateway must not require changing the Advance COD rules. Full native prepaid checkout remains unchanged. All customer work stays in the unpublished theme pending approval.

## Actual checks

A Shopify Admin API read confirmed Basic, shopifyPlus=false. Native draft-order deposits require Plus. The current connected MCP app has write_order_edits, but the Cartwala app configuration currently does not; those are different app installations. No Cartwala permission was added.

Shopify draftOrderCalculate accepted a temporary manual adjustment: ₹400 goods less ₹320 plus ₹50 charge = ₹130. An unpaid feasibility draft #D1, gid://shopify/DraftOrder/1625343033529, was created. Opening its invoice in the connected browser displayed the existing Paytm Payment Gateway and Pay now ₹130.00, without any direct Paytm API call or new credentials. It also displayed Original price ₹400, Discounted price ₹80, and TOTAL SAVINGS ₹320. This is misleading for a deferred COD balance and is not an accepted customer implementation. No payment button was submitted and no email, contact/address, inventory or shipment was used.

The same unpaid draft was then updated to an explicit advance-only preview: one custom line for 20% advance on ₹400 goods (₹80) with visible full-goods/balance properties, plus the ₹50 upfront COD charge. It has no discounts or real variants. The post-update Admin API confirmed total ₹130, totalDiscounts ₹0, order=null. A browser close request stalled; the revised invoice has not yet had a fresh visual verification. The earlier discount checkout must not be reused as proof of the revised display.

`app/lib/native-cod-preview.ts` builds only this operator preview input. It is not imported into any customer route, does not call a gateway, does not create/mark-paid an order and does not create a courier record. `scripts/verify-native-cod-preview.mjs` verifies concrete 10/20/30/50% examples, zero/variable/fractional fees, exact totals and balances, absence of discounts/gateway credentials, no customer/stock input and invalid amount rejection. Typecheck and scoped lint pass.

## What remains unresolved

The preview does not prove full native-gateway payment, paid-order reconciliation, tax treatment, correct final merchandise invoice or automatic NimbusPost updates after a paid order changes. Native checkout's Total in the advance-only candidate is the amount being collected now (₹130), while full order ₹450 and balance ₹320 need clear explanation. Merchant review is needed before adopting this changed checkout representation. Do not invite a payment on the feasibility invoice.

A production implementation must freeze the actual full goods/artwork/address/tax quote, verify genuine payment through authenticated Shopify reads and the linked draft/order (not a browser success flag), preserve one correct net sale and the original goods invoice, implement idempotent reconciliation/recovery/refunds and verify the existing imported NimbusPost record as COD with the frozen balance before dispatch. It must not duplicate courier records, treat an unpaid amount as savings, charge a real test payment on a disconnected prototype, or mark the earlier #1034 imported test proof as a native checkout test.

The historical direct-Paytm candidate is not the selected customer-payment path. No environment variables, payment providers, active theme, live app deployment, existing customer orders or NimbusPost channel settings were changed. The full feature remains disabled and unpublishable.

## Primary references checked

- https://shopify.dev/changelog/posts/draft-order-deposit-fields-now-available-in-the-admin-and-customer-account-graphql-apis
- https://help.shopify.com/en/manual/fulfillment/managing-orders/editing-orders/considerations
- https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/orderEditCommit
- https://help.releas.it/en/article/cod-fee-missing-on-an-order-full-troubleshooting-checklist-1yc7w5b/ (vendor description of a Pay on Delivery line; not proof of its internal implementation or NimbusPost compatibility)
