import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { googleReviewsConfigured, googleReviewSnapshot, syncGoogleReviews } from "../lib/google-reviews.server";
import type { GoogleReviewPayload } from "../lib/google-reviews-api.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const snapshot = await googleReviewSnapshot(session.shop);
  const payload = snapshot?.payload as GoogleReviewPayload | undefined;
  return { configured: googleReviewsConfigured(session.shop),
    count: payload?.reviews.length ?? 0, total: payload?.totalReviewCount,
    rating: payload?.averageRating, updated: snapshot?.fetchedAt.toISOString() };
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get("intent") !== "sync") return { error: "Unknown action", success: false };
  try { await syncGoogleReviews(session.shop); return { success: true, error: "" }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : "Refresh failed" }; }
};
export default function GoogleReviews() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  return <s-page heading="Google Reviews">
    <s-section heading="Business Profile connection">
      <s-stack gap="base">
        <s-badge tone={data.configured ? "success" : "warning"}>{data.configured ? "Configured" : "Setup required"}</s-badge>
        <s-paragraph>Display your shop’s Google reviews on your storefront using your own app.</s-paragraph>
        {!data.configured && <s-banner heading="Connect Google Business Profile" tone="info">
          Configure your approved Google Cloud project and the shop owner’s Google sign-in on the server. The Maps link alone cannot retrieve every review. Do not enter passwords or tokens here.
        </s-banner>}
        <s-paragraph>{data.count} reviews loaded{data.total !== undefined ? ` of ${data.total} reported by Google` : ""}{data.rating !== undefined ? ` · ${data.rating}/5` : ""}</s-paragraph>
        {data.updated && <s-paragraph>Last refreshed: {new Date(data.updated).toLocaleString()}</s-paragraph>}
        {actionData?.error && <s-banner tone="critical">{actionData.error}</s-banner>}
        {actionData?.success && <s-banner tone="success">Google reviews refreshed.</s-banner>}
        <Form method="post"><input type="hidden" name="intent" value="sync" /><s-button type="submit" variant="primary" disabled={!data.configured || navigation.state !== "idle"}>Refresh reviews</s-button></Form>
      </s-stack>
    </s-section>
    <s-section heading="Show on your website"><s-paragraph>Add the Google Reviews app block to the duplicate theme, then preview it. Reviews become visible after Google setup and the first successful refresh. All star ratings are included.</s-paragraph></s-section>
  </s-page>;
}
