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
    '/ko/support/notice/',
    '/ko/support/notice/shipping-notice/', // 두 언어만 있는 글 — 이 검사의 핵심
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

  test('전환기는 어디서나 다섯 언어를 주고, hreflang 은 있는 번역만 말한다', async ({
    page,
    request,
  }) => {
    /*
     * ── 두 번 고쳐진 자리입니다 ────────────────────────────
     *
     * 처음에는 전환기가 `LOCALES` 를 무조건 돌아, 한국어·영어뿐인 글에서
     * 없는 주소 셋을 가리켰습니다. 누르면 404 였습니다.
     *
     * 그래서 hreflang 과 **같은 목록**으로 좁혔습니다. 404 는 사라졌는데
     * 이번에는 한 언어로만 쓴 글에서 목록이 **한 줄** 이 됩니다 — 지금 보는
     * 언어 하나뿐인 시트를 여는 버튼입니다. 누를 수는 있는데 아무 데도 가지
     * 않습니다. 가두는 쪽으로 바뀌었을 뿐입니다.
     *
     * 지금은 갈라 둡니다. **화면은 언제나 다섯**, 번역이 없는 언어는 그
     * 언어의 첫 화면으로 보냅니다(푸터의 언어 목록과 같은 규칙입니다).
     * **hreflang 은 좁은 채로** 둡니다 — 그건 "이 페이지의 다른 언어판" 을
     * 말하는 자리라, 없는 번역을 있다고 하면 안 됩니다.
     *
     * ⚠️ 갈라 두면 "전부 한국어로 보내기" 같은 게으른 구현도 링크가 살아
     * 있다는 이유로 통과할 수 있습니다. 그래서 아래 세 가지를 함께 봅니다.
     */
    await page.goto('/ko/support/notice/shipping-notice/');

    const shown = await page.locator('.lang__item').evaluateAll((els) =>
      els.map((el) => ({
        path: new URL((el as HTMLAnchorElement).href).pathname,
        lang: el.getAttribute('hreflang') ?? '',
      })),
    );
    const declared = await page
      .locator('link[rel="alternate"][hreflang]:not([hreflang="x-default"])')
      .evaluateAll((els) =>
        els.map((el) => new URL((el as HTMLLinkElement).href).pathname).sort(),
      );

    // 1. 나갈 길은 언제나 다섯입니다 — 아무 데도 못 가는 컨트롤을 두지 않습니다.
    expect(shown.length, '전환기가 언어를 빠뜨렸습니다').toBe(LOCALES.length);

    // 2. 번역이 있는 언어는 hreflang 이 말하는 **바로 그 주소** 로 갑니다.
    //    이게 없으면 전부 한국어 첫 화면으로 보내도 통과합니다.
    for (const path of declared) {
      expect(
        shown.map((entry) => entry.path),
        `hreflang 이 말하는 ${path} 로 가는 링크가 전환기에 없습니다`,
      ).toContain(path);
    }
    expect(declared.length, '이 글은 ko·en 두 벌뿐입니다').toBe(2);

    // 3. 번역이 없는 언어는 **그 언어의** 자리로 갑니다 — 한국어로 되돌리지 않습니다.
    for (const { path, lang } of shown) {
      const locale = lang.split('-')[0];
      expect(path.startsWith(`/${locale}/`), `${lang} 링크가 ${path} 로 갑니다`).toBe(true);
    }

    // 4. 다섯 다 실제로 열립니다.
    for (const { path } of shown) {
      expect((await request.get(path)).status(), `${path} 가 열리지 않습니다`).toBe(200);
    }
  });
});
