import assert from 'node:assert/strict';
import { fetchGoogleReviews } from '../app/lib/google-reviews-api.server.ts';

const requests = [];
const mock = async (url, options) => {
  requests.push(new URL(url));
  assert.equal(options.headers.Authorization, 'Bearer test-token');
  return Response.json(requests.length === 1
    ? { reviews: [{ reviewId: 'a', starRating: 'ONE', comment: 'Original text' }], averageRating: 3, totalReviewCount: 2, nextPageToken: 'next' }
    : { reviews: [{ reviewId: 'b', starRating: 'FIVE' }], averageRating: 3, totalReviewCount: 2 });
};
const result = await fetchGoogleReviews('accounts/123/locations/456', 'test-token', mock);
assert.equal(result.reviews.length, 2);
assert.equal(result.reviews[0].starRating, 'ONE');
assert.equal(result.reviews[0].comment, 'Original text');
assert.equal(requests[1].searchParams.get('pageToken'), 'next');
assert.equal(result.totalReviewCount, 2);
await assert.rejects(fetchGoogleReviews('https://evil.invalid', 'secret', mock), /Invalid Google location/);
await assert.rejects(fetchGoogleReviews('accounts/123/locations/456', 'secret', async () => new Response('', { status: 403 })), /403/);
await assert.rejects(fetchGoogleReviews('accounts/123/locations/456', 'secret', async () => Response.json({ nextPageToken: 'loop' })), /repeated page token/);
const empty = await fetchGoogleReviews('accounts/123/locations/456', 'test-token', async () => Response.json({ totalReviewCount: 0 }));
assert.deepEqual(empty.reviews, []);
console.log('Google reviews: pagination, original content, rating-only reviews, empty profile, access errors and loop protection passed.');
