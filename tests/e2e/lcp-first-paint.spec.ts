import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * 첫 화면이 스크립트를 기다리지 않는가.
 *
 * `fetchpriority="high"` 로 그림을 먼저 받아 놓고 `opacity: 0` 으로 덮어 두면,
 * 브라우저는 그것을 LCP 후보에서 빼기 때문에 일찍 받은 값이 사라집니다.
 */

/**
 * 이 요소가, 또는 그것을 감싼 어느 조상이 **투명한 채로 있는가.**
 *
 * ⚠️ 클래스 이름을 보지 않습니다. `.rise` 가 붙었는지 소스에서 찾으면 구현의
 * 모양을 못 박게 되고, 등장 효과를 다른 이름으로 다시 만드는 순간 검사가
 * 조용히 통과합니다. 보아야 할 것은 **실제로 보이느냐** 입니다.
 */
async function hiddenAncestor(page: Page, selector: string): Promise<string | null> {
  return page.locator(selector).first().evaluate((el) => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (Number(getComputedStyle(node).opacity) < 1) {
        return `${node.tagName.toLowerCase()}.${node.className || '(무클래스)'}`;
      }
    }
    return null;
  });
}

/**
 * 페이지 스크립트를 **못 오게 막습니다.**
 *
 * 느린 회선에서 첫 페인트 직전의 상태가 이것입니다. `<head>` 의 인라인
 * 스크립트는 그대로 돌아 `html.js` 를 답니다 — 즉 "감추는 쪽" 은 켜지고
 * "푸는 쪽" 만 늦는, 정확히 문제가 되는 조합이 만들어집니다.
 */
async function blockModuleScripts(page: Page) {
  await page.route('**/_astro/*.js', (route) => route.abort());
}

test.describe('첫 화면은 스크립트를 기다리지 않는다', () => {
  /*
   * LCP 요소가 `opacity: 0` 으로 시작하면 브라우저가 그것을 LCP 후보에서
   * 빼기 때문에, 그림을 아무리 일찍 받아도 점수에 반영되지 않습니다.
   * 그리고 그것을 푸는 스크립트는 문서 순서상 Sentry(52KB) 뒤에 있습니다.
   */
  const screens = [
    { path: '/ko/', selector: '.hero__copy h1', what: '홈 히어로' },
    { path: '/ko/product/', selector: '.product-hero__media img', what: '제품 사진' },
    { path: '/ko/brand/', selector: '#story h1', what: '브랜드 첫 문단' },
  ];

  for (const { path, selector, what } of screens) {
    test(`${what} 가 스크립트 없이도 보인다`, async ({ page }) => {
      await blockModuleScripts(page);
      await page.goto(path);

      const hidden = await hiddenAncestor(page, selector);
      expect(
        hidden,
        `${what} 가 ${hidden} 때문에 투명합니다 — 스크립트가 늦으면 첫 페인트가 늦습니다`,
      ).toBeNull();
    });
  }

  test('스크립트가 오면 아래 덩어리도 나타난다', async ({ page }) => {
    /*
     * 위 검사만 있으면 "등장 효과를 통째로 지운다" 로도 통과합니다.
     * 첫 화면 밖에서는 그 효과가 살아 있어야 합니다 — 그래야 위의 셋이
     * **골라서 뺀 것** 이 됩니다.
     */
    await page.goto('/ko/brand/');
    const later = page.locator('.rise').first();
    await expect(later, '등장 효과가 통째로 사라졌습니다').toHaveCount(1);
    await expect
      .poll(async () => later.evaluate((el) => getComputedStyle(el).opacity), { timeout: 5000 })
      .toBe('1');
  });
});

test.describe('히어로가 잘려 나갈 픽셀을 받지 않는다', () => {
  /*
   * 원본은 가로인데 휴대폰 히어로는 세로로 깁니다. `cover` 로 채우면 가로의
   * 56% 가 잘리는데, 한동안 `sizes` 로 "화면 폭의 2.4배가 필요하다" 고 알려
   * 1600w 를 받게 했습니다 — 선명도는 지켰지만 **잘릴 픽셀까지 내려받았습니다.**
   *
   * 세로로 미리 자른 사진을 따로 주면 그 낭비가 사라집니다. LCP 이미지라
   * 그 차이가 첫 페인트에 직접 닿습니다.
   */
  test('휴대폰에는 세로 사진을, 넓은 화면에는 가로 사진을 준다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    const mobile = await page
      .locator('.hero__media img')
      .evaluate((el: HTMLImageElement) => el.currentSrc);
    expect(mobile, '휴대폰이 가로 사진을 받고 있습니다').toContain('portrait');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    const wide = await page
      .locator('.hero__media img')
      .evaluate((el: HTMLImageElement) => el.currentSrc);
    expect(wide, '넓은 화면이 세로 사진을 받고 있습니다').not.toContain('portrait');
  });

  test('세로 사진이 히어로 박스와 같은 비율이다', () => {
    /*
     * 비율이 어긋나면 `cover` 가 다시 잘라내고, 그러면 `sizes="100vw"` 가
     * 틀린 값이 됩니다 — 세로 사진을 둔 이유가 사라집니다.
     */
    const meta = readFileSync('src/assets/images/SOURCES.md', 'utf8');
    expect(meta, '크롭 상자가 기록되지 않았습니다').toContain('width: 707');
    // 707 / 1049 = 0.674 · 히어로 박스 390 / 579 = 0.674
    expect(707 / 1049).toBeCloseTo(390 / 579, 2);
  });

  test('받침 이미지는 가로다', async ({ page }) => {
    /*
     * `<source>` 를 하나도 못 쓰는 브라우저는 대체로 데스크톱 쪽입니다.
     * 세로 크롭을 넓은 화면에 늘리면 구도가 깨집니다.
     */
    await page.goto('/ko/');
    const fallback = await page
      .locator('.hero__media img')
      .getAttribute('src');
    expect(fallback, '받침이 세로 사진입니다').not.toContain('portrait');
  });
});
