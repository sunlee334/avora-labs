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
 * **한국어판만** 사이트맵에 넣는 경로.
 *
 * `SITEMAP_EXCLUDED` 와 다릅니다 — 저쪽은 어느 언어에서도 색인하지 않는
 * 경로이고, 이쪽은 한국어에서는 색인하되 나머지 언어에서는 빼는 경로입니다.
 *
 * ── 왜 이런 것이 필요한가 ──────────────────────────────────
 * `/panel`(검증단 모집)은 국내 러닝 크루 대상입니다. 페이지 자체는 5개 언어로
 * 만들지만(이 저장소는 `[lang]` 동적 라우트라 한 언어만 만드는 쪽이 예외
 * 처리입니다), 팔지도 않는 시장에서 유입을 받아 봐야 전환되지 않고 얇은
 * 페이지가 사이트 품질 신호를 끌어내립니다.
 *
 * 페이지에는 `noindex` 가 붙습니다. 사이트맵에서도 빼야 신호가 어긋나지
 * 않습니다 — `tests/e2e/product-seo.spec.ts` 가 그 어긋남을 잡습니다.
 */
export const SITEMAP_KO_ONLY = ['/panel'] as const;

/**
 * 이 주소를 사이트맵에 넣을 것인가.
 *
 * `astro.config.ts` 의 filter 가 이것을 씁니다. 판정을 설정 파일이 아니라
 * 여기 두는 이유는 위 두 배열과 규칙이 한 파일에 모여 있어야 나중에 셋이
 * 따로 놀지 않기 때문입니다.
 */
export function inSitemap(url: string, indexedLocales: readonly string[]): boolean {
  if (SITEMAP_EXCLUDED.some((excluded) => url.includes(excluded))) return false;
  // 한국어판만 넣는 경로는 `/ko/` 를 지나야 통과합니다.
  if (SITEMAP_KO_ONLY.some((path) => url.includes(path))) return url.includes('/ko/');
  /*
   * 아직 색인하지 않는 언어는 사이트맵에도 넣지 않습니다. 넣으면 사이트맵은
   * "색인해 달라", 페이지는 "하지 말라" 고 서로 다른 말을 하게 됩니다 —
   * tests/e2e/product-seo.spec.ts 가 그 어긋남을 잡습니다.
   *
   * 목록을 여기서 import 하지 않고 **받는** 이유: 이 파일은 `astro.config.ts`
   * 와 `scripts/check-slugs.mjs` 가 함께 씁니다. 후자는 Node 가 직접 읽으므로
   * 상대 import 에 확장자가 필요한데, 그러면 TypeScript 쪽 설정을 함께 바꿔야
   * 합니다. 인자로 받으면 이 파일은 아무것도 의존하지 않은 채로 남습니다.
   */
  return indexedLocales.some((locale) => url.includes(`/${locale}/`));
}

/**
 * slug 검사가 쓰는 형태. 앞뒤 슬래시를 떼어 낸 낱말입니다.
 *
 * `checkSlug()` 가 **접두 일치**로 봅니다 — 완전 일치로 하면 `checkout-tips` 가
 * 통과해 버리고, 그게 정확히 위에서 말한 조용한 사고입니다.
 */
export const RESERVED_SLUG_PREFIXES = SITEMAP_EXCLUDED.map((path) => {
  /*
   * 접두 일치가 사이트맵의 부분 문자열 일치와 대응하는 **근거**는 모든
   * 항목이 `/` 로 시작한다는 것입니다. 주소가 `/ko/support/posts/{slug}/`
   * 이므로 `/cart` 는 slug 선두에서만 매치합니다.
   *
   * 누가 슬래시 없이 `'cart'` 를 넣으면 사이트맵은 `my-cart-guide` 를
   * 중간에서 삼키는데 여기 접두 검사는 통과시킵니다 — 그 순간 이 파일이
   * 존재하는 이유가 사라집니다. 주석이 아니라 코드로 막습니다.
   */
  if (!path.startsWith('/')) {
    throw new Error(`SITEMAP_EXCLUDED 항목은 '/' 로 시작해야 합니다: ${JSON.stringify(path)}`);
  }
  const word = path.replace(/^\/+/, '').replace(/\/+$/, '');
  // 빈 조각이 들어오면 ''.startsWith 가 언제나 참이라 모든 글이 막힙니다.
  if (!word) {
    throw new Error(`SITEMAP_EXCLUDED 에 빈 조각이 있습니다: ${JSON.stringify(path)}`);
  }
  return word;
});

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
