/**
 * 사이트맵에서 제외되는 경로 조각.
 *
 * ── 이 배열이 두 곳에서 쓰이는 이유 ──────────────────────────
 * 1. `astro.config.ts` 의 사이트맵 `filter` — 이 조각이 **들어 있는** 주소를 뺍니다
 * 2. `scripts/check-slugs.mjs` — 글 slug 가 이 조각으로 **시작하면** 빌드를 멈춥니다
 *
 * 한 곳에만 있으면 시간이 지나며 벌어집니다. 그때 생기는 사고는 조용합니다 —
 * `src/content/posts/ko/checkout-tips.md` 를 쓰면 주소가
 * `/ko/support/posts/checkout-tips/` 가 되고, 여기 `/checkout` 이 들어 있어
 * **사이트맵에서 소리 없이 빠집니다.** 검색에 안 잡히는데 아무도 모릅니다.
 *
 * ── 왜 부분 문자열인가 ──────────────────────────────────────
 * 사이트맵 filter 는 원래 그렇게 쓰여 있었고, 그게 맞습니다. `/ko/cart` 도
 * `/en/cart` 도 한 줄로 걸러야 하니까요. 대신 그 느슨함이 글 주소까지 삼키므로
 * slug 쪽에서 미리 막습니다.
 *
 * ── robots.txt 도 같은 것을 막습니다 ────────────────────────
 * `public/robots.txt` 의 `Disallow` 규칙(cart · checkout · order 를 언어 무관하게
 * 막는 와일드카드)이 `tests/e2e/product-seo.spec.ts` 에서 정규식으로 바뀌어
 * 사이트맵 전체와 대조됩니다. 즉 관문이 두 겹입니다.
 */

/**
 * 사이트맵 filter 가 쓰는 형태. 앞에 슬래시가 있고, `/order/` 만 뒤에도 있습니다.
 *
 * 뒤 슬래시가 붙은 이유: `/order/` 는 하위 경로(`/ko/order/lookup`)를 노리고,
 * 나머지는 그 자체가 끝인 경로입니다. 원래 값을 그대로 유지합니다 — 여기서
 * 모양을 바꾸면 사이트맵이 지금과 다르게 걸러집니다.
 */
export const SITEMAP_EXCLUDED = [
  '/404',
  '/admin',
  '/cart',
  '/checkout',
  '/account',
  '/order/',
] as const;

/**
 * slug 검사가 쓰는 형태. 앞뒤 슬래시를 떼어 낸 낱말입니다.
 *
 * `checkSlug()` 가 **접두 일치**로 봅니다 — 완전 일치로 하면 `checkout-tips` 가
 * 통과해 버리고, 그게 정확히 위에서 말한 조용한 사고입니다.
 */
export const RESERVED_SLUG_PREFIXES = SITEMAP_EXCLUDED.map((path) =>
  path.replace(/^\/+/, '').replace(/\/+$/, ''),
);

/**
 * 이 slug 를 써도 되는가.
 *
 * 돌려주는 것은 걸린 낱말이거나 `null` 입니다. 문자열을 돌려주면 호출한 쪽이
 * "무엇 때문에 막혔는지" 를 사람에게 말해 줄 수 있습니다.
 *
 * 과잉 차단을 감수합니다 — `orders-guide` 도 `order` 에 걸립니다. 검색에서
 * 사라지는 것보다 이름을 바꾸는 편이 낫고, 거절 메시지가 대안을 알려줍니다.
 */
export function checkSlug(slug: string): string | null {
  const normalized = slug.toLowerCase();
  return RESERVED_SLUG_PREFIXES.find((word) => normalized.startsWith(word)) ?? null;
}
