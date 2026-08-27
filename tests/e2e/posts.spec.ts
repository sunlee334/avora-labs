import { test, expect, type APIRequestContext } from '@playwright/test';

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
      const res = await request.get(`/${lang}/support/posts`);
      expect(res.status(), `/${lang}/support/posts`).toBe(200);
    }
  });

  test('글이 있는 언어는 제목이 보인다', async ({ page }) => {
    await page.goto('/ko/support/posts');
    await expect(page.locator('.postList__title')).toHaveCount(1);
    await expect(page.locator('.postList')).toContainText('배송 안내');
  });

  test('글이 없는 언어는 빈 상태를 말한다', async ({ page }) => {
    // 라운드랩의 죽은 메뉴는 눌러도 "사용할 수 없습니다" 후 홈으로 튕겼습니다.
    // 목록이 열리고 아직 없다고 말하는 것은 다른 상태입니다.
    await page.goto('/zh/support/posts');
    await expect(page.locator('.postList')).toHaveCount(0);
    await expect(page.locator('.postList__empty')).toBeVisible();
  });

  test('다른 언어 글이 섞이지 않는다', async ({ request }) => {
    const html = await (await request.get('/zh/support/posts')).text();
    expect(html).not.toContain('배송 안내');
    expect(html).not.toContain('Shipping notice');
  });

  test('카테고리로 나뉘어 있다', async ({ page }) => {
    // 필터가 아니라 그룹입니다 — 독자가 한 카테고리의 글에 도달하면 됩니다.
    await page.goto('/ko/support/posts');
    await expect(page.locator('.wrap h2.kicker')).toContainText('공지');
  });

  test('빈 그룹은 제목만 남기지 않는다', async ({ page }) => {
    // 픽스처는 notice 뿐입니다. journal 제목이 나오면 그 아래가 비어
    // 고장으로 보입니다.
    await page.goto('/ko/support/posts');
    await expect(page.locator('.wrap h2.kicker')).toHaveCount(1);
  });
});

test.describe('상세', () => {
  test('본문이 초기 HTML 에 있다', async ({ request }) => {
    // JS 로 채우면 답변엔진과 크롤러가 본문을 못 봅니다.
    const html = await (await request.get(`/ko/support/posts/${SLUG}`)).text();
    expect(html).toContain('지금 확정된 것');
    expect(html).toContain('국내 배송만 받습니다');
  });

  test('번역본이 없는 언어에는 글이 없다', async ({ request }) => {
    for (const lang of LOCALES.filter((l) => !HAS_POST.includes(l))) {
      const res = await request.get(`/${lang}/support/posts/${SLUG}`);
      expect(res.status(), `/${lang}/support/posts/${SLUG}`).toBe(404);
    }
  });

  test('마크다운이 실제 태그로 렌더된다', async ({ page }) => {
    await page.goto(`/ko/support/posts/${SLUG}`);
    await expect(page.locator('.post__body h2').first()).toBeVisible();
    await expect(page.locator('.post__body li').first()).toBeVisible();
  });

  test('날짜에 기계가 읽는 값이 있다', async ({ page }) => {
    await page.goto(`/ko/support/posts/${SLUG}`);
    await expect(page.locator('.post__meta time')).toHaveAttribute('datetime', '2026-08-27');
  });

  test('날짜를 숫자와 하이픈으로만 쓴다', async ({ request }) => {
    /*
     * Intl.DateTimeFormat 을 쓰면 중국어가 `2026年8月27日` 로 나오는데
     * 그 세 글자는 어느 번역 파일에도 마크다운에도 없어 폰트 서브셋에
     * 들어가지 않습니다. 화면에서 그 글자만 다른 서체로 떨어집니다.
     */
    const html = await (await request.get(`/ko/support/posts/${SLUG}`)).text();
    expect(html).toContain('>2026-08-27<');
    for (const ch of ['年', '月', '日']) expect(html).not.toContain(ch);
  });
});

test.describe('hreflang 이 없는 주소를 가리키지 않는다', () => {
  test('글 상세는 실재하는 번역본만 가리킨다', async ({ request }) => {
    const html = await (await request.get(`/ko/support/posts/${SLUG}`)).text();
    const alts = alternatesOf(html);

    // 번역본 2개 + x-default = 3. 5개가 나오면 zh·th·vi 가 404 입니다.
    expect(alts.map((a) => a.hreflang).sort()).toEqual(['en', 'ko-KR', 'x-default']);
  });

  test('가리키는 주소가 실제로 열린다', async ({ request }) => {
    const html = await (await request.get(`/ko/support/posts/${SLUG}`)).text();
    for (const { hreflang, href } of alternatesOf(html)) {
      const res = await request.get(new URL(href).pathname);
      expect(res.status(), `${hreflang} → ${href}`).toBe(200);
    }
  });

  test('x-default 는 기본 언어판이 있을 때만 나온다', async ({ request }) => {
    // 픽스처에 영어판이 있으므로 지금은 나와야 합니다. 한국어 전용 글이라면
    // 아예 없어야 합니다 — 그 분기는 Base.astro 가 담당합니다.
    const html = await (await request.get(`/ko/support/posts/${SLUG}`)).text();
    const x = alternatesOf(html).find((a) => a.hreflang === 'x-default');
    expect(x?.href).toContain('/en/support/posts/');
  });

  test('글이 아닌 기존 페이지는 여전히 6개다', async ({ request }) => {
    // Base.astro 를 고쳤으므로 회귀를 봅니다. i18n.spec.ts 의 hreflang 검사는
    // 홈 5개만 돌아서 나머지 페이지를 아무도 보지 않습니다.
    for (const path of ['/ko/product', '/ko/support', '/ko/legal/terms', '/ko/support/posts']) {
      const html = await (await request.get(path)).text();
      expect(alternatesOf(html), path).toHaveLength(6);
    }
  });
});

test.describe('구조화 데이터', () => {
  test('Article 이 붙는다', async ({ request }) => {
    const html = await (await request.get(`/ko/support/posts/${SLUG}`)).text();
    const schema = jsonLdOf(html).find((s) => s['@type'] === 'Article');
    expect(schema, 'Article 스키마가 없습니다').toBeTruthy();
    expect(schema.headline).toBe('배송 안내');
    expect(schema.datePublished).toBe('2026-08-27');
    expect(schema.inLanguage).toBe('ko');
    expect(schema.author.name).toBe('AVORA');
  });

  test('고치지 않은 글에는 dateModified 가 없다', async ({ request }) => {
    // 발행일을 복사해 넣으면 "고친 적 없음" 과 "발행일에 고침" 을 구분할 수
    // 없게 됩니다. 이 파일의 원칙 — 확정되지 않은 값은 넣지 않습니다.
    const html = await (await request.get(`/ko/support/posts/${SLUG}`)).text();
    const schema = jsonLdOf(html).find((s) => s['@type'] === 'Article');
    expect('dateModified' in schema).toBe(false);
  });

  test('빵부스러기가 고객센터를 거쳐 간다', async ({ request }) => {
    const html = await (await request.get(`/ko/support/posts/${SLUG}`)).text();
    const crumb = jsonLdOf(html).find((s) => s['@type'] === 'BreadcrumbList');
    const names = crumb.itemListElement.map((i: any) => i.name);
    expect(names).toEqual(['AVORA', '고객센터', '공지·읽을거리', '배송 안내']);
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
        urls.some((u) => u.includes(`/${lang}/support/posts/${SLUG}`)),
        `${lang} 글이 사이트맵에 없습니다`,
      ).toBe(true);
    }
  });

  test('목록도 5개 언어 다 들어간다', async ({ request }) => {
    const urls = await sitemapUrls(request);
    for (const lang of LOCALES) {
      expect(urls.some((u) => u.includes(`/${lang}/support/posts/`)), lang).toBe(true);
    }
  });

  test('없는 언어의 글 주소는 사이트맵에도 없다', async ({ request }) => {
    const urls = await sitemapUrls(request);
    for (const lang of LOCALES.filter((l) => !HAS_POST.includes(l))) {
      expect(urls.some((u) => u.includes(`/${lang}/support/posts/${SLUG}`)), lang).toBe(false);
    }
  });
});
