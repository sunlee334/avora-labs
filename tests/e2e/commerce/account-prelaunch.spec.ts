import { test, expect, type Page } from '@playwright/test';

/**
 * 마이페이지가 출시 전 상태를 정직하게 말하는가 — 판매 가능한 빌드.
 *
 * commerce 모드에서는 팔 수 있으므로 주문 영역이 그대로 나와야 합니다.
 * launch 모드의 짝(tests/e2e/launch/account-prelaunch.spec.ts)과 함께 봐야
 * "판매 여부에 따라 화면이 갈린다" 가 지켜집니다.
 */
async function loginAs(page: Page, code: string): Promise<void> {
  const start = await page.request.get(
    '/api/auth/login?provider=mock&returnTo=%2Fko%2Faccount',
    { maxRedirects: 0 },
  );
  const cb = new URL(start.headers()['location']);
  cb.searchParams.set('code', code);
  await page.request.get(cb.href, { maxRedirects: 0 });
}

test('판매 중에는 주문 영역이 그대로 나온다', async ({ page }) => {
  await loginAs(page, `pre-${Date.now()}`);
  await page.goto('/ko/account');
  await expect(page.locator('[data-orders-state]')).toBeVisible();
  await expect(page.locator('[data-claim]')).toBeVisible();
  await expect(page.locator('[data-my-reviews]')).toBeVisible();
  await expect(page.locator('.preLaunch'), '판매 중에는 출시 전 안내가 없습니다').toHaveCount(0);
});
