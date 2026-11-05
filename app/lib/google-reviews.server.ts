import prisma from "../db.server";
import { fetchGoogleReviews, type GoogleReviewPayload } from "./google-reviews-api.server";

const inFlight = new Map<string, Promise<GoogleReviewPayload>>();
const retryAfter = new Map<string, number>();
const HOUR = 60 * 60 * 1000;
export function googleReviewsConfigured(shop: string) {
  return Boolean(shop === process.env.GOOGLE_REVIEWS_SHOP &&
    /^accounts\/\d+\/locations\/\d+$/.test(process.env.GOOGLE_REVIEWS_LOCATION || "") &&
    process.env.GOOGLE_REVIEWS_CLIENT_ID && process.env.GOOGLE_REVIEWS_CLIENT_SECRET &&
    process.env.GOOGLE_REVIEWS_REFRESH_TOKEN);
}
export async function googleReviewSnapshot(shop: string) {
  await prisma.googleReviewSnapshot.deleteMany({ where: { fetchedAt: { lt: new Date(Date.now() - 24 * HOUR) } } });
  return prisma.googleReviewSnapshot.findUnique({ where: { shop } });
}
export async function syncGoogleReviews(shop: string): Promise<GoogleReviewPayload> {
  if (!googleReviewsConfigured(shop)) throw new Error("Connect the shop owner's approved Google Business Profile project first.");
  const existing = inFlight.get(shop);
  if (existing) return existing;
  const work = (async () => {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token", client_id: process.env.GOOGLE_REVIEWS_CLIENT_ID!,
        client_secret: process.env.GOOGLE_REVIEWS_CLIENT_SECRET!, refresh_token: process.env.GOOGLE_REVIEWS_REFRESH_TOKEN!,
      }), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("Google sign-in needs to be reconnected.");
    const token = await response.json() as { access_token?: string };
    if (!token.access_token) throw new Error("Google did not return an access token.");
    const payload = await fetchGoogleReviews(process.env.GOOGLE_REVIEWS_LOCATION!, token.access_token);
    const data = { payload: JSON.parse(JSON.stringify(payload)), fetchedAt: new Date() };
    await prisma.googleReviewSnapshot.upsert({ where: { shop }, create: { shop, ...data }, update: data });
    return payload;
  })();
  inFlight.set(shop, work);
  try { return await work; } finally { inFlight.delete(shop); }
}
export async function storefrontGoogleReviews(shop: string) {
  if (!googleReviewsConfigured(shop)) return null;
  const snapshot = await googleReviewSnapshot(shop);
  if (snapshot && Date.now() - snapshot.fetchedAt.getTime() < HOUR) return snapshot.payload;
  if ((retryAfter.get(shop) || 0) <= Date.now()) {
    retryAfter.set(shop, Date.now() + 5 * 60 * 1000);
    try { return await syncGoogleReviews(shop); } catch { /* Retry later; never expose credentials or Google errors publicly. */ }
  }
  return snapshot?.payload ?? null;
}
