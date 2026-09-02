import { test, expect, type APIRequestContext } from '@playwright/test';
import { BUSINESS, INDEXED_LOCALES } from '../../src/config/site';

/**
 * 공지·읽을거리.
 *
 * ── 이 파일이 지키는 것 ─────────────────────────────────────
 * 글은 이 사이트에서 **모든 언어에 존재하지 않는 첫 자산**입니다. 지금까지는
 * 페이지 하나가 5개 언어를 다 만들었으므로 hreflang 을 5개 뿌리는 것이
 * 언제나 옳았습니다. 글은 한국어에만 있을 수도 있고, 그때 5개를 뿌리면
 * 검색엔진이 없는 주소를 크롤링해 404 를 받습니다.
 *
 * 그래서 여기서 보는 것은 "글이 보이는가" 보다 **"없는 것을 있다고 하지
 * 않는가"** 입니다.
 */

const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'] as const;

/** 픽스처 글. `src/content/posts/{ko,en}/shipping-notice.md` */
const SLUG = 'shipping-notice';
const HAS_POST: readonly string[] = ['ko', 'en'];

function alternatesOf(html: string): Array<{ hreflang: string; href: string }> {
  return [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(
    (m) => ({ hreflang: m[1], href: m[2] }),
  );
}

function jsonLdOf(html: string): any[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

test.describe('목록', () => {
  test('5개 언어 모두 열린다', async ({ request }) => {
    for (const lang of LOCALES) {
      const res = await request.get(`/${lang}/support/notice`);
      expect(res.status(), `/${lang}/support/notice`).toBe(200);
    }
  });

  test('글이 있는 언어는 제목이 보인다', async ({ page }) => {
    await page.goto('/ko/support/notice');
    await expect(page.locator('.postList__title')).toHaveCount(1);
    await expect(page.locator('.postList')).toContainText('배송 안내');
  });

  test('글이 없는 언어는 빈 상태를 말한다', async ({ page }) => {
    // 라운드랩의 죽은 메뉴는 눌러도 "사용할 수 없습니다" 후 홈으로 튕겼습니다.
    // 목록이 열리고 아직 없다고 말하는 것은 다른 상태입니다.
    await page.goto('/zh/support/notice');
    await expect(page.locator('.postList')).toHaveCount(0);
    await expect(page.locator('.postList__empty')).toBeVisible();
  });

  test('다른 언어 글이 섞이지 않는다', async ({ request }) => {
    const html = await (await request.get('/zh/support/notice')).text();
    expect(html).not.toContain('배송 안내');
    expect(html).not.toContain('Shipping notice');
  });

  test('카테고리가 목록이 아니라 주소로 갈린다', async ({ page }) => {
    /*
     * 한동안 두 카테고리를 한 페이지에 놓고 제목으로만 갈랐습니다. 이제는
     * 주소가 다릅니다 — 읽을거리는 최상위 `/journal`, 공지는 고객센터 안.
     * 그래서 한 목록 안에 그룹 제목이 있을 이유가 없습니다.
     */
    await page.goto('/ko/support/notice');
    await expect(page.locator('h1')).toContainText('공지');
    await expect(page.locator('.postList__item')).toHaveCount(1);
  });

  test('한쪽 목록에 다른 쪽 글이 섞이지 않는다', async ({ page }) => {
    // 픽스처는 notice 뿐입니다. 저널에 그것이 보이면 가르는 일이 안 된 것입니다.
    await page.goto('/ko/journal');
    await expect(page.locator('.postList__empty')).toBeVisible();
    await expect(page.locator('.postList__item')).toHaveCount(0);
  });
});

test.describe('상세', () => {
  test('본문이 초기 HTML 에 있다', async ({ request }) => {
    // JS 로 채우면 답변엔진과 크롤러가 본문을 못 봅니다.
    const html = await (await request.get(`/ko/support/notice/${SLUG}`)).text();
    expect(html).toContain('지금 확정된 것');
    expect(html).toContain('국내 배송만 받습니다');
  });

  test('번역본이 없는 언어에는 글이 없다', async ({ request }) => {
    for (const lang of LOCALES.filter((l) => !HAS_POST.includes(l))) {
      const res = await request.get(`/${lang}/support/notice/${SLUG}`);
      expect(res.status(), `/${lang}/support/notice/${SLUG}`).toBe(404);
    }
  });

  test('마크다운이 실제 태그로 렌더된다', async ({ page }) => {
    await page.goto(`/ko/support/notice/${SLUG}`);
    await expect(page.locator('.post__body h2').first()).toBeVisible();
    await expect(page.locator('.post__body li').first()).toBeVisible();
  });

  test('날짜에 기계가 읽는 값이 있다', async ({ page }) => {
    await page.goto(`/ko/support/notice/${SLUG}`);
    await expect(page.locator('.post__meta time')).toHaveAttribute('datetime', '2026-08-27');
  });

  test('날짜를 숫자와 하이픈으로만 쓴다', async ({ request }) => {
    /*
     * Intl.DateTimeFormat 을 쓰면 중국어가 `2026年8月27日` 로 나오는데
     * 그 세 글자는 어느 번역 파일에도 마크다운에도 없어 폰트 서브셋에
     * 들어가지 않습니다. 화면에서 그 글자만 다른 서체로 떨어집니다.
     */
    const html = await (await request.get(`/ko/support/notice/${SLUG}`)).text();
    expect(html).toContain('>2026-08-27<');
    for (const ch of ['年', '月', '日']) expect(html).not.toContain(ch);
  });
});

test.describe('넓은 내용이 화면 밖으로 잘리지 않는다', () => {
  /*
   * body 에 overflow-x: hidden 이 걸려 있습니다. 그래서 넓은 표가 넘치면
   * **가로 스크롤바조차 없이 글자만 잘려 보입니다** — 태국어 제품
   * 페이지에서 겪은 실패 모드이고, 그때는 아무도 몰랐습니다.
   */
  test('표가 스크롤 상자에 담긴다', async ({ page }) => {
    await page.goto(`/ko/support/notice/${SLUG}`);
    const box = page.locator('.post__body .tableScroll');
    await expect(box).toHaveCount(1);
    await expect(box).toHaveCSS('overflow-x', 'auto');
  });

  test('감싸도 표는 표로 남는다', async ({ page }) => {
    /*
     * `table { display: block; overflow-x: auto }` 가 흔한 요령이지만
     * 그러면 일부 스크린리더에서 행·열 탐색이 사라집니다 — 표를 표가
     * 아니게 만들어 스크롤을 얻는 셈입니다. 그래서 CSS 가 아니라
     * HTML 트리 단계에서 감쌉니다(src/hast/table-scroll.ts).
     */
    await page.goto(`/ko/support/notice/${SLUG}`);
    const table = page.locator('.tableScroll > table');
    await expect(table).toHaveCount(1);
    await expect(table).toHaveCSS('display', 'table');
    await expect(page.locator('.tableScroll th').first()).toBeVisible();
  });

  test('키보드로도 스크롤할 수 있다', async ({ page }) => {
    // tabindex 가 없으면 마우스·터치로만 움직일 수 있습니다 (WCAG 2.1.1).
    await page.goto(`/ko/support/notice/${SLUG}`);
    await expect(page.locator('.post__body .tableScroll')).toHaveAttribute('tabindex', '0');
  });

  test('320px 에서 표가 페이지를 밀어내지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`/ko/support/notice/${SLUG}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, '가로로 넘칩니다').toBeLessThanOrEqual(0);
  });

  test('영어판에도 같이 적용된다', async ({ page }) => {
    // 플러그인은 언어와 무관하게 모든 마크다운에 걸립니다.
    await page.goto(`/en/support/notice/${SLUG}`);
    await expect(page.locator('.post__body .tableScroll > table')).toHaveCount(1);
  });
});

test.describe('hreflang 이 없는 주소를 가리키지 않는다', () => {
  test('글 상세는 실재하는 번역본만 가리킨다', async ({ request }) => {
    const html = await (await request.get(`/ko/support/notice/${SLUG}`)).text();
    const alts = alternatesOf(html);

    // 번역본 2개 + x-default = 3. 5개가 나오면 zh·th·vi 가 404 입니다.
    expect(alts.map((a) => a.hreflang).sort()).toEqual(['en', 'ko-KR', 'x-default']);
  });

  test('가리키는 주소가 실제로 열린다', async ({ request }) => {
    const html = await (await request.get(`/ko/support/notice/${SLUG}`)).text();
    for (const { hreflang, href } of alternatesOf(html)) {
      const res = await request.get(new URL(href).pathname);
      expect(res.status(), `${hreflang} → ${href}`).toBe(200);
    }
  });

  test('x-default 는 대표 언어판이 있을 때만 나온다', async ({ request }) => {
    /*
     * 대표판은 한국어입니다(X_DEFAULT_LOCALE). 이 픽스처 글은 한국어판이
     * 있으므로 x-default 가 그쪽을 가리켜야 합니다. 대표 언어판이 없는
     * 글이라면 x-default 자체가 나오지 않아야 하고, 그 분기는 Base.astro 가
     * 담당합니다 — 없는 주소를 "여기가 기본" 이라고 알리는 것보다 침묵이
     * 낫습니다.
     *
     * 전에는 `/en/` 을 기대했습니다. 대표판을 한국어로 옮기면서 함께
     * 바뀐 것이지, 이 검사가 보던 규칙이 달라진 것은 아닙니다.
     */
    const html = await (await request.get(`/ko/support/notice/${SLUG}`)).text();
    const x = alternatesOf(html).find((a) => a.hreflang === 'x-default');
    expect(x?.href).toContain('/ko/support/notice/');
  });

  test('현재 언어는 언제나 목록에 있다', async ({ request }) => {
    /*
     * canonical 은 이 언어를 가리키는데 hreflang 목록에 없으면, 검색엔진에는
     * "이 페이지는 어느 언어판도 아니다" 로 읽힙니다. 호출부가 locales 를
     * 잘못 넘겨도 Base.astro 가 막아야 합니다.
     */
    for (const lang of HAS_POST) {
      const html = await (await request.get(`/${lang}/support/notice/${SLUG}`)).text();
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      const hrefs = alternatesOf(html)
        .filter((a) => a.hreflang !== 'x-default')
        .map((a) => a.href);
      expect(hrefs, `${lang}: canonical 이 hreflang 목록에 없습니다`).toContain(canonical);
    }
  });

  test('글이 아닌 기존 페이지는 여전히 6개다', async ({ request }) => {
    // Base.astro 를 고쳤으므로 회귀를 봅니다. i18n.spec.ts 의 hreflang 검사는
    // 홈 5개만 돌아서 나머지 페이지를 아무도 보지 않습니다.
    for (const path of ['/ko/product', '/ko/support', '/ko/legal/terms', '/ko/support/notice']) {
      const html = await (await request.get(path)).text();
      expect(alternatesOf(html), path).toHaveLength(6);
    }
  });
});

test.describe('구조화 데이터', () => {
  test('Article 이 붙는다', async ({ request }) => {
    const html = await (await request.get(`/ko/support/notice/${SLUG}`)).text();
    const schema = jsonLdOf(html).find((s) => s['@type'] === 'Article');
    expect(schema, 'Article 스키마가 없습니다').toBeTruthy();
    expect(schema.headline).toBe('배송 안내');
    expect(schema.datePublished).toBe('2026-08-27');
    expect(schema.inLanguage).toBe('ko');
    expect(schema.author.name).toBe(BUSINESS.brandName);
  });

  test('고치지 않은 글에는 dateModified 가 없다', async ({ request }) => {
    // 발행일을 복사해 넣으면 "고친 적 없음" 과 "발행일에 고침" 을 구분할 수
    // 없게 됩니다. 이 파일의 원칙 — 확정되지 않은 값은 넣지 않습니다.
    const html = await (await request.get(`/ko/support/notice/${SLUG}`)).text();
    const schema = jsonLdOf(html).find((s) => s['@type'] === 'Article');
    expect('dateModified' in schema).toBe(false);
  });

  test('빵부스러기가 고객센터를 거쳐 간다', async ({ request }) => {
    const html = await (await request.get(`/ko/support/notice/${SLUG}`)).text();
    const crumb = jsonLdOf(html).find((s) => s['@type'] === 'BreadcrumbList');
    const names = crumb.itemListElement.map((i: any) => i.name);
    expect(names).toEqual([BUSINESS.brandName, '고객센터', '공지', '배송 안내']);
  });
});

test.describe('사이트맵', () => {
  async function sitemapUrls(request: APIRequestContext): Promise<string[]> {
    const xml = await (await request.get('/sitemap-0.xml')).text();
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  }

  test('글 주소가 자동으로 들어간다', async ({ request }) => {
    // 파일 기반을 택한 이유 중 하나입니다. Worker 가 만드는 주소였다면
    // 사이트맵에 손으로 넣어야 하고, 그 손이 언젠가 빠집니다.
    const urls = await sitemapUrls(request);
    for (const lang of HAS_POST) {
      expect(
        urls.some((u) => u.includes(`/${lang}/support/notice/${SLUG}`)),
        `${lang} 글이 사이트맵에 없습니다`,
      ).toBe(true);
    }
  });

  test('목록은 색인하는 언어에 다 들어간다', async ({ request }) => {
    /*
     * 전에는 5개 언어를 다 봤습니다. ZH/TH/VI 는 진출(2028년)까지 색인하지
     * 않기로 하면서 사이트맵에서 뺐습니다 — 페이지는 그대로 열립니다.
     */
    const urls = await sitemapUrls(request);
    for (const lang of INDEXED_LOCALES) {
      expect(urls.some((u) => u.includes(`/${lang}/support/notice/`)), lang).toBe(true);
    }
  });

  test('없는 언어의 글 주소는 사이트맵에도 없다', async ({ request }) => {
    const urls = await sitemapUrls(request);
    for (const lang of LOCALES.filter((l) => !HAS_POST.includes(l))) {
      expect(urls.some((u) => u.includes(`/${lang}/support/notice/${SLUG}`)), lang).toBe(false);
    }
  });
});
