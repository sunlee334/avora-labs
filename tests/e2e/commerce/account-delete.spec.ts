import { test, expect, type Page } from '@playwright/test';
import commerce from '../../../src/config/commerce.json' with { type: 'json' };

/**
 * 탈퇴.
 *
 * 「개인정보 보호법」 제36조는 정보주체가 삭제를 요구할 수 있게 합니다.
 * 로그인 한 번으로 만들어진 계정을 지우려면 메일을 써야 하는 것은 균형이
 * 맞지 않아, 화면에서 직접 지울 수 있게 했습니다.
 *
 * 되돌릴 수 없는 동작이라 **잘못 눌리는 경로가 없는지** 가 이 파일의 관심사입니다.
 */

const WORD = commerce.accounts.deleteConfirm;

async function loginAs(page: Page, id: string): Promise<void> {
  const start = await page.request.get('/api/auth/login?provider=mock&returnTo=%2Fko%2Faccount', {
    maxRedirects: 0,
  });
  const callback = new URL(start.headers()['location']);
  callback.searchParams.set('code', id);
  await page.request.get(callback.href, { maxRedirects: 0 });
}

test.describe('로그인 지점의 고지', () => {
  test('누르기 전에 무엇을 받는지 알리고 방침으로 갈 수 있다', async ({ page }) => {
    /*
     * 개인정보를 받는 것은 이 버튼을 누르는 순간입니다. 방침 링크가 푸터에만
     * 있으면 그 자리에서 어디로 가는지 말하지 않는 셈이 됩니다.
     */
    await page.goto('/ko/account');
    const notice = page.locator('[data-account-signed]').locator('..').locator('.cart__notice');
    const link = page
      .locator('main a[href="/ko/legal/privacy/"], main a[href="/ko/legal/privacy"]')
      .first();
    await expect(link, '로그인 화면에 방침 링크가 없습니다').toBeVisible();
    await expect(notice.first()).toBeVisible();
  });
});

test.describe('탈퇴', () => {
  test('접혀 있고, 지워지는 것과 남는 것을 먼저 말한다', async ({ page }) => {
    await loginAs(page, `del-copy-${Date.now()}`);
    await page.goto('/ko/account');
    await expect(page.locator('[data-account-signed]')).toBeVisible();

    const box = page.locator('details.accountDelete');
    await expect(box).toHaveCount(1);
    // 다른 일을 하러 온 사람의 동선에 두면 잘못 누릅니다.
    expect(await box.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);

    await box.locator('summary').click();
    // 주문이 남는다는 사실을 지우기 **전에** 알려야 합니다.
    await expect(box).toContainText('전자상거래법');
  });

  test('문구가 다르면 서버까지 가지 않는다', async ({ page }) => {
    await loginAs(page, `del-typo-${Date.now()}`);
    await page.goto('/ko/account');
    await page.locator('details.accountDelete summary').click();

    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/account/delete')) calls.push(r.url());
    });

    await page.locator('#delete-confirm').fill('지워주세요');
    await page.locator('[data-delete-submit]').click();

    await expect(page.locator('[data-delete-error]')).toBeVisible();
    expect(calls, '틀린 문구로 서버를 불렀습니다').toHaveLength(0);
    // 계정은 그대로여야 합니다.
    expect((await page.request.get('/api/account/me')).status()).toBe(200);
  });

  test('화면을 지나쳐도 서버가 막는다', async ({ page }) => {
    /*
     * 확인 문구 검사가 화면에만 있으면 개발자 도구로 지나갈 수 있습니다.
     * 진짜 관문은 서버입니다.
     */
    await loginAs(page, `del-api-${Date.now()}`);
    const res = await page.request.post('/api/account/delete', { data: { confirm: 'nope' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('CONFIRM_MISMATCH');
    expect((await page.request.get('/api/account/me')).status()).toBe(200);
  });

  test('로그인하지 않으면 지울 수 없다', async ({ request }) => {
    const res = await request.post('/api/account/delete', { data: { confirm: WORD } });
    expect(res.status()).toBe(401);
  });

  test('문구가 맞으면 계정이 사라지고 로그아웃된다', async ({ page }) => {
    await loginAs(page, `del-ok-${Date.now()}`);
    await page.goto('/ko/account');
    await page.locator('details.accountDelete summary').click();

    await page.locator('#delete-confirm').fill(WORD);
    await page.locator('[data-delete-submit]').click();

    await expect(page.locator('[data-delete-done]')).toBeVisible();
    // 세션까지 끊겨야 합니다 — 남기면 다음 요청이 없는 계정을 가리킵니다.
    expect((await page.request.get('/api/account/me')).status()).toBe(401);
  });

  test('지운 뒤 화면에 남은 정보가 없다', async ({ page }) => {
    await loginAs(page, `del-clean-${Date.now()}`);
    await page.goto('/ko/account');
    await page.locator('details.accountDelete summary').click();
    await page.locator('#delete-confirm').fill(WORD);
    await page.locator('[data-delete-submit]').click();
    await expect(page.locator('[data-delete-done]')).toBeVisible();

    /*
     * 지워진 계정의 화면을 그대로 두면 남아 있는 이름·주문이 아직 살아 있는
     * 것처럼 보입니다.
     */
    await expect(page.locator('[data-profile-email]')).toBeHidden();
    await expect(page.locator('[data-identities]')).toBeHidden();
  });
});
