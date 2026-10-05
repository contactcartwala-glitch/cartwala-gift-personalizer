import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { storefrontGoogleReviews } from "../lib/google-reviews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return Response.json({ available: false }, { status: 503 });
  const data = await storefrontGoogleReviews(session.shop);
  return Response.json({ available: Boolean(data), data }, { headers: { "Cache-Control": "no-store" } });
};
