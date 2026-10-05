# Partial COD rollout

This branch remains disabled. It now includes an unpublished cart review, persistent
intent/outbox models, and a payment-verification webhook route. The route is not
registered in the live app, and no scopes, paid services or live settings are changed.

The new server code verifies the order linked to the stored deposit draft, exact INR
totals, genuine successful captures, and absence of refunds/cancellation. A database
transaction records payment and creates one outbox row. Claims use a conditional update;
an uncertain external result cannot automatically return to the ready queue. This is
prepared code, not a completed deposit checkout or courier integration.

For an INR 1,000 final product total (after discounts and applicable product tax):
advance INR 200, COD fee INR 80, payable now INR 280, collect on delivery INR 800.
The fee is collected upfront; prepaid checkout remains unchanged. All arithmetic uses
integer paise and rounds the 20% advance to the nearest paise.

## Required integration before enabling

1. Calculate a quote server-side using Shopify pricing, discount and tax calculation.
   Never accept client-supplied prices. Collect and validate the delivery address before
   deposit checkout because the deposit line is non-physical. Freeze the quote and retain
   every variant, quantity, artwork property and address in a persistent intent.
2. Persist intents and enforce unique deposit order IDs and unique final order IDs in
   the database. Use a transactional claim and a durable outbox for order creation.
   An in-memory duplicate check or a shipment idempotency key alone is insufficient.
3. Create a deposit draft checkout using the currently enabled Shopify payment methods.
   Mark it as `partial_cod_deposit`, use a non-physical custom line, no shipping charge,
   and preserve the exact tax-inclusive amount due. Validate deposit tax accounting with
   the merchant before enabling. Do not treat the deposit as an 80% product discount.
4. Authenticate `orders/paid` using Shopify webhook authentication, re-read the order
   and successful transactions through Admin API, and match shop, intent, deposit order,
   currency and exact amount. Browser return URLs and client flags are not payment proof.
   Do not begin production before verified payment. Handle refunds/cancellation before
   dispatch and reconcile any refund after final order creation.
5. Create the full merchandise order with all original artwork properties. Link both
   Shopify IDs to the intent and preserve paid, fee, balance and original-total accounting.
   Do not mark the full order as paid. The exact order transaction representation must
   be validated against Shopify Basic and the installed shipping connector on test orders.
6. Verify a shipping adapter excludes deposit checkouts from automatic import, maps the
   final order to COD, and explicitly transmits only the remaining amount. Confirm the
   courier's returned amount is INR 800 before releasing a shipment. Tags alone do not
   alter arbitrary shipping integrations. Refuse shipment if either capability is missing.
7. Test success, abandoned/failed payment, duplicated webhook, concurrent webhook,
   order-creation timeout, refund, cancelled order and every shipping connector before
   exposing a customer-facing option. Deposit-only orders must never be shipped.

The current app configuration has read_orders but lacks write_orders,
read_draft_orders and write_draft_orders. Scope expansion and merchant reauthorization are required for
steps 3–5. This branch deliberately does not expand permissions or deploy automatically.

## Verification

`node scripts/verify-partial-cod.mjs` checks calculations, payment identity and amount
matching, duplicate proof replay, closed states, shipment gating and preservation of
personalizer line properties. Shopify checkout, persistent recovery, courier mapping
and live payment flow are not covered by this test and remain blocked integration work.

`node scripts/verify-partial-cod-payment.mjs` additionally checks exact decimal currency
parsing, stored-draft linkage, real captures versus authorizations, split payments,
transaction order independence, test orders, refunds, cancellation, and mismatched
identities. Type checking and lint pass for the new modules. The migration is prepared;
no production database migration or database concurrency test has been performed.

## Concrete deployment gates

- Merchant approves these additional Shopify scopes: `read_draft_orders`,
  `write_draft_orders`, `write_orders`. These allow reading/creating draft checkouts and
  creating linked merchandise orders. They do not grant staff or payment-gateway access.
- Confirm the actual installed courier connector and its balance-collection mapping.
  The repository has no NimbusPost API adapter or courier configuration. No generic
  adapter can assume a provider will honor a tag or custom order property.
- Agree the two-order accounting representation so an advance is not counted twice in
  sales or recorded as an artificial product discount. Validate it on test orders before
  enabling any webhook or payment checkout.
- Finish authoritative quotes, deposit checkout creation, final order creation,
  cancellation/refund reconciliation and courier acknowledgment. Register the paid
  webhook only after these pass end-to-end testing. `PARTIAL_COD_ENABLED` stays absent
  until this is ready; setting the flag alone does not complete the integration.

Native Shopify deposit checkout is Plus-only:
https://shopify.dev/changelog/posts/draft-order-deposit-fields-now-available-in-the-admin-and-customer-account-graphql-apis
