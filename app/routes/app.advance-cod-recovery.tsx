import { Form, useActionData, useLoaderData, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { configuredPaytm, paytmDatabase, progressConfiguredCodCheckout } from "../lib/partial-cod-paytm-runtime.server";
import { reconcilePaidCodOrder } from "../lib/partial-cod-order-store.server";
import { canEnableAdvanceCod } from "../lib/partial-cod-settings";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const intents = await prisma.partialCodIntent.findMany({ where: { shop: session.shop, paytmAttempt: { isNot: null },
    state: { in: ["awaiting_payment", "paid", "needs_review", "cancelled", "refunded"] } },
    orderBy: { updatedAt: "asc" }, take: 25,
    select: { id: true, state: true, payableNowPaise: true, collectPaise: true, codOrderId: true,
      paytmAttempt: { select: { state: true } }, orderAttempt: { select: { state: true, candidateOrderId: true } } } });
  return { intents };
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (request.method !== "POST") throw new Response("Method not allowed", { status: 405 });
  const form = await request.formData(), id = String(form.get("id") || "");
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
    return { ok: false, message: "Select a valid checkout." };
  try {
    if (form.get("intent") === "recheck") {
      const result = await progressConfiguredCodCheckout(session.shop, id);
      return { ok: true, message: `Checkout status: ${result.state.replaceAll("_", " ")}.` };
    }
    if (form.get("intent") !== "adopt" || form.get("confirmed") !== "on") throw new Error();
    const connection = configuredPaytm(), candidate = String(form.get("candidate") || "");
    if (connection.shop !== session.shop || process.env.ADVANCE_COD_SHOPIFY_SYNC_EXCLUDED !== "true" ||
        (connection.config.environment === "production" && !canEnableAdvanceCod()) ||
        !/^gid:\/\/shopify\/Order\/[1-9]\d*$/.test(candidate)) throw new Error();
    const { admin } = await unauthenticated.admin(session.shop);
    // This verifies payment, original reference, full accounting, artwork and address; never orderCreate.
    await reconcilePaidCodOrder(paytmDatabase, admin, connection.gateway, id, session.shop, connection.config, candidate);
    return { ok: true, message: "The existing Shopify order was verified and linked. No new order was created." };
  } catch {
    return { ok: false, message: "This checkout needs review. No new payment or replacement order was requested. Verify the original payment/order before continuing." };
  }
};
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);
export default function AdvanceCodRecovery() {
  const { intents } = useLoaderData<typeof loader>(), result = useActionData<typeof action>(), navigation = useNavigation();
  return <s-page heading="Advance COD payment recovery">
    <s-section heading="Pending checkouts">
      <p>Check the original payment before asking a customer to pay again. Recovery never initiates another payment.</p>
      <p>Refunds and cancellations still require provider reconciliation; this screen does not issue refunds or book shipments.</p>
      {result && <p role={result.ok ? "status" : "alert"}>{result.message}</p>}
      {!intents.length && <p>No advance payments have started.</p>}
      {intents.map(item => <section key={item.id}>
        <h2>Checkout {item.id}</h2>
        <p>Payment: {item.paytmAttempt?.state}. Order: {item.orderAttempt?.state || "not started"}.</p>
        <p>Advance paid if confirmed: {money(item.payableNowPaise)}. Balance on delivery: {money(item.collectPaise)}.</p>
        {item.codOrderId && <p><a href={`shopify:admin/orders/${item.codOrderId.split("/").pop()}`}>View existing order</a></p>}
        <Form method="post"><input type="hidden" name="id" value={item.id} />
          <button name="intent" value="recheck" disabled={navigation.state !== "idle"}>Recheck payment and existing order</button>
        </Form>
        {item.orderAttempt?.state === "uncertain" && !item.orderAttempt.candidateOrderId &&
          <Form method="post"><input type="hidden" name="id" value={item.id} />
            <p><label>Original Shopify order GID <input name="candidate" required placeholder="gid://shopify/Order/…" /></label></p>
            <p><label><input type="checkbox" name="confirmed" required /> I found the original order; verify it without creating another.</label></p>
            <button name="intent" value="adopt" disabled={navigation.state !== "idle"}>Verify and link original order</button>
          </Form>}
      </section>)}
    </s-section>
  </s-page>;
}
