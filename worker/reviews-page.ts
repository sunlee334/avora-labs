/**
 * 리뷰 페이지를 서버에서 채웁니다.
 *
 * ── 왜 서버인가 ─────────────────────────────────────────────
 * 후기를 자바스크립트로만 채우면 **답변엔진과 크롤러가 보지 못합니다.**
 * 리뷰 페이지의 값어치는 대부분 거기서 나오므로, 초기 HTML 에 들어 있어야
 * 합니다. 그래서 정적 페이지를 가져와 HTMLRewriter 로 그 자리만 바꿉니다.
 *
 * ── 이스케이프 ──────────────────────────────────────────────
 * 리뷰 본문과 이름은 **손님이 쓴 글**입니다. 그것을 HTML 로 넣는 순간
 * 저장형 XSS 의 자리가 됩니다. 이 파일의 모든 삽입은 escapeHtml 을 지납니다.
 * 관리 화면에서 같은 실수를 한 적이 있어(수령인 이름을 innerHTML 로 넣음)
 * 여기서는 처음부터 문자열을 직접 만들지 않고 헬퍼만 씁니다.
 */
import { listVisibleReviews, publicReview, reviewSummary, type ReviewSummary } from './reviews';

/** HTML 문맥에 넣을 수 있게 다듬습니다. 속성값까지 안전하도록 따옴표도 바꿉니다. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON-LD 를 <script> 안에 넣을 때 태그가 일찍 닫히지 않게 합니다. */
export function escapeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export interface SlotLabels {
  verified: string;
  sponsored: string;
  outOf: string;
  count: string;
  locale: string;
}

interface PublicReview {
  id: string;
  rating: number;
  body: string;
  author: string;
  sponsored: boolean;
  createdAt: string;
}

function stars(rating: number): string {
  // 별을 글자로 그리되 스크린리더에는 숫자로 읽힙니다 —
  // "★★★★☆" 를 그대로 읽으면 무슨 말인지 알 수 없습니다.
  const filled = '★'.repeat(rating);
  const empty = '☆'.repeat(5 - rating);
  return (
    `<span class="stars" aria-hidden="true">${filled}${empty}</span>` +
    `<span class="sr-only">${rating}</span>`
  );
}

function summaryHtml(summary: ReviewSummary, labels: SlotLabels): string {
  const average = summary.average ?? 0;
  const rows = ([5, 4, 3, 2, 1] as const)
    .map((star) => {
      const n = summary.distribution[star];
      const percent = summary.count === 0 ? 0 : Math.round((n / summary.count) * 100);
      return (
        `<div class="reviews__bar">` +
        `<span>${star}</span>` +
        `<span class="reviews__bar-track"><span class="reviews__bar-fill" style="width:${percent}%"></span></span>` +
        `<span class="reviews__bar-n">${n}</span>` +
        `</div>`
      );
    })
    .join('');

  return (
    `<div class="reviews__summary">` +
    `<p class="reviews__average"><strong>${average}</strong> <span>${escapeHtml(labels.outOf)}</span></p>` +
    `<p class="reviews__count">${summary.count}${escapeHtml(labels.count)}</p>` +
    `<div class="reviews__bars">${rows}</div>` +
    `</div>`
  );
}

function reviewHtml(review: PublicReview, labels: SlotLabels): string {
  const date = review.createdAt.slice(0, 10);
  const badges =
    `<span class="reviews__badge">${escapeHtml(labels.verified)}</span>` +
    (review.sponsored
      ? `<span class="reviews__badge reviews__badge--sponsored">${escapeHtml(labels.sponsored)}</span>`
      : '');

  return (
    `<li class="reviews__item">` +
    `<div class="reviews__head">${stars(review.rating)}${badges}</div>` +
    `<p class="reviews__body">${escapeHtml(review.body)}</p>` +
    `<p class="reviews__meta">${escapeHtml(review.author)} · <time datetime="${escapeHtml(date)}">${escapeHtml(date)}</time></p>` +
    `</li>`
  );
}

/**
 * 답변엔진에 내보낼 구조화 데이터.
 *
 * 후기가 하나도 없으면 **아무것도 내보내지 않습니다.** 리뷰 0건에
 * AggregateRating 을 붙이는 것은 없는 평판을 주장하는 일이고, 검색엔진의
 * 수동 조치 대상입니다.
 */
export function reviewJsonLd(
  summary: ReviewSummary,
  reviews: PublicReview[],
  productUrl: string,
): string | null {
  if (summary.count === 0 || summary.average === null) return null;

  return escapeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Daily Sunscreen',
    url: productUrl,
    brand: { '@type': 'Brand', name: 'AVORA' },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: summary.average,
      reviewCount: summary.count,
      bestRating: 5,
      worstRating: 1,
    },
    review: reviews.slice(0, 10).map((r) => ({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      author: { '@type': 'Person', name: r.author },
      datePublished: r.createdAt.slice(0, 10),
      reviewBody: r.body,
    })),
  });
}

/**
 * 정적 리뷰 페이지에 실제 후기를 채워 돌려줍니다.
 *
 * 후기가 0건이면 정적 페이지를 **그대로** 내보냅니다 — 그 화면이 이미
 * "아직 리뷰가 없습니다" 를 5개 언어로 말하고 있고, 그것이 사실입니다.
 */
export async function renderReviewsPage(
  page: Response,
  db: D1Database,
  productUrl: string,
): Promise<Response> {
  const [summary, records] = await Promise.all([
    reviewSummary(db),
    listVisibleReviews(db, 20, 0),
  ]);
  if (summary.count === 0) return page;

  const reviews = records.map(publicReview);
  const jsonLd = reviewJsonLd(summary, reviews, productUrl);

  let labels: SlotLabels | null = null;

  return new HTMLRewriter()
    .on('[data-reviews-slot]', {
      element(element) {
        labels = {
          verified: element.getAttribute('data-label-verified') ?? '',
          sponsored: element.getAttribute('data-label-sponsored') ?? '',
          outOf: element.getAttribute('data-label-out-of') ?? '',
          count: element.getAttribute('data-label-count') ?? '',
          locale: element.getAttribute('data-locale') ?? 'ko',
        };
        const list = reviews.map((r) => reviewHtml(r, labels!)).join('');
        element.setInnerContent(
          summaryHtml(summary, labels) + `<ul class="reviews__list">${list}</ul>`,
          { html: true },
        );
      },
    })
    .on('head', {
      element(element) {
        if (jsonLd) {
          element.append(`<script type="application/ld+json">${jsonLd}</script>`, {
            html: true,
          });
        }
      },
    })
    .transform(page);
}
