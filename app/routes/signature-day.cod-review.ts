import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { COD_REVIEW_SHOP, COD_REVIEW_THEME, loadCodThemeReview } from "../lib/cod-theme-review.server";
import { nativeCodThemeForPublication } from "../lib/native-cod-feature";
import { readCodPublishedTheme } from "../lib/cod-published-theme.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const headers = { "Cache-Control": "no-store" };
  if (!session || session.shop !== COD_REVIEW_SHOP)
    return Response.json({ available: false, enabled: false }, { status: 404, headers });
  try {
    const settings = await loadCodThemeReview(session.shop);
    const publishedTheme = settings.enabled ? await readCodPublishedTheme() : null;
    const themeId = nativeCodThemeForPublication(COD_REVIEW_THEME, publishedTheme);
    return Response.json({ available: true, themeId, ...settings, paymentsEnabled: false }, { headers });
  } catch {
    return Response.json({ available: false, enabled: false, paymentsEnabled: false }, { status: 503, headers });
  }
};
