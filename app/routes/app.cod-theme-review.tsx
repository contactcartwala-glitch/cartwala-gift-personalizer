import { Form, useActionData, useLoaderData, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { NATIVE_PREVIEW_PAYMENTS_ENABLED } from "../lib/native-cod-feature";
import { COD_DISCOUNT_SCOPE, hasNativeCodDiscountAccess } from "../lib/native-cod-discount.server";
import { authenticate } from "../shopify.server";
import { COD_REVIEW_THEME, loadCodThemeReview, parseReviewCharge, requireReviewShop, saveCodThemeReview } from "../lib/cod-theme-review.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  requireReviewShop(session.shop);
  const discountCodesAvailable = await hasNativeCodDiscountAccess(admin, session.shop).catch(() => false);
  return { discountCodesAvailable, settings: await loadCodThemeReview(session.shop), themeId: COD_REVIEW_THEME, previewPayments: NATIVE_PREVIEW_PAYMENTS_ENABLED };
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, scopes } = await authenticate.admin(request);
  requireReviewShop(session.shop);
  if (request.method !== "POST") throw new Response("Method not allowed", { status: 405 });
  const form = await request.formData();
  if (form.get("intent") === "enable-discounts") {
    await scopes.request([COD_DISCOUNT_SCOPE]);
    return { ok: true, message: "Discount access is ready. Refresh the duplicate theme." };
  }
  try {
    const current = await loadCodThemeReview(session.shop);
    const revision = String(form.get("revision"));
    if (!/^\d+$/.test(revision)) throw new Error("Refresh the page before saving.");
    const intent = form.get("intent");
    if (intent !== "toggle" && intent !== "save") throw new Error("Invalid settings action.");
    if (intent === "toggle" && !["true", "false"].includes(String(form.get("enabled")))) throw new Error("Invalid switch value.");
    const percent = String(form.get("advancePercent"));
    if (intent === "save" && !/^\d+$/.test(percent)) throw new Error("Enter a whole advance percentage from 10 to 50.");
    await saveCodThemeReview(session.shop, {
      enabled: intent === "toggle" ? form.get("enabled") === "true" : current.enabled,
      advancePercent: intent === "save" ? Number(percent) : current.advancePercent,
      codFeePaise: intent === "save" ? parseReviewCharge(form.get("codCharge")) : current.codFeePaise,
      revision: Number(revision),
    });
    return { ok: true, message: intent === "toggle"
      ? form.get("enabled") === "true" ? NATIVE_PREVIEW_PAYMENTS_ENABLED ? "Advance COD is ON in the duplicate theme. Preparing a checkout does not charge; paying uses the active Shopify gateway." : "Theme review is ON. Advance payments remain disabled." : "Theme review is OFF. Place Order goes directly to normal checkout."
      : "Preview percentage and charge saved. Refresh the duplicate theme to see them." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save preview settings." };
  }
};
const inr = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
export default function CodThemeReview() {
  const { settings, themeId, previewPayments, discountCodesAvailable } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const advance = Math.floor((40000 * settings.advancePercent + 50) / 100);
  return <s-page heading="Advance COD — theme review">
    <s-section heading="Duplicate theme controls">
      <p>These settings control Cartwala Advance COD Review Nov6. The live theme is unchanged. {previewPayments ? "ON allows real Advance COD payment testing in the duplicate theme." : "Advance payments are disabled."}</p>
      {result && <p role={result.ok ? "status" : "alert"}>{result.message}</p>}
      <p>Preview: <strong>{settings.enabled ? "ON" : "OFF"}</strong></p>
      <Form method="post">
        <input type="hidden" name="intent" value="toggle" />
        <input type="hidden" name="revision" value={settings.revision} />
        <input type="hidden" name="enabled" value={String(!settings.enabled)} />
        <button type="submit" role="switch" aria-checked={settings.enabled} disabled={busy}>
          {settings.enabled ? "Turn preview OFF" : "Turn preview ON"}
        </button>
      </Form>
      <Form method="post" key={settings.revision}>
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="revision" value={settings.revision} />
        <p><label htmlFor="cod-review-percent">Advance percentage (10–50%)</label><br />
          <input id="cod-review-percent" name="advancePercent" type="number" min="10" max="50" step="1" required defaultValue={settings.advancePercent} /></p>
        <p><label htmlFor="cod-review-charge">Extra COD charge (₹)</label><br />
          <input id="cod-review-charge" name="codCharge" type="number" inputMode="decimal" min="0" max="10000" step="0.01" required defaultValue={(settings.codFeePaise / 100).toFixed(2)} /></p>
        <button type="submit" disabled={busy}>Save preview settings</button>
      </Form>
      <p>OFF restores normal checkout. Saved percentages and charges are kept when OFF.</p>
      <a href={`https://cartwala.in/cart?preview_theme_id=${themeId}`} target="_blank" rel="noopener noreferrer">Open duplicate theme preview</a>
    </s-section>
    <s-section heading="Advance COD discounts">
      <p>{discountCodesAvailable ? "Eligible public merchandise codes can be applied before calculating the advance." : "Shopify must allow this app to read discount rules before customers can apply codes in Advance COD."}</p>
      {!discountCodesAvailable && <Form method="post"><input type="hidden" name="intent" value="enable-discounts" /><button type="submit" disabled={busy}>Allow discount lookup</button></Form>}
    </s-section>
    <s-section heading="Saved example: ₹400 goods">
      <table><tbody>
        <tr><th scope="row">Advance ({settings.advancePercent}%)</th><td>{inr(advance)}</td></tr>
        <tr><th scope="row">Extra COD charge paid upfront</th><td>{inr(settings.codFeePaise)}</td></tr>
        <tr><th scope="row">Pay now</th><td>{inr(advance + settings.codFeePaise)}</td></tr>
        <tr><th scope="row">Courier: COD collection</th><td>{inr(40000 - advance)}</td></tr>
      </tbody></table>
      <p>{previewPayments ? "After successful online payment, the same order shows the full value and remaining COD balance. No courier shipment is booked by this app." : "Advance payments are disabled in this review."}</p>
    </s-section>
  </s-page>;
}
