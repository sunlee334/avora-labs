import { test, expect } from '@playwright/test';

/**
 * 홈 끝의 요청 — 팔 수 있을 때.
 *
 * 판매가 시작되면 신청 폼이 사라지고 "제품 보기" 가 다시 주된 것이 됩니다.
 * launch 모드의 짝(tests/e2e/launch/home-cta.spec.ts)과 함께 봐야
 * "모드에 따라 주된 것이 바뀐다" 가 지켜집니다.
 */
test.describe('홈 끝의 요청', () => {
  test('제품 보기가 주된 것으로 돌아온다', async ({ page }) => {
    await page.goto('/ko/');
    const link = page.locator('main a.cta[href$="/product"]');
    await expect(link).toHaveCount(1);
    await expect(link).not.toHaveClass(/cta--ghost/);
  });

  test('판매 중에는 홈에 신청 폼이 없다', async ({ page }) => {
    await page.goto('/ko/');
    await expect(page.locator('[data-launch-notify]')).toHaveCount(0);
  });
});
