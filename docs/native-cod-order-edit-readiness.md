# Native Advance COD reconciliation: readiness, 6 November 2026

## Completed evidence

TEST order #1035 (gid://shopify/Order/18981308137657) demonstrates goods ₹400, shipping ₹50, total ₹450, simulated received ₹130 and outstanding ₹320. The existing NimbusPost Shopify channel imported it automatically as COD, collectable ₹320. This is accounting/import evidence, not a real gateway checkout or an order-edit test. Do not modify this fixture or book a shipment.

The read-only `native-cod-payment.server.ts` candidate verifies a trusted frozen quote against an authenticated Shopify draft-to-order link, exact current accounting, successful nonmanual SALE/CAPTURE transactions, test/live parity, actual merchandise quantities/artwork properties and the separate nonshipping balance line. It accepts arbitrary active online gateway names, rather than maintaining Paytm/Razorpay/PhonePe credentials or an allowlist. It rejects refunds, incorrect amounts, duplicate transactions/properties and an order changed while paginating. The quote reference excludes Shopify resource IDs so it can be attached before draft creation; the eventual draft/order IDs must be bound in trusted server storage. A hash is not payment authentication.

The helper is deliberately unconnected to customer routes, webhooks and the live deployment. It performs queries only. It is not a reconciliation worker or proof of a completed integration. Its unit tests use fixtures, not real payments.

## Permission blocker resolved

The installed **Cartwala Gift Personalizer** app is Admin App gid://shopify/App/428603867137, client ID `3879fe641910f37451baf743e76059ee`, developer Cartwala. The exact app is managed in **organization 237766993**, not organization 232206967. Both organizations display the name Cartwala. The organization menu's View all dialog exposed both dashboards; the correct app overview independently matched the installed client ID and Render URL. Do not change the old similarly named application in organization 232206967.

After the merchant explicitly approved the extra order-edit permission, version **cartwala-cod-order-edit-permission**, ID **1197310771201**, was released on 6 November 2026 at approximately 13:41 IST. It adds only `write_order_edits` to the existing eight configured scopes. App URL, redirect, embedded behavior, API version and proxy settings were retained from version 4. The Shopify Admin update prompt requested Edit orders / Order edits and was accepted under that approval. An independent Admin API read confirmed both `write_order_edits` and its implied `read_order_edits` in the installed app's granted scopes. The local app configuration now records the same requested scope to prevent a later CLI release from reverting it.

Correct developer app: https://dev.shopify.com/dashboard/237766993/apps/428603867137
Released version: https://dev.shopify.com/dashboard/237766993/apps/428603867137/versions/1197310771201

This releases an app configuration permission, not the Advance COD customer implementation. No app-server deployment, theme publication, real payment, order edit or courier booking was performed by this permission update. The customer payment continuation remains disabled. The remaining work below is still required.

## Remaining implementation and acceptance

1. Implement trusted quote storage, native draft creation and the authenticated paid-order handler. Freeze actual goods, artwork, quantities, address and Shopify tax calculations before requesting payment. Preserve one sale and original merchandise details without describing the deferred balance as a discount.
2. Implement a durable single-writer order-edit worker and recovery path. Verify captured online payment and linked order before starting an edit; after committing, re-read the same order and verify full-value PARTIALLY_PAID accounting. An uncertain network outcome must be reconciled by reads, never blind retries that add the balance twice. Refund, cancellation and edit failures need an operator recovery path.
3. Same-order synthetic TEST is now confirmed in #1036: initial ₹130 PAID, edited to ₹450 total / ₹130 received / ₹320 balance; the same NimbusPost record automatically changed from Prepaid to COD ₹320. See native-cod-same-order-test.md for the exact IDs and independent evidence. A real native payment and actual-variant/tax/artwork/refund acceptance remain unverified. No duplicate courier record was created.
4. Verify taxes, invoice totals, stock/artwork preservation, rounding, cancellation/refund behavior and native checkout presentation. Complete the actual customer-payment integration only after the preceding evidence supports it.
5. Keep customer activation and payment flags false. Retain the unpublished duplicate theme, central 20%/₹50 review settings and native checkout fallback. Publishing remains the merchant's final decision after acceptance; do not publish now.

## Validation

`node scripts/verify-native-cod-payment.mjs` covers provider-independent payment verification, frozen references, artwork/price tampering, manual/test/failed/wrong-amount payments, refunds, duplicate transactions and property keys, shipping/tax discrepancies, missing edit permission and concurrent changes. Run typecheck and scoped lint before committing.
