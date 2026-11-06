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

## Pending server execution

Render service `srv-dasaieg473hc73fenaag` currently runs commit `1e75383547e87d2be5186751ca421130a0736917`; auto-deploy is off and its configured branch is master. Deploy this isolated candidate by its **specific commit**. Do not use an unqualified trigger-deploy action, which would deploy master. Do not deploy the unfinished full-feature PR17.

The connected Render browser returned a sign-in page during preparation. No deployment, new Shopify test order, order edit or new NimbusPost check has happened yet. Resume after Render login; verify the exact deployed commit is live, create the test, inspect its imported NimbusPost record, apply the one balance edit, and inspect that same record again. Do not ship or pay on this synthetic test.

Primary Shopify reference: https://shopify.dev/docs/apps/build/orders-fulfillment/order-management-apps/edit-orders
