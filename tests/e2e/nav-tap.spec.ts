import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 내비게이션 탭 영역.
 *
 * WCAG 2.5.8(AA)은 24×24 CSS 픽셀을 요구합니다. "제품" 처럼 두 글자짜리
 * 한글 항목은 글자 폭만으로 23px 이라 1px 모자랐습니다 — 높이 44 는
 * 넉넉했는데 폭에서 걸린 경우입니다.
 *
 * 글자 수가 적은 언어에서 먼저 터지므로 5개 언어를 전부 잽니다.
 *
 * 모바일은 여기서 재지 않습니다 — `mobile-ux.spec.ts` 가 이미 모든 화면의
 * 모든 `a[href], button` 을 44×44 로 재고 있어 더 엄격합니다. 같은 것을 약하게
 * 한 번 더 재는 검사는 통과해도 알려주는 것이 없습니다.
 */
test.describe('내비 탭 영역', () => {
  test('헤더 항목이 5개 언어 모두 24×24 이상이다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '헤더 링크는 900px 이상에서만 보입니다');

    for (const locale of LOCALES) {
      await page.goto(`/${locale}/`);
      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll('.nav__links a, .nav__links button, .nav__utility a')) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 && b.height === 0) continue;
          if (b.width < 24 || b.height < 24) {
            out.push(`${(el.textContent || '').trim().slice(0, 12)} ${Math.round(b.width)}×${Math.round(b.height)}`);
          }
        }
        return out;
      });
      expect(small, `${locale} 에서 24×24 미만`).toEqual([]);
    }
  });
});
