import { test, expect } from '@playwright/test';
import { SOCIAL, WEB_ANALYTICS_TOKEN } from '../../src/config/site';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { jsonLdOf } from '../support/sitemap';

/**
 * 브랜드가 밖으로 내보내는 신호들 — 여정 · 계정 · 색 · 계측.
 *
 * 이 파일이 지키는 것은 전부 **화면을 봐서는 드러나지 않는** 종류입니다.
 * 여정은 두 페이지를 나란히 놓아야 어긋난 것이 보이고, sameAs 와 theme-color 는
 * 아예 눈에 띄지 않으며, 계측 스크립트는 있는지 없는지가 처리방침과 맞아야
 * 하는데 둘을 함께 보는 사람이 없습니다.
 */

const LANGS = ['ko', 'en', 'zh', 'th', 'vi'] as const;

test.describe('여정은 한 가지만 말한다', () => {
  test('홈과 제품 페이지가 같은 순서를 말한다', async ({ page }) => {
    /*
     * 오래도록 홈은 Sun → Sweat → Water → Movement → Reapply 였고 제품
     * 페이지는 SUN → MOVE → SWEAT → WATER → RESET 이었습니다. 각 페이지만
     * 보면 둘 다 멀쩡해서 아무도 알아채지 못했습니다.
     */
    await page.goto('/ko/');
    const home = await page.locator('.journey__word').allInnerTexts();

    await page.goto('/ko/product');
    const product = await page.locator('.day li').allInnerTexts();

    expect(home.length, '홈 여정이 비어 있습니다').toBeGreaterThan(0);
    expect(product.length, '제품 여정이 비어 있습니다').toBe(home.length);
    expect(
      home.map((w) => w.trim().toUpperCase()),
      '홈과 제품 페이지가 다른 여정을 말합니다',
    ).toEqual(product.map((w) => w.trim().toUpperCase()));
  });

  test('여정의 끝과 브랜드 약속의 끝이 같은 말이다', async ({ page }) => {
    // 여정이 RESET 으로 끝나야 Brand Promise 의 RESET 과 이어집니다.
    // 예전 홈은 Reapply 로 끝나서 같은 화면 안에서 두 서사가 따로 놀았습니다.
    await page.goto('/ko/');
    const journey = await page.locator('.journey__word').allInnerTexts();
    const promise = await page.locator('.promise h3').allInnerTexts();
    expect(journey.at(-1)?.trim().toUpperCase()).toBe(promise.at(-1)?.trim().toUpperCase());
  });

  test('5개 언어 모두 다섯 단계다', async ({ page }) => {
    for (const lang of LANGS) {
      await page.goto(`/${lang}/`);
      await expect(page.locator('.journey li'), lang).toHaveCount(5);
    }
  });
});

test.describe('브랜드 계정', () => {
  test('푸터에서 인스타그램으로 나가는 길이 있다', async ({ page }) => {
    for (const lang of LANGS) {
      await page.goto(`/${lang}/`);
      const link = page.locator(`footer a[href="${SOCIAL.instagramUrl}"]`);
      await expect(link, lang).toHaveCount(1);
      // 새 창으로 열면서 opener 를 넘기면 그쪽 페이지가 이 창을 조작할 수 있습니다.
      await expect(link).toHaveAttribute('rel', /noopener/);
    }
  });

  test('구조화 데이터가 사이트와 계정을 같은 주체로 묶는다', async ({ request }) => {
    // 푸터 링크만으로는 검색엔진이 "우리 계정" 인지 "남의 계정" 인지 모릅니다.
    const res = await request.get('/ko/');
    const org = jsonLdOf(await res.text()).find((s) => s['@type'] === 'Organization');
    expect(org, 'Organization 스키마가 없습니다').toBeTruthy();
    expect(org.sameAs, 'sameAs 가 푸터 링크와 어긋납니다').toContain(SOCIAL.instagramUrl);
  });
});

test.describe('브랜드 색', () => {
  test('브라우저 상단바가 Mist Blue 다', async ({ page }) => {
    /*
     * Mist Blue 는 오프 화이트 위 1.62:1 이라 글자색으로는 어디에도 쓸 수
     * 없습니다. theme-color 는 브라우저 크롬을 칠하는 값이라 그 제약이 없고,
     * 페이지를 열 때 가장 먼저 보이는 면이라 브랜드 색을 놓기 좋은 자리입니다.
     * 값을 여기 베껴 적지 않고 토큰에서 읽습니다.
     */
    const tokens = (await import('../../tokens/design-tokens.json', { with: { type: 'json' } }))
      .default;
    await page.goto('/ko/');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      tokens.color.brand.surfaceAlt.value,
    );
  });
});

test.describe('방문 기록 측정', () => {
  test('처리방침의 설명과 실제 스크립트가 어긋나지 않는다', async ({ page }) => {
    /*
     * 이 검사가 잡으려는 것은 **한쪽만 바뀌는 것** 입니다.
     * 토큰을 지웠는데 처리방침에는 "측정합니다" 가 남거나, 도구를 켰는데
     * 방침에는 아무 말이 없는 상태. 둘 다 화면으로는 드러나지 않습니다.
     */
    await page.goto('/ko/');
    const beacon = page.locator('script[src*="cloudflareinsights.com"]');
    await expect(beacon, '토큰 설정과 실제 스크립트가 다릅니다').toHaveCount(
      WEB_ANALYTICS_TOKEN ? 1 : 0,
    );

    if (WEB_ANALYTICS_TOKEN) {
      const attr = await beacon.getAttribute('data-cf-beacon');
      expect(JSON.parse(attr ?? '{}').token).toBe(WEB_ANALYTICS_TOKEN);
    }
  });

  test('처리방침이 어떤 도구를 쓰는지 밝힌다', async ({ page }) => {
    // 도구를 아직 켜지 않았어도 방침에는 있어야 합니다 — 켜는 순간 방침이
    // 뒤따라오지 않으면 실제와 게시물이 어긋나는 구간이 생깁니다.
    await page.goto('/ko/legal/privacy');
    const body = await page.locator('main').innerText();
    expect(body, '측정 도구 항목이 없습니다').toContain(ko.legal.privacy.analytics.heading);
    expect(body, '어떤 도구인지 밝히지 않았습니다').toMatch(/Cloudflare Web Analytics/);
  });
});
