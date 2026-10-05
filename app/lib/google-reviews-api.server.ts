export type GoogleReview = {
  reviewId: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
};
export type GoogleReviewPayload = {
  reviews: GoogleReview[];
  averageRating?: number;
  totalReviewCount?: number;
};

export async function fetchGoogleReviews(
  location: string, token: string, request: typeof fetch = fetch,
): Promise<GoogleReviewPayload> {
  if (!/^accounts\/\d+\/locations\/\d+$/.test(location)) throw new Error("Invalid Google location");
  const result: GoogleReviewPayload = { reviews: [] };
  const seen = new Set<string>();
  let pageToken = "";
  do {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${location}/reviews`);
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("orderBy", "updateTime desc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await request(url, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Google reviews request failed (${response.status}). Check API approval and profile access.`);
    const page = await response.json() as GoogleReviewPayload & { nextPageToken?: string };
    if (page.reviews !== undefined && !Array.isArray(page.reviews)) throw new Error("Invalid Google reviews response");
    result.reviews.push(...(page.reviews || []));
    if (result.averageRating === undefined) result.averageRating = page.averageRating;
    if (result.totalReviewCount === undefined) result.totalReviewCount = page.totalReviewCount;
    pageToken = page.nextPageToken || "";
    if (pageToken && seen.has(pageToken)) throw new Error("Google returned a repeated page token");
    seen.add(pageToken);
  } while (pageToken);
  return result;
}
