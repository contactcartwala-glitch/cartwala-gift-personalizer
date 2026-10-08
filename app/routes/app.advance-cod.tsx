import { Form, useActionData, useLoaderData, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { loadCodSettings, saveCodSettings } from "../lib/partial-cod-settings.server";
import { canEnableAdvanceCod, COD_INTEGRATION_STATUS } from "../lib/partial-cod-settings";
import { calculatePartialCod } from "../lib/partial-cod";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { settings: await loadCodSettings(session.shop), ready: canEnableAdvanceCod() };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  try {
    await saveCodSettings(session.shop, {
      enabled: form.get("enabled") === "on",
      advancePercent: Number(form.get("advancePercent")),
      revision: Number(form.get("revision")),
    });
    return { ok: true, message: "Advance percentage saved. Advance COD remains off until integration testing is complete." };
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
  const valid = /^\d+$/.test(percent) && Number(percent) >= 10 && Number(percent) <= 50;
  const example = calculatePartialCod(100000, valid ? Number(percent) : settings.advancePercent);
  return <s-page heading="Advance COD">
    <s-section heading="Payment settings">
      <p>Collect an advance online, plus ₹80 COD charge. Collect the remaining product balance on delivery.</p>
      <p role="status"><strong>{ready && settings.enabled ? "ON" : "OFF — checkout setup and testing pending"}</strong></p>
      {result && <p role={result.ok ? "status" : "alert"}>{result.message}</p>}
      <Form method="post">
        <input type="hidden" name="revision" value={settings.revision} />
        <p><label><input type="checkbox" name="enabled" defaultChecked={settings.enabled && ready} disabled={!ready} /> Enable Advance COD</label></p>
        <p><label htmlFor="cod-percent">Advance percentage (10–50%)</label><br />
          <input id="cod-percent" name="advancePercent" type="number" min="10" max="50" step="1" required
            value={percent} onChange={event => setPercent(event.target.value)} /></p>
        {!valid && <p role="alert">Enter a whole number from 10 to 50.</p>}
        <button type="submit" disabled={!valid || navigation.state !== "idle"}>Save settings</button>
      </Form>
      <p>Percentage changes apply to new orders. Existing order amounts stay fixed.</p>
    </s-section>
    <s-section heading="Example: ₹1,000 product total">
      <table><tbody>
        <tr><th scope="row">Advance</th><td>{inr(example.advancePaise)}</td></tr>
        <tr><th scope="row">COD charge</th><td>₹80.00</td></tr>
        <tr><th scope="row">Pay now</th><td>{inr(example.payableNowPaise)}</td></tr>
        <tr><th scope="row">Pay on delivery</th><td>{inr(example.collectOnDeliveryPaise)}</td></tr>
        <tr><th scope="row">Total</th><td>{inr(example.totalPaise)}</td></tr>
      </tbody></table>
    </s-section>
    <s-section heading="Setup progress">
      <ul>{COD_INTEGRATION_STATUS.map(item => <li key={item.id}>{item.label}: {item.ready ? "Complete" : "Pending"}</li>)}</ul>
    </s-section>
  </s-page>;
}
