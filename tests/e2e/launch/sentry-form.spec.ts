import { test, expect } from '@playwright/test';

/**
 * 폼 실패가 눈에 남는가.
 *
 * ── 왜 launch 폴더인가 ──────────────────────────────────────
 * 홈의 알림 폼은 **팔 수 없을 때만** 화면에 있습니다. commerce 모드는 임시
 * 가격이 들어가 판매 가능 상태가 되므로 그 자리에 장바구니 버튼이 나옵니다.
 * 즉 commerce 에서 이 폼을 찾으면 영원히 못 찾습니다.
 */

test.describe('Sentry — 폼 실패', () => {
  test('폼 실패를 별도 이벤트로 셀 준비가 돼 있다', async ({ page }) => {
    /*
     * 지시서 H1-2 — "폼 제출 실패는 반드시 별도 이벤트로 잡을 것. 일반 JS
     * 에러에 묻히면 의미가 없다."
     *
     * 이벤트가 실제로 나가는지는 운영에서만 볼 수 있으므로, 여기서는 **부르는
     * 자리가 살아 있는지** 를 봅니다. 서버를 끊고 제출하면 실패 경로를 지나야
     * 하고, 그때 화면이 실패 상태가 됩니다. 그 상태가 곧 이벤트를 부른
     * 지점입니다.
     */
    await page.goto('/ko/');
    await page.route('**/api/launch-notify', (route) => route.abort('failed'));

    const form = page.locator('[data-source="home-hero"]');
    await form.locator('input[name="email"]').fill('test-fail@example.com');
    await form.locator('[data-notify-submit]').click();

    await expect(form.locator('[data-notify-state]')).toHaveAttribute('data-tone', 'bad');
    // 실패해도 버튼은 다시 눌리는 상태여야 합니다 (지시서 H1-1).
    await expect(form.locator('[data-notify-submit]')).toBeEnabled();
    // 입력값이 보존돼야 합니다 (지시서 H1-1).
    await expect(form.locator('input[name="email"]')).toHaveValue('test-fail@example.com');
  });
});
