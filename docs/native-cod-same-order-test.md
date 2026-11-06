# Same-order Advance COD edit TEST — prepared 6 November 2026

## Purpose

Before enabling a gateway-independent customer flow, prove that the installed Cartwala app can change an initial paid advance order into the full-value partially-paid order, and that NimbusPost updates the **same** imported record from prepaid to COD. Existing #1035 was created partially-paid and does not establish this transition.

The operator-only route `/app/cod-native-edit-test` creates one fixed, simulated TEST order with ₹80 advance goods + ₹50 shipping = ₹130 PAID. After inspecting its automatic courier import, its second action edits that same Shopify order by adding a ₹320 nonshipping, nontaxable test balance line. Expected result: ₹400 subtotal + ₹50 shipping = ₹450 current total; simulated received ₹130; outstanding ₹320; PARTIALLY_PAID.

This is a synthetic test of order-edit accounting and courier updates. It does **not** collect a real payment, prove native checkout completion, implement tax/artwork/stock rules, or enable the customer integration. No customer/email/address, actual variant inventory, receipt, shipment or courier API create is used. Test lines are explicitly labeled and the order tagged DO NOT SHIP. Do not use its simulated transaction as genuine payment proof.

## Execution controls

- Authenticated Cartwala admin only; POST actions restricted to create/edit/check. Amounts and references are server constants, never browser input.
- Uses the installed app offline client and independently verifies its exact shop, client ID and granted scopes before mutations.
- Fixed reference `CARTWALA-NATIVE-EDIT-20261106-V1`; new rows in existing CodAccountingDiagnostic table. No schema, dependency or environment change.
- Durable create claim prevents another orderCreate on concurrent calls or uncertain outcomes. Recover a lost create response by searching its exact tag and binding only a single matching TEST.
- A separate durable `-EDIT` row claims the complete edit sequence once. It intentionally has no orderId because the existing table enforces unique orderId. Its state represents the claim, while observed.phase records progress; completed is recorded in the main order row and observed.phase.
- Verify original TEST identity, simulated transaction, shipping, tax, zero discounts, native line quantities and exact current accounting before editing and before committing.
- Validate calculated order identity, ₹450 total, ₹400 subtotal and ₹320 outstanding before commit. Disable customer notification.
- Never replay uncertain begin/add/commit calls automatically. Check the saved order instead. If commit succeeded but its response was lost, check confirms the final state without adding a second balance.
- Customer Advance COD remains disabled; duplicate theme remains unpublished. Existing accounting diagnostics and central theme controls remain in the deployment base.

## Validation completed

- PGlite tests: ten concurrent creates and ten concurrent edits; at most one create/begin/add/commit.
- Lost create/begin/add/commit outcomes, exact app/permission mismatch, wrong calculated total and repeated actions.
- No real customer/contact/address/inventory input, no receipts and no duplicate mutation after uncertain results.
- Full-feature and isolated-base TypeScript checks; scoped ESLint; isolated production build.
- Shopify AI Toolkit validates create/begin/add/commit/read/permission GraphQL against 2026-07. No external state is changed by validation.

## Server and NimbusPost execution confirmed

The isolated candidate commit **04b23bb024b85e757628e12b17f7baca139c3161** was deployed to Render service `srv-dasaieg473hc73fenaag` by specific commit, deploy **dep-dbmp0re1egvs73d7uts0**, live **6 November 2026 14:03:35 IST**. Auto-deploy remains off. No schema, secret or dependency changes were needed.

The authenticated operator route, using the installed Cartwala app offline client, created exactly one new TEST **#1036**, Shopify ID **gid://shopify/Order/18981407588537**. Before editing, an independent Shopify API read confirmed PAID, current total ₹130, received ₹130 and outstanding ₹0. NimbusPost automatically imported it at about 14:04 IST in channel Cartwala - 1 as **Prepaid ₹130**.

The one edit action completed with calculated order **gid://shopify/CalculatedOrder/218338590905**. An independent Shopify API read then confirmed the same order ID/name, test=true, PARTIALLY_PAID, current subtotal ₹400, actual shipping row ₹50, current total ₹450, simulated received ₹130 and outstanding ₹320. There are two explicitly nonshipping, nontaxable TEST lines, ₹80 advance goods and ₹320 deferred balance. The durable edit row records observed.phase=completed; its generic state=processing denotes the retained claim, not an active second edit.

After refreshing the NimbusPost order list, the **same record** `/order/details/a198f9b7-e696-40c5-a7df-110ae3d89833` changed automatically from Prepaid ₹130 to **Total ₹450 / Collectable ₹320 / COD**. The record URL was captured before and compared after; it is identical. There was no manual courier edit, duplicate Nimbus order, allocation, booking or wallet action. INCOMPLETE is expected because the test has no shipping address.

Shopify: https://admin.shopify.com/store/0k9icg-ns/orders/18981407588537
NimbusPost: https://app.nimbuspost.com/order/details/a198f9b7-e696-40c5-a7df-110ae3d89833

This establishes same-order Shopify accounting and the existing channel's automatic Prepaid-to-COD update. It does **not** establish a real native payment, final invoice/tax treatment for actual variants, personalization/stock preservation, cancellation/refund behavior, or a complete customer checkout. The full customer feature remains disabled and the duplicate theme remains unpublished. Do not invite payment on the old disconnected #D1 preview.

Primary Shopify reference: https://shopify.dev/docs/apps/build/orders-fulfillment/order-management-apps/edit-orders
