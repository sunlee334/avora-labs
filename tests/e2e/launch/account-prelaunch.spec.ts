import { test, expect } from '@playwright/test';

/**
 * 마이페이지가 출시 전 상태를 정직하게 말하는가 — 팔 수 없는 빌드.
 *
 * 이 화면의 대부분은 주문이 존재해야 의미가 있습니다. 팔 수 없는 동안에는
 * 전부 빈 목록이고, 문구는 "주문할 때 입력하면" 처럼 일어날 수 없는 일을
 * 말합니다. 헤더 우측의 유일한 항목이 그런 화면으로 가고 있었습니다.
 *
 * ── 왜 마크업을 보는 검사가 섞여 있는가 ─────────────────────
 * 로그인 후 화면은 launch 모드에서 열 수 없습니다 — 이 모드는 mock 로그인
 * 제공자를 켜지 않기 때문입니다(playwright.config.ts 의 workerVars).
 * 그래서 눈으로 볼 수 있는 것(로그인 전 문구)은 화면에서, 로그인해야 보이는
 * 것은 서버가 내려준 HTML 에서 확인합니다. commerce 쪽 짝이 실제로 로그인해
 * 반대 방향을 지킵니다.
 */
test.describe('출시 전 마이페이지', () => {
  test('로그인 안내가 주문을 약속하지 않는다', async ({ page }) => {
    // 예전 문구는 "로그인하지 않아도 주문할 수 있습니다" 였습니다 — 지금은
    // 주문 자체가 불가능하므로 거짓입니다.
    await page.goto('/ko/account');
    const anon = page.locator('[data-account-anon]');
    await expect(anon).toBeVisible();
    await expect(anon).toContainText('출시 알림');
    await expect(anon).not.toContainText('주문할 수 있습니다');
  });

  test('로그인 수단은 그대로 제공된다', async ({ page }) => {
    await page.goto('/ko/account');
    await expect(page.locator('[data-login-buttons]')).toBeAttached();
    await expect(page.locator('[data-profile-email]')).toBeAttached();
  });

  test('로그인 후 화면에 출시 전 안내가 실려 있다', async ({ page }) => {
    await page.goto('/ko/account');
    await expect(page.locator('.preLaunch')).toHaveCount(1);
  });

  test('주문 영역이 감춰진 감싸개 안에 들어 있다', async ({ page }) => {
    /*
     * 처음에는 HTML 문자열에서 `<div hidden>` 이 앞쪽에 나오는지만 봤습니다.
     * 그것은 **어떤** 감싸개가 앞에 열렸다는 사실만 말할 뿐, 그 감싸개가
     * 이 지점에서 아직 열려 있는지는 말하지 않습니다. 주문 연결을 감싸개
     * 밖으로 빼도 통과하는 검사였습니다.
     *
     * 지금은 브라우저에게 묻습니다 — closest() 가 DOM 을 실제로 거슬러
     * 올라가므로 "안에 있는가" 가 정확히 판정됩니다.
     */
    await page.goto('/ko/account');
    const r = await page.evaluate(() =>
      ['data-orders-state', 'data-claim', 'data-my-reviews'].map((hook) => {
        // querySelectorAll 입니다 — 같은 후크가 감싸개 밖에 하나 더 생기면
        // 첫 매치만 보는 검사는 그것을 못 봅니다.
        const els = [...document.querySelectorAll(`[${hook}]`)];
        const wraps = els.map((el) => el.closest<HTMLElement>('[data-order-only]'));
        return {
          hook,
          found: els.length > 0,
          wrapped: wraps.every(Boolean),
          hidden: wraps.every((w) => w?.hidden === true),
        };
      }),
    );
    for (const x of r) {
      expect(x.found, `${x.hook} 이 없습니다`).toBe(true);
      expect(x.wrapped, `${x.hook} 이 감싸개 밖에 있습니다`).toBe(true);
      expect(x.hidden, `${x.hook} 의 감싸개에 hidden 이 없습니다`).toBe(true);
    }

    /*
     * 속성만으로는 부족합니다.
     *
     * `el.hidden` 은 속성이 붙어 있다는 사실만 말합니다. 작성자 CSS 가
     * `[data-order-only][hidden] { display: block }` 처럼 브라우저 기본값을
     * 덮으면 속성은 그대로인 채 화면에는 다시 나타납니다 — 실제로 그렇게
     * 만들어 보니 위 세 줄이 전부 통과했습니다.
     *
     * 그래서 마지막에 "정말 안 보이는가" 를 브라우저에게 묻습니다.
     */
    for (const sel of ['[data-orders-state]', '[data-claim]', '[data-my-reviews]']) {
      await expect(page.locator(sel), `${sel} 이 화면에 보입니다`).toBeHidden();
    }
  });

  test('안내와 감추기가 같은 조건으로 움직인다', async ({ page }) => {
    /*
     * 감싸개가 감춰졌는데 왜 감춰졌는지는 아무 데도 없는 상태가 되면 안
     * 됩니다 — 이 커밋이 없애려던 화면이 바로 그것입니다. 둘은 같은 조건
     * (SELLS_DIRECTLY)을 봐야 하고, 무엇을 말할지만 CAN_ORDER 로 갈립니다.
     */
    await page.goto('/ko/account');
    const r = await page.evaluate(() => ({
      hiddenWraps: [...document.querySelectorAll<HTMLElement>('[data-order-only]')]
        .filter((w) => w.hidden).length,
      notice: document.querySelectorAll('.preLaunch').length,
    }));
    expect(r.hiddenWraps, '감춰진 감싸개').toBeGreaterThan(0);
    expect(r.notice, '감췄으면 이유를 말해야 합니다').toBe(1);
  });

  test('5개 언어 모두 안내 문구가 있다', async ({ request }) => {
    for (const lang of ['ko', 'en', 'zh', 'th', 'vi']) {
      const html = await (await request.get(`/${lang}/account`)).text();
      expect(html, lang).toContain('class="preLaunch"');
    }
  });
});
