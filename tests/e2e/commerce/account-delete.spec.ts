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

/**
 * 탈퇴 상자를 연다.
 *
 * ── 왜 헬퍼인가: 전체 실행에서 절반쯤 실패하던 자리입니다 ──
 * `[data-account-signed]` 는 `hidden` 으로 시작하고 `/api/account/me` 가
 * 돌아온 뒤에야 열립니다. 그 응답 하나로 주문 목록·주소·연결된 로그인
 * 수단이 **한꺼번에 채워지므로**, 페이지 맨 아래의 이 상자는 그때 크게
 * 밀려 내려갑니다.
 *
 * `summary` 를 곧바로 누르면 Playwright 는 "보이는가" 만 보고 클릭을
 * 던지는데, 확인과 발사 사이에 요소가 이동하면 클릭이 **엉뚱한 자리에**
 * 떨어집니다. 상자는 닫힌 채로 남고, 실패는 그 다음 줄(`#delete-confirm`
 * 이 보이지 않음)에서 납니다 — 원인과 증상이 떨어져 있어 읽어서는 알 수
 * 없었습니다.
 *
 * 그래서 (1) 레이아웃이 앉을 때까지 기다리고 (2) **실제로 열렸는지**
 * 확인합니다. 열림을 확인하지 않으면 같은 경합이 다른 모습으로 돌아옵니다.
 */
async function openDeleteBox(page: Page): Promise<void> {
  await expect(page.locator('[data-account-signed]')).toBeVisible();
  const box = page.locator('details.accountDelete');
  /*
   * `[data-account-signed]` 가 보이는 시점은 `hidden` 이 떨어진 시점이지
   * 레이아웃이 앉은 시점이 아닙니다 — 같은 응답으로 주문·주소·연결 수단이
   * 이어서 채워지므로 그 뒤로도 한동안 움직입니다. 그래서 **열렸는지
   * 확인하고, 안 열렸으면 다시 누릅니다.** 확인만 하면 원인이 붙은 자리에서
   * 실패할 뿐 여전히 실패합니다.
   */
  await expect(async () => {
    await box.locator('summary').click();
    await expect(box, '탈퇴 상자가 열리지 않았습니다').toHaveAttribute('open', '');
  }).toPass({ timeout: 10_000 });
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

    await openDeleteBox(page);
    // 주문이 남는다는 사실을 지우기 **전에** 알려야 합니다.
    await expect(box).toContainText('전자상거래법');
  });

  test('문구가 다르면 서버까지 가지 않는다', async ({ page }) => {
    await loginAs(page, `del-typo-${Date.now()}`);
    await page.goto('/ko/account');
    await openDeleteBox(page);

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
    await openDeleteBox(page);

    await page.locator('#delete-confirm').fill(WORD);
    await page.locator('[data-delete-submit]').click();

    await expect(page.locator('[data-delete-done]')).toBeVisible();
    // 세션까지 끊겨야 합니다 — 남기면 다음 요청이 없는 계정을 가리킵니다.
    expect((await page.request.get('/api/account/me')).status()).toBe(401);
  });

  test('지운 뒤 화면에 남은 정보가 없다', async ({ page }) => {
    await loginAs(page, `del-clean-${Date.now()}`);
    await page.goto('/ko/account');
    await openDeleteBox(page);
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
