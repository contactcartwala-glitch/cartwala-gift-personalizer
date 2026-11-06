# Native Advance COD reconciliation: readiness, 6 November 2026

## Completed evidence

TEST order #1035 (gid://shopify/Order/18981308137657) demonstrates goods ₹400, shipping ₹50, total ₹450, simulated received ₹130 and outstanding ₹320. The existing NimbusPost Shopify channel imported it automatically as COD, collectable ₹320. This is accounting/import evidence, not a real gateway checkout or an order-edit test. Do not modify this fixture or book a shipment.

The read-only `native-cod-payment.server.ts` candidate verifies a trusted frozen quote against an authenticated Shopify draft-to-order link, exact current accounting, successful nonmanual SALE/CAPTURE transactions, test/live parity, actual merchandise quantities/artwork properties and the separate nonshipping balance line. It accepts arbitrary active online gateway names, rather than maintaining Paytm/Razorpay/PhonePe credentials or an allowlist. It rejects refunds, incorrect amounts, duplicate transactions/properties and an order changed while paginating. The quote reference excludes Shopify resource IDs so it can be attached before draft creation; the eventual draft/order IDs must be bound in trusted server storage. A hash is not payment authentication.

The helper is deliberately unconnected to customer routes, webhooks and the live deployment. It performs queries only. It is not a reconciliation worker or proof of a completed integration. Its unit tests use fixtures, not real payments.

## Verified blocker

The installed **Cartwala Gift Personalizer** app is Admin App gid://shopify/App/428603867137, client ID `3879fe641910f37451baf743e76059ee`, developer Cartwala. The installed app and requested scopes both lack `write_order_edits`; optional scopes are empty. A different connected MCP app having that scope does not give the installed Cartwala app access.

The connected Dev Dashboard organization 232206967 returns no result when searching this exact client ID. An older similarly named app (client `ce0ab02aa2c699519934f02e1811a8f2`) is a different application and must not be changed. The correct installed app's Manage app page confirms its custom-app identity, permissions and current proxy, but exposes no developer-management link. Developer access to the exact active app is needed before releasing a permission change.

Proposed minimum scope change: append `write_order_edits` to the existing eight configured scopes in `shopify.app.toml`, retaining its client ID, URLs, proxy, extensions and existing permissions. This is a proposed change only: the configuration, granted access and app version have not been changed. Obtain merchant approval for this added ability to edit existing orders before granting it. This permission is unrelated to payment-gateway activation.

## Remaining implementation and acceptance

1. Implement trusted quote storage, native draft creation and the authenticated paid-order handler. Freeze actual goods, artwork, quantities, address and Shopify tax calculations before requesting payment. Preserve one sale and original merchandise details without describing the deferred balance as a discount.
2. Implement a durable single-writer order-edit worker and recovery path. Verify captured online payment and linked order before starting an edit; after committing, re-read the same order and verify full-value PARTIALLY_PAID accounting. An uncertain network outcome must be reconciled by reads, never blind retries that add the balance twice. Refund, cancellation and edit failures need an operator recovery path.
3. With permission granted, use one new controlled TEST: initial ₹130 PAID order, edit that same order to total ₹450 / received ₹130 / balance ₹320. Verify that NimbusPost updates the existing imported record to ordinary COD ₹320. Existing #1035 does not establish that updates from a prepaid imported order work. Do not create a second courier order as a workaround. No actual checkout payment or shipment is authorized by this test plan alone.
4. Verify taxes, invoice totals, stock/artwork preservation, rounding, cancellation/refund behavior and native checkout presentation. Complete the actual customer-payment integration only after the preceding evidence supports it.
5. Keep customer activation and payment flags false. Retain the unpublished duplicate theme, central 20%/₹50 review settings and native checkout fallback. Publishing remains the merchant's final decision after acceptance; do not publish now.

## Validation

`node scripts/verify-native-cod-payment.mjs` covers provider-independent payment verification, frozen references, artwork/price tampering, manual/test/failed/wrong-amount payments, refunds, duplicate transactions and property keys, shipping/tax discrepancies, missing edit permission and concurrent changes. Run typecheck and scoped lint before committing.
