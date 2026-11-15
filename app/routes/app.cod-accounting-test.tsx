import { Form, useActionData, useLoaderData, useNavigation, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { COD_DIAGNOSTIC_SHOP, readCodDiagnostic, runCodDiagnostic } from "../lib/cod-accounting-diagnostic.server";

const db = { query: <T,>(sql: string, params: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...params) };
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (session.shop !== COD_DIAGNOSTIC_SHOP) throw new Response("Not found", { status: 404 });
  const row = await readCodDiagnostic(db, session.shop);
  return { state: row?.state ?? "not_started", orderId: row?.orderId ?? null, observed: row?.observed ?? null };
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (session.shop !== COD_DIAGNOSTIC_SHOP || request.method !== "POST") throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  if (form.get("intent") !== "run_test" || form.get("confirmed") !== "on")
    return { ok: false, message: "Confirm the test details first." };
  try {
    const { admin } = await unauthenticated.admin(session.shop);
    const result = await runCodDiagnostic(db, admin, session.shop);
    return { ok: result.state === "confirmed", message: result.state === "confirmed"
      ? "Shopify confirmed ₹1,080 total, ₹280 test payment and ₹800 outstanding. No real payment was taken."
      : "The test order exists, but Shopify's payment accounting did not match. Advance COD must stay off." };
  } catch {
    return { ok: false, message: "The test is not confirmed. Recheck the existing test; another order will not be created." };
  }
};
export default function CodAccountingTest() {
  const data = useLoaderData<typeof loader>(), result = useActionData<typeof action>(), navigation = useNavigation();
  const observed = data.observed && typeof data.observed === "object" && !Array.isArray(data.observed)
    ? data.observed as Record<string, unknown> : null;
  const format = (value: unknown) => Number.isSafeInteger(value) ? `₹${(Number(value) / 100).toFixed(2)}` : "—";
  return <s-page heading="Advance COD accounting test">
    <s-section heading="One Shopify test order">
      <p>This creates one clearly marked test order with ₹1,000 merchandise, ₹80 COD fee, ₹280 test payment and ₹800 outstanding.</p>
      <p>No real payment, customer contact details, delivery address, inventory change or customer receipt is used.</p>
      <p>Advance COD remains off. This checks Shopify accounting only.</p>
      <p role="status">Test status: {data.state}</p>
      {result && <p role={result.ok ? "status" : "alert"}>{result.message}</p>}
      {observed && <table><tbody>
        <tr><th scope="row">Order total</th><td>{format(observed.totalPaise)}</td></tr>
        <tr><th scope="row">Test payment</th><td>{format(observed.receivedPaise)}</td></tr>
        <tr><th scope="row">Outstanding</th><td>{format(observed.outstandingPaise)}</td></tr>
      </tbody></table>}
      {data.orderId && <p><a href={`shopify:admin/orders/${data.orderId.split("/").pop()}`}>View test order in Shopify</a></p>}
      <Form method="post">
        <input type="hidden" name="intent" value="run_test" />
        <p><label><input type="checkbox" name="confirmed" required /> I confirm the test details above.</label></p>
        <button type="submit" disabled={navigation.state !== "idle"}>{data.state === "not_started" ? "Run one accounting test" : "Recheck existing test"}</button>
      </Form>
    </s-section>
  </s-page>;
}
