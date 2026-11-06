import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { COD_REVIEW_SHOP, COD_REVIEW_THEME, loadCodThemeReview } from "../lib/cod-theme-review.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const headers = { "Cache-Control": "no-store" };
  if (!session || session.shop !== COD_REVIEW_SHOP)
    return Response.json({ available: false, enabled: false }, { status: 404, headers });
  try {
    const settings = await loadCodThemeReview(session.shop);
    return Response.json({ available: true, themeId: COD_REVIEW_THEME, ...settings, paymentsEnabled: false }, { headers });
  } catch {
    return Response.json({ available: false, enabled: false, paymentsEnabled: false }, { status: 503, headers });
  }
};
