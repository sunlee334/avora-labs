import { test, expect } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };

const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'] as const;
const LANG_TAGS: Record<string, string> = {
  ko: 'ko-KR',
  en: 'en',
  zh: 'zh-Hans',
  th: 'th-TH',
  vi: 'vi-VN',
};

test.describe('언어별 페이지', () => {
  for (const locale of LOCALES) {
    test(`/${locale}/ — html lang, canonical, hreflang 5개 + x-default`, async ({ page }) => {
      await page.goto(`/${locale}/`);

      await expect(page.locator('html')).toHaveAttribute('lang', LANG_TAGS[locale]);

      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveAttribute('href', new RegExp(`/${locale}/$`));

      // 5개 언어 + x-default = 6개
      await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(6);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
    });

    test(`/${locale}/ — 본문이 초기 HTML 에 들어 있다`, async ({ request }) => {
      // JS 실행 없이 순수 HTML 만 받아 확인합니다. GEO·SEO 요구사항의 핵심입니다.
      const res = await request.get(`/${locale}/`);
      expect(res.status()).toBe(200);
      const html = await res.text();

      expect(html).toContain('For every movement.');
      expect(html).toContain('MOVE. SWEAT. REAPPLY.');
      /*
       * 여정 5단계가 전부 마크업에 있어야 합니다.
       *
       * 단어를 여기 베껴 적지 않습니다 — 예전에는 옛 순서(Movement·Reapply)가
       * 박혀 있어서, 기획안대로 여정을 고치자 **고친 쪽이 맞는데도** 이 검사가
       * 깨졌습니다. 잡아야 할 것(본문이 초기 HTML 에 없는 것)과 구분이 안 됩니다.
       *
       * 여정 단어는 5개 언어가 공유하는 브랜드 코드라 ko 하나에서 읽습니다.
       */
      for (const step of ko.home.journey.steps) {
        expect(html, `${locale} 에 ${step.word} 가 없습니다`).toContain(step.word);
      }
    });
  }

  test('언어 전환 시트를 열어 다른 언어로 이동한다', async ({ page }) => {
    await page.goto('/ko/');

    const sheet = page.locator('[data-lang-sheet]');
    // 닫힌 상태에서는 화면에 보이지 않아야 합니다.
    // (.nav 의 backdrop-filter 때문에 일반 div 로 만들면 여기서 새어 나왔습니다)
    await expect(sheet).toBeHidden();

    await page.locator('[data-lang-open]').click();
    await expect(sheet).toBeVisible();

    await page.locator('.lang__item[hreflang="th-TH"]').click();
    await expect(page).toHaveURL(/\/th\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'th-TH');
  });

  test('ESC 로 언어 시트가 닫힌다', async ({ page }) => {
    await page.goto('/ko/');
    await page.locator('[data-lang-open]').click();
    await expect(page.locator('[data-lang-sheet]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-lang-sheet]')).toBeHidden();
  });

  test('JS 없이도 푸터 링크로 언어를 바꿀 수 있다', async ({ browser }) => {
    // 시트는 JS 로 열리므로, JS 가 없을 때를 위해 푸터에 5개 언어 링크를 평문으로 둡니다.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/ko/');

    const viLink = page.locator('.footer__col a[hreflang="vi-VN"]');
    await expect(viLink).toBeVisible();
    await viLink.click();
    await expect(page).toHaveURL(/\/vi\/$/);
    await context.close();
  });
});
