import { test, expect } from '@playwright/test';
import ko from '../../../src/i18n/ko.json' with { type: 'json' };
import { BUSINESS } from '../../../src/config/site';

/**
 * 폼이 실패했을 때 사람이 할 수 있는 일.
 *
 * ── 왜 이것이 중요한가 ──────────────────────────────────────
 * 10월에 러닝 크루에 링크를 뿌립니다. 폼 제출이 실패하면 지원자는 버튼을
 * 누르고 아무 일도 안 일어나는 걸 보고 떠납니다. 담당자는 **몇 주 뒤에**
 * "지원자가 왜 이렇게 없지" 라고 생각하고, 그때는 접촉 기회가 지나갔습니다.
 *
 * 800명 목표가 조용히 0이 될 수 있는 경로입니다.
 */

test.describe('실패해도 길이 남는다', () => {
  test('실패 문구가 뜨고 입력값이 남는다', async ({ page }) => {
    await page.route('**/api/launch-notify', (route) => route.fulfill({ status: 500, body: '{}' }));
    await page.goto('/ko/');

    const form = page.locator('[data-launch-notify]').first();
    const input = form.locator('input[type="email"]');
    const typed = 'keep-me@example.com';
    await input.fill(typed);
    await form.locator('button[type="submit"]').click();

    await expect(form.locator('.notify__state')).toBeVisible();
    // 다시 적게 만들면 그 자리에서 포기합니다.
    await expect(input, '실패했는데 입력값이 지워졌습니다').toHaveValue(typed);
  });

  test('버튼이 로딩 상태에 갇히지 않는다', async ({ page }) => {
    await page.route('**/api/launch-notify', (route) => route.fulfill({ status: 500, body: '{}' }));
    await page.goto('/ko/');
    const form = page.locator('[data-launch-notify]').first();
    const submit = form.locator('button[type="submit"]');

    await form.locator('input[type="email"]').fill('retry@example.com');
    await submit.click();
    await expect(form.locator('.notify__state')).toBeVisible();

    await expect(submit, '버튼이 죽은 채로 남았습니다').toBeEnabled();
    await expect(submit, '라벨이 "보내는 중" 에서 안 돌아왔습니다').toHaveText(ko.notify.submit);
  });

  test('두 번 연속 실패하면 사람에게 닿는 길을 준다', async ({ page }) => {
    /*
     * 한 번 실패는 흔합니다 — 지하철에서 신호가 끊기는 것 같은 일입니다.
     * 그때 바로 "메일로 보내세요" 를 띄우면 사이트가 고장 난 것처럼 보입니다.
     * 두 번째부터 보여줍니다.
     */
    await page.route('**/api/launch-notify', (route) => route.fulfill({ status: 500, body: '{}' }));
    await page.goto('/ko/');
    const form = page.locator('[data-launch-notify]').first();
    const state = form.locator('.notify__state');

    await form.locator('input[type="email"]').fill('twice@example.com');
    await form.locator('button[type="submit"]').click();
    await expect(state).toBeVisible();
    expect(await state.innerText(), '첫 실패에 이미 대체 경로가 나왔습니다').not.toContain(BUSINESS.email);

    await form.locator('button[type="submit"]').click();
    await expect(state).toContainText(BUSINESS.email);
  });
});

test.describe('404 에서 길을 잃지 않는다', () => {
  test('홈과 검증단 두 곳으로 갈 수 있다', async ({ page }) => {
    // 10월에 링크가 잘못 공유되는 상황을 염두에 둔 것입니다.
    await page.goto('/ko/없는주소');
    await expect(page.locator('.notfound__paths a[href$="/ko/"]')).toHaveCount(1);
    await expect(page.locator('.notfound__paths a[href$="/panel/"]')).toHaveCount(1);
  });

  test('5개 언어 모두 같은 두 길을 준다', async ({ page }) => {
    for (const lang of ['ko', 'en', 'zh', 'th', 'vi']) {
      await page.goto(`/${lang}/no-such-page`);
      await expect(page.locator('.notfound__paths a'), lang).toHaveCount(2);
    }
  });
});
