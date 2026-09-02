import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 언어를 바꾸면 실제로 그 페이지가 있는가.
 *
 * 화면이 제시하는 언어와 검색엔진에 알리는 언어가 갈라지면, 사람은 404 를
 * 만나고 크롤러는 없는 주소를 받습니다.
 */

test.describe('언어를 바꾸면 그 페이지가 있다', () => {
  /*
   * 글은 한국어·영어 두 벌뿐인데 전환기가 5개 언어를 무조건 돌았습니다.
   * 나머지 셋은 빌드되지 않은 주소라 언어를 바꾼 사람이 404 를 봤습니다.
   */
  const pages = [
    '/ko/',
    '/ko/product/',
    '/ko/support/posts/',
    '/ko/support/posts/shipping-notice/', // 두 언어만 있는 글 — 이 검사의 핵심
  ];

  for (const path of pages) {
    test(`${path} 의 언어 링크가 전부 살아 있다`, async ({ page, request }) => {
      await page.goto(path);
      const hrefs = await page.locator('.lang__item').evaluateAll((els) =>
        els.map((el) => el.getAttribute('href')!),
      );

      expect(hrefs.length, '언어 링크가 없습니다').toBeGreaterThan(0);

      for (const href of hrefs) {
        const res = await request.get(href);
        expect(res.status(), `${path} 의 언어 링크 ${href}`).toBe(200);
      }
    });
  }

  test('전환기와 hreflang 이 같은 목록을 말한다', async ({ page }) => {
    /*
     * 링크가 살아 있기만 하면 "전부 한국어로 보내기" 로도 통과합니다.
     * 화면이 제시하는 언어와 검색엔진에 알리는 언어가 **같아야** 합니다 —
     * 갈라진 순간이 바로 이 결함이 생긴 순간이었습니다.
     */
    await page.goto('/ko/support/posts/shipping-notice/');

    const shown = await page.locator('.lang__item').evaluateAll((els) =>
      els.map((el) => new URL((el as HTMLAnchorElement).href).pathname).sort(),
    );
    const declared = await page
      .locator('link[rel="alternate"][hreflang]:not([hreflang="x-default"])')
      .evaluateAll((els) =>
        els.map((el) => new URL((el as HTMLLinkElement).href).pathname).sort(),
      );

    expect(shown).toEqual(declared);
    // 이 글은 두 언어뿐입니다. 다섯이 나오면 좁히는 일이 안 일어난 것입니다.
    expect(shown.length, '이 글은 ko·en 두 벌뿐입니다').toBe(2);
    expect(shown.length).toBeLessThan(LOCALES.length);
  });
});
