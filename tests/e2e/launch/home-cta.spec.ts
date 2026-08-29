import { test, expect } from '@playwright/test';

/**
 * 홈 끝의 두 요청 — 팔 수 없을 때.
 *
 * 스토리를 끝까지 읽은 사람에게 "제품 보기" 와 신청 폼을 64px 간격으로
 * 나란히 놓아 두 가지를 동시에 시키고 있었습니다. 게다가 "제품 보기" 를
 * 누르면 도착한 곳에서 **또 같은 요청** 을 받습니다.
 *
 * 지금 1순위는 명단이므로 폼이 주된 것입니다.
 */
test.describe('홈 끝의 요청', () => {
  test('신청이 주된 것이고 제품 보기는 보조다', async ({ page }) => {
    await page.goto('/ko/');
    const link = page.locator('main a.cta[href$="/product"]');
    await expect(link, '제품 보기 링크').toHaveCount(1);
    await expect(link).toHaveClass(/cta--ghost/);
  });

  test('신청 폼이 제품 보기보다 위에 온다', async ({ page }) => {
    await page.goto('/ko/');
    const pos = await page.evaluate(() => {
      const y = (el: Element | null) => (el ? el.getBoundingClientRect().top + window.scrollY : -1);
      return {
        form: y(document.querySelector('[data-source="home-end"]')),
        link: y(document.querySelector('main a.cta[href$="/product"]')),
      };
    });
    expect(pos.form).toBeGreaterThan(0);
    expect(pos.form, '주된 것이 위에 옵니다').toBeLessThan(pos.link);
  });
});
