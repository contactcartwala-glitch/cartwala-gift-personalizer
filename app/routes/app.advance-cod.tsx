import { Form, Link, useActionData, useLoaderData, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { loadCodSettings, saveCodSettings } from "../lib/partial-cod-settings.server";
import { canEnableAdvanceCod, COD_INTEGRATION_STATUS, parseCodCharge } from "../lib/partial-cod-settings";
import { calculatePartialCod } from "../lib/partial-cod";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { settings: await loadCodSettings(session.shop), ready: canEnableAdvanceCod() };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (request.method !== "POST") throw new Response("Method not allowed", { status: 405 });
  const form = await request.formData();
  try {
    const current = await loadCodSettings(session.shop);
    const toggle = form.get("intent") === "toggle";
    if (!toggle && form.get("intent") !== "save") throw new Error("Invalid settings action");
    if (toggle && !["true", "false"].includes(String(form.get("enabled")))) throw new Error("Invalid switch value");
    await saveCodSettings(session.shop, {
      enabled: toggle ? form.get("enabled") === "true" : current.enabled,
      advancePercent: toggle ? current.advancePercent : Number(form.get("advancePercent")),
      codFeePaise: toggle ? current.codFeePaise : parseCodCharge(form.get("codCharge")),
      revision: Number(form.get("revision")),
    });
    return { ok: true, message: toggle
      ? form.get("enabled") === "true" ? "Advance COD is ON." : "Advance COD is OFF. New advance payments are disabled; prepaid checkout is unchanged."
      : "Advance percentage and COD charge saved. Existing order amounts are unchanged." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save COD settings" };
  }
};

const inr = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

export default function AdvanceCod() {
  const { settings, ready } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const [percent, setPercent] = useState(String(settings.advancePercent));
  const [charge, setCharge] = useState((settings.codFeePaise / 100).toFixed(2));
  let fee = settings.codFeePaise, chargeValid = true;
  try { fee = parseCodCharge(charge); } catch { chargeValid = false; }
  const percentValid = /^\d+$/.test(percent) && Number(percent) >= 10 && Number(percent) <= 50;
  const valid = percentValid && chargeValid;
  const example = calculatePartialCod(100000, percentValid ? Number(percent) : settings.advancePercent, fee);
  return <s-page heading="Advance COD">
    <s-section heading="Payment settings">
      <p>Choose the advance percentage and extra COD charge. Prepaid orders pay their full amount without this COD charge.</p>
      <p role="status"><strong>{settings.enabled ? "ON" : "OFF"}</strong></p>
      {!ready && <p>Activation is blocked until the agreed checkout placement and payment/courier integration are ready.</p>}
      {result && <p role={result.ok ? "status" : "alert"}>{result.message}</p>}
      <Form method="post">
        <input type="hidden" name="intent" value="toggle" />
        <input type="hidden" name="revision" value={settings.revision} />
        <input type="hidden" name="enabled" value={String(!settings.enabled)} />
        <button type="submit" role="switch" aria-checked={settings.enabled}
          disabled={navigation.state !== "idle" || (!settings.enabled && !ready)}>
          {settings.enabled ? "Turn Advance COD OFF" : "Turn Advance COD ON"}
        </button>
      </Form>
      <p>OFF hides the advance option and blocks new advance payments. Existing paid orders can still be reconciled.</p>
      <Form method="post">
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="revision" value={settings.revision} />
        <p><label htmlFor="cod-percent">Advance percentage (10–50%)</label><br />
          <input id="cod-percent" name="advancePercent" type="number" min="10" max="50" step="1" required
            value={percent} onChange={event => setPercent(event.target.value)} /></p>
        {!percentValid && <p role="alert">Enter a whole number from 10 to 50.</p>}
        <p><label htmlFor="cod-charge">Extra COD charge (₹)</label><br />
          <input id="cod-charge" name="codCharge" type="number" inputMode="decimal" min="0" max="10000" step="0.01" required
            value={charge} onChange={event => setCharge(event.target.value)} /></p>
        {!chargeValid && <p role="alert">Enter a charge from ₹0 to ₹10,000 with at most two decimal places.</p>}
        <button type="submit" disabled={!valid || navigation.state !== "idle"}>Save settings</button>
      </Form>
      <p>Percentage and charge changes apply to new quotes. Existing quoted or paid order amounts stay fixed.</p>
    </s-section>
    <s-section heading="Example: ₹1,000 product total">
      <table><tbody>
        <tr><th scope="row">Advance</th><td>{inr(example.advancePaise)}</td></tr>
        <tr><th scope="row">COD charge</th><td>{inr(example.feePaise)}</td></tr>
        <tr><th scope="row">Pay now</th><td>{inr(example.payableNowPaise)}</td></tr>
        <tr><th scope="row">Pay on delivery</th><td>{inr(example.collectOnDeliveryPaise)}</td></tr>
        <tr><th scope="row">Total</th><td>{inr(example.totalPaise)}</td></tr>
      </tbody></table>
    </s-section>
    <s-section heading="Setup progress">
      <p><Link to="/app/advance-cod-recovery">Review pending payments and recover existing orders</Link></p>
      <ul>{COD_INTEGRATION_STATUS.map(item => <li key={item.id}>{item.label}: {item.ready ? "Complete" : "Pending"}</li>)}</ul>
    </s-section>
  </s-page>;
}

