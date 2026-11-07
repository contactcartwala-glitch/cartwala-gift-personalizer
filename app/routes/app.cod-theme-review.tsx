import { Form, useActionData, useLoaderData, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { readCodPublishedTheme } from "../lib/cod-published-theme.server";
import { nativeCodThemeForPublication, NATIVE_PREVIEW_PAYMENTS_ENABLED } from "../lib/native-cod-feature";
import { COD_DISCOUNT_SCOPE, hasNativeCodDiscountAccess } from "../lib/native-cod-discount.server";
import { authenticate } from "../shopify.server";
import { COD_REVIEW_THEME, loadCodThemeReview, parseReviewCharge, requireReviewShop, saveCodThemeReview } from "../lib/cod-theme-review.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  requireReviewShop(session.shop);
  const discountCodesAvailable = await hasNativeCodDiscountAccess(admin, session.shop).catch(() => false);
  const consent = new URL(`https://${session.shop}/admin/oauth/install`);
  consent.search = new URLSearchParams({client_id:"3879fe641910f37451baf743e76059ee",
    scope:"read_files,read_orders,read_products,write_app_proxy,write_files,write_products,write_orders,write_draft_orders,write_order_edits",
    optional_scopes:COD_DISCOUNT_SCOPE}).toString();
  const [settings, publishedTheme] = await Promise.all([loadCodThemeReview(session.shop), readCodPublishedTheme()]);
  const themeId = nativeCodThemeForPublication(COD_REVIEW_THEME, publishedTheme);
  return { discountCodesAvailable, discountConsentUrl:consent.href, settings, themeId, previewPayments: NATIVE_PREVIEW_PAYMENTS_ENABLED };
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  requireReviewShop(session.shop);
  if (request.method !== "POST") throw new Response("Method not allowed", { status: 405 });
  const form = await request.formData();
  try {
    const current = await loadCodThemeReview(session.shop);
    const revision = String(form.get("revision"));
    if (!/^\d+$/.test(revision)) throw new Error("Refresh the page before saving.");
    const intent = form.get("intent");
    if (intent !== "toggle" && intent !== "save" && intent !== "customer-toggle") throw new Error("Invalid settings action.");
    if (intent === "toggle" && !["true", "false"].includes(String(form.get("enabled")))) throw new Error("Invalid switch value.");
    if (intent === "customer-toggle") {
      if (!["true","false"].includes(String(form.get("customerEnabled")))) throw new Error("Invalid customer mode.");
      const enable = form.get("customerEnabled") === "true";
      if (enable) {
        const publishedTheme = await readCodPublishedTheme(true);
        if (publishedTheme !== nativeCodThemeForPublication(COD_REVIEW_THEME, publishedTheme))
          throw new Error("Publish a supported Cartwala Advance COD theme first, then turn on customer checkout.");
      }
      await saveCodThemeReview(session.shop,{...current,enabled:enable || current.enabled,customerEnabled:enable,revision:Number(revision)});
      return {ok:true,message:enable?"Customer Advance COD is ON.":"Customer Advance COD is OFF. Customers use normal checkout."};
    }
    const percent = String(form.get("advancePercent"));
    if (intent === "save" && !/^\d+$/.test(percent)) throw new Error("Enter a whole advance percentage from 10 to 50.");
    await saveCodThemeReview(session.shop, {
      enabled: intent === "toggle" ? form.get("enabled") === "true" : current.enabled,
      customerEnabled: current.customerEnabled,
      advancePercent: intent === "save" ? Number(percent) : current.advancePercent,
      codFeePaise: intent === "save" ? parseReviewCharge(form.get("codCharge")) : current.codFeePaise,
      revision: Number(revision),
    });
    return { ok: true, message: intent === "toggle"
      ? form.get("enabled") === "true" ? NATIVE_PREVIEW_PAYMENTS_ENABLED ? current.customerEnabled ? "Advance COD is ON for the published checkout." : "Advance COD is ON in the duplicate theme. Preparing a checkout does not charge; paying uses the active Shopify gateway." : "Theme review is ON. Advance payments remain disabled." : "Advance COD is OFF. Place Order goes directly to normal checkout."
      : "Preview percentage and charge saved. Refresh the duplicate theme to see them." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save preview settings." };
  }
};
const inr = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
export default function CodThemeReview() {
  const { settings, themeId, previewPayments, discountCodesAvailable, discountConsentUrl } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const advance = Math.floor((40000 * settings.advancePercent + 50) / 100);
  return <s-page heading="Advance COD — theme review">
    <s-section heading="Duplicate theme controls">
      <p>These settings control the supported Cartwala Advance COD themes. {previewPayments ? "Customer checkout uses the supported theme that is published." : "Advance payments are disabled."}</p>
      {result && <p role={result.ok ? "status" : "alert"}>{result.message}</p>}
      <p>Advance COD switch: <strong>{settings.enabled ? "ON" : "OFF"}</strong></p>
      <Form method="post">
        <input type="hidden" name="intent" value="toggle" />
        <input type="hidden" name="revision" value={settings.revision} />
        <input type="hidden" name="enabled" value={String(!settings.enabled)} />
        <button type="submit" role="switch" aria-checked={settings.enabled} disabled={busy}>
          {settings.enabled ? "Turn Advance COD OFF" : "Turn Advance COD ON"}
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
    <s-section heading="Customer checkout">
      <p>Customer Advance COD: <strong>{settings.enabled && settings.customerEnabled ? "ON" : "OFF"}</strong></p>
      <p>Publish this theme first. Until customer checkout is turned on here, the published store uses normal checkout.</p>
      <Form method="post"><input type="hidden" name="intent" value="customer-toggle" />
        <input type="hidden" name="revision" value={settings.revision} />
        <input type="hidden" name="customerEnabled" value={String(!settings.customerEnabled)} />
        <button type="submit" disabled={busy}>{settings.customerEnabled ? "Turn customer checkout OFF" : "Turn customer checkout ON"}</button>
      </Form>
    </s-section>
    <s-section heading="Advance COD discounts">
      <p>{discountCodesAvailable ? "Eligible public merchandise codes can be applied before calculating the advance." : "Shopify must allow this app to read discount rules before customers can apply codes in Advance COD."}</p>
      {!discountCodesAvailable && <a href={discountConsentUrl} target="_blank" rel="noopener noreferrer">Allow discount lookup</a>}
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
