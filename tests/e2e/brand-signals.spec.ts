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
      tokens.color.palette.aegean.value,
    );
  });
});

test.describe('방문 기록 측정', () => {
  test('우리 코드가 내보내는 비콘이 설정과 일치한다', async ({ page }) => {
    /*
     * 이 검사가 보는 것은 **우리 코드가 내보내는 비콘 하나뿐** 입니다.
     *
     * 운영에는 이것 말고 Cloudflare 엣지가 자동으로 끼워 넣는 비콘이 하나 더
     * 있고, 실제 측정은 지금 그쪽이 하고 있습니다. 그건 여기서 잡을 수
     * 없습니다 — 테스트는 wrangler dev 를 상대하므로 엣지가 없고, 자동 주입은
     * 브라우저처럼 보이는 요청에만 걸립니다.
     *
     * 그래도 이 검사가 필요한 이유: 자동 주입이 켜진 채로 WEB_ANALYTICS_TOKEN
     * 까지 채우면 비콘이 둘이 되어 방문 수가 두 배로 잡힙니다. 이 검사는
     * "설정한 대로만 나간다" 를 지켜, 그 실수가 났을 때 최소한 우리 쪽 비콘이
     * 의도한 것인지 확인할 수 있게 합니다.
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
    /*
     * 자동 주입이든 우리 코드든 **같은 도구** 입니다. 그래서 방침 문구는
     * 어느 쪽이 실어 나르는지와 무관하게 늘 있어야 합니다.
     *
     * 예전에는 이 문구가 "측정 도구를 켜지 않은 동안에는 스크립트가 실리지
     * 않습니다" 로 끝났습니다. 엣지가 자동으로 넣기 시작한 뒤로는 그 문장이
     * 손님에게 "지금은 수집하지 않는구나" 로 읽혀서 지웠습니다.
     */
    await page.goto('/ko/legal/privacy');
    const body = await page.locator('main').innerText();
    expect(body, '측정 도구 항목이 없습니다').toContain(ko.legal.privacy.analytics.heading);
    expect(body, '어떤 도구인지 밝히지 않았습니다').toMatch(/Cloudflare Web Analytics/);
  });
});
