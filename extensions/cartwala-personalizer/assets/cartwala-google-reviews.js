(function () {
  const ratings = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  async function load(section) {
    if (section.dataset.loaded) return;
    section.dataset.loaded = 'true';
    try {
      const response = await fetch('/apps/cartwala-signature-day/reviews', { credentials: 'same-origin' });
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload.available || !Array.isArray(payload.data?.reviews) || !payload.data.reviews.length) return;
      const data = payload.data;
      const label = section.querySelector('[data-cw-review-label]').textContent;
      const summary = section.querySelector('[data-cw-review-summary]');
      summary.textContent = `${data.averageRating ?? ''}/5 · ${data.totalReviewCount ?? data.reviews.length} ${label}`;
      const list = section.querySelector('[data-cw-review-list]');
      const more = section.querySelector('[data-cw-review-more]');
      const template = section.querySelector('[data-cw-review-template]');
      let shown = 0;
      function renderNext() {
        const end = Math.min(shown + 6, data.reviews.length);
        for (; shown < end; shown++) {
          const review = data.reviews[shown];
          const card = template.content.cloneNode(true);
          card.querySelector('[data-cw-review-name]').textContent = review.reviewer?.displayName || section.querySelector('[data-cw-review-anonymous]').textContent;
          const stars = ratings[review.starRating];
          card.querySelector('[data-cw-review-rating]').textContent = stars ? `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} (${stars}/5)` : '';
          card.querySelector('[data-cw-review-comment]').textContent = review.comment || '';
          const date = card.querySelector('[data-cw-review-date]');
          if (review.createTime && Number.isFinite(Date.parse(review.createTime))) {
            date.dateTime = review.createTime;
            date.textContent = new Date(review.createTime).toLocaleDateString();
          }
          list.appendChild(card);
        }
        more.hidden = shown >= data.reviews.length;
      }
      more.addEventListener('click', renderNext);
      renderNext();
      section.hidden = false;
    } catch { section.hidden = true; }
  }
  function init() { document.querySelectorAll('[data-cw-google-reviews]').forEach(load); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('shopify:section:load', init);
})();
