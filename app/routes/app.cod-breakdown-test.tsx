import { Form, useActionData, useLoaderData, useNavigation, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { COD_DIAGNOSTIC_SHOP, readCodDiagnostic, runCodDiagnostic } from "../lib/cod-breakdown-diagnostic.server";
import { codOrderBreakdown } from "../lib/cod-order-breakdown";

const db = { query: <T,>(sql: string, params: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...params) };
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (session.shop !== COD_DIAGNOSTIC_SHOP) throw new Response("Not found", { status: 404 });
  const row = await readCodDiagnostic(db, session.shop);
  return { state: row?.state ?? "not_started", orderId: row?.orderId ?? null,
    fields: codOrderBreakdown(40000, 20, 5000).attributes };
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (session.shop !== COD_DIAGNOSTIC_SHOP) throw new Response("Not found", { status: 404 });
  if (request.method !== "POST") throw new Response("Method not allowed", { status: 405 });
  const form = await request.formData();
  if (form.get("intent") !== "run_exact_test") return { ok: false, message: "Invalid test action." };
  try {
    const { admin } = await unauthenticated.admin(session.shop);
    const result = await runCodDiagnostic(db, admin, session.shop);
    return { ok: result.state === "confirmed", message: result.state === "confirmed"
      ? "Confirmed: ₹400 goods + ₹50 shipping = ₹450 total; ₹130 TEST received; ₹320 remaining. No real payment was taken."
      : "The TEST order exists, but its accounting did not match. Keep Advance COD payments disabled." };
  } catch {
    return { ok: false, message: "Test is not confirmed. Recheck the existing test; do not create a replacement order." };
  }
};
export default function CodBreakdownTest() {
  const data = useLoaderData<typeof loader>(), result = useActionData<typeof action>(), busy = useNavigation().state !== "idle";
  return <s-page heading="Advance COD — exact breakdown test">
    <s-section heading="One TEST order, no real payment">
      <p>This checks Shopify accounting and the order details below. It does not test a real checkout payment.</p>
      <p>No customer contact/address, product inventory, email receipt or shipment is used. Customer Advance COD payments remain disabled.</p>
      <table><tbody>{data.fields.map(field => <tr key={field.key}><th scope="row">{field.key}</th><td>{field.value}</td></tr>)}</tbody></table>
      <p role="status">Test status: {data.state}</p>
      {result && <p role={result.ok ? "status" : "alert"}>{result.message}</p>}
      {data.orderId && <p><a href={`shopify:admin/orders/${data.orderId.split("/").pop()}`}>View TEST order in Shopify</a></p>}
      <Form method="post"><input type="hidden" name="intent" value="run_exact_test" />
        <button type="submit" disabled={busy}>{busy ? "Checking…" : data.state === "not_started" ? "Create one TEST order — no real payment" : "Recheck the existing TEST order"}</button>
      </Form>
    </s-section>
  </s-page>;
}
