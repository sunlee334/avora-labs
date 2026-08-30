import { test, expect } from '@playwright/test';

/**
 * 신청 전환이 **언제** 기록되는가.
 *
 * ── 왜 launch 폴더인가 ──────────────────────────────────────
 * 이 검사는 알림 신청 폼을 씁니다. 그 폼은 아직 팔 수 없을 때만 화면에
 * 있습니다(제품이 나오면 구매 버튼이 그 자리를 차지합니다). commerce 모드
 * 에서는 폼이 없으므로 여기 두어야 합니다 — 루트에 두면 두 모드에서 다
 * 돌아 commerce 쪽이 항상 실패합니다.
 */

test('신청 성공에만 전환이 기록된다', async ({ page }) => {
  /*
   * 클릭 시점에 심으면 형식 오류와 네트워크 실패까지 전환이 됩니다.
   * 여기서는 gtag 를 가짜로 심어 두고, 실패했을 때와 성공했을 때 각각
   * 무엇이 기록되는지 봅니다.
   */
  await page.goto('/ko/');
  await page.evaluate(() => {
    (window as any).__events = [];
    (window as any).gtag = (...args: unknown[]) => (window as any).__events.push(args);
  });

  const form = page.locator('[data-launch-notify]').first();
  const submit = form.locator('button[type="submit"]');

  // ① 형식이 틀린 주소 — 전환이 아닙니다.
  await form.locator('input[type="email"]').fill('not-an-email');
  await submit.click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__events.length), '잘못된 주소가 전환으로 잡혔습니다').toBe(0);

  /*
   * ② 서버가 실패했을 때 — 전환이 아닙니다.
   *
   * 이 경우가 이 검사의 핵심입니다. 형식 검증은 제출 전에 걸리므로 이벤트를
   * 어디에 두든 통과하지만, **응답을 기다리지 않고 심으면** 여기서 잡힙니다.
   * 800명이라는 수치로 12월에 판단을 다시 하기로 했는데, 실패까지 전환으로
   * 세면 그 판단이 틀어집니다.
   */
  await page.route('**/api/launch-notify', (route) =>
    route.fulfill({ status: 500, body: '{}' }),
  );
  await form.locator('input[type="email"]').fill(`fail-${Date.now()}@example.com`);
  await submit.click();
  await expect(form.locator('.notify__state')).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__events.length),
    '서버가 실패했는데 전환으로 잡혔습니다',
  ).toBe(0);
  await page.unroute('**/api/launch-notify');

  // ③ 정상 신청 — 전환입니다.
  await form.locator('input[type="email"]').fill(`ga-${Date.now()}@example.com`);
  await submit.click();
  await expect(form.locator('.notify__state')).toBeVisible();

  const events = (await page.evaluate(() => (window as any).__events)) as unknown[][];
  const signup = events.find((e) => e[0] === 'event' && e[1] === 'notify_signup');
  expect(signup, '전환이 기록되지 않았습니다').toBeTruthy();

  const params = signup![2] as Record<string, unknown>;
  expect(params.form_location, '어느 자리에서 신청했는지가 없습니다').toBeTruthy();
  expect(params.lang).toBe('ko');
  // 개인을 식별하는 값은 절대 보내지 않습니다 — GA4 약관 위반입니다.
  for (const [k, v] of Object.entries(params)) {
    expect(String(v), `${k} 에 이메일이 들어 있습니다`).not.toContain('@');
  }
});
