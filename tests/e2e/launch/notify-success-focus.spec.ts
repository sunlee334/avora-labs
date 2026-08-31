import { test, expect } from '@playwright/test';

/**
 * 신청이 끝난 뒤의 상태.
 *
 * 성공하면 입력칸과 활동 선택이 감춰집니다. 그 순간 두 가지가 어긋날 수
 * 있는데, 둘 다 화면만 봐서는 드러나지 않습니다.
 */

/** 봇 문턱(2초)을 넘겨 실제로 저장되게 합니다. */
async function submit(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#notify input[type="email"]').fill(`succ-${Date.now()}@example.com`);
  await page.waitForTimeout(2200);
  await page.locator('#notify button[type="submit"]').click();
  await expect(page.locator('#notify [data-notify-state]')).toHaveAttribute('data-tone', 'ok', {
    timeout: 10_000,
  });
}

test.describe('신청을 마친 뒤', () => {
  test('초점이 완료 문구로 옮겨간다', async ({ page }) => {
    /*
     * 방금 누른 제출 버튼이 `.notify__row` **안에** 있습니다. 그것을 감추는
     * 순간 초점이 갈 곳을 잃고 `<body>` 로 떨어집니다 — 키보드만 쓰는 사람은
     * 다음 Tab 에서 화면 맨 위 건너뛰기 링크로 돌아가고, 방금 무슨 일이
     * 일어났는지도 알 수 없습니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await submit(page);

    await expect(page.locator('#notify [data-notify-state]')).toBeFocused();
  });

  test('첫 화면의 버튼도 함께 거둔다', async ({ page }) => {
    /*
     * 히어로 버튼의 문구는 제출 버튼과 같습니다. 이미 신청한 사람에게 같은
     * 말을 계속 권하면 안 된 줄 알고 다시 누릅니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await expect(page.locator('.hero__cta')).toBeVisible();

    await submit(page);
    await expect(page.locator('.hero__cta'), '버튼이 그대로 남아 있습니다').toBeHidden();
  });
});
