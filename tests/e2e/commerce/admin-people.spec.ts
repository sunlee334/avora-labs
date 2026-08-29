import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN_DEV_TOKEN, TEST_HEADERS } from '../../../playwright.config';

/**
 * 관리 화면의 사람 명단 두 갈래 — 출시 알림 신청자와 가입 회원.
 *
 * 여기 담긴 것은 이메일과 이름입니다. 주문 API 와 마찬가지로, 인증 없이 한
 * 건이라도 새면 그것으로 사고입니다. 그래서 잠금 테스트를 먼저 둡니다.
 */

const AUTH = { 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN };

/*
 * 이 파일의 테스트는 서로의 순서에 기대지 않습니다 — playwright.config.ts 가
 * fullyParallel 이라 한 파일 안에서도 순서가 없고, CI 는 빈 DB 에서 시작합니다.
 * 명단이 있어야 하는 테스트는 각자 자기 것을 심습니다.
 */
async function seedSignup(
  request: APIRequestContext,
  source = 'home-hero',
): Promise<string> {
  const email = `seed-${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await request.post('/api/launch-notify', {
    data: { email, source, consent: true },
  });
  expect(res.status(), `씨앗 심기 실패: ${await res.text()}`).toBe(201);
  return email;
}

test.describe('🚨 잠겨 있는가', () => {
  for (const path of ['/api/admin/launch-notify', '/api/admin/users']) {
    test(`${path} — 인증 없이는 명단이 나오지 않는다`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
      // 거절할 때도 행을 흘리면 안 됩니다.
      expect(await res.text()).not.toContain('@');
    });
  }
});

test.describe('출시 알림 명단', () => {
  test('신청한 사람이 명단에 보인다', async ({ request }) => {
    const email = await seedSignup(request);

    const res = await request.get('/api/admin/launch-notify?limit=100', { headers: AUTH });
    expect(res.ok()).toBe(true);
    const data = await res.json();

    const mine = (data.rows as any[]).find((r) => r.email === email);
    expect(mine, '방금 신청한 주소가 명단에 없습니다').toBeTruthy();
    expect(mine.source).toBe('home-hero');
    expect(mine.unsubscribedAt).toBeNull();
    expect(data.active).toBeGreaterThan(0);
  });

  test('유입 화면별 집계를 함께 준다', async ({ request }) => {
    await seedSignup(request);
    const res = await request.get('/api/admin/launch-notify?limit=1', { headers: AUTH });
    const data = await res.json();

    expect(Array.isArray(data.bySource)).toBe(true);
    const hero = (data.bySource as any[]).find((s) => s.source === 'home-hero');
    expect(hero, 'home-hero 집계가 없습니다').toBeTruthy();
    expect(hero.n).toBeGreaterThan(0);
  });

  test('유입 화면으로 좁힐 수 있다', async ({ request }) => {
    await seedSignup(request);
    const res = await request.get('/api/admin/launch-notify?source=home-hero&limit=100', {
      headers: AUTH,
    });
    const data = await res.json();
    expect((data.rows as any[]).length).toBeGreaterThan(0);
    expect((data.rows as any[]).every((r) => r.source === 'home-hero')).toBe(true);
  });

  test('수신 거부한 사람은 명단에 남되 상태가 갈린다', async ({ request }) => {
    const email = `admin-unsub-${Date.now()}@example.com`;
    await request.post('/api/launch-notify', {
      data: { email, source: 'product', consent: true },
    });

    // 수신 거부 링크는 토큰으로 돕니다. 토큰은 관리 API 가 주지 않으므로
    // 상태 필터가 갈라 놓는지만 확인합니다.
    const active = await (
      await request.get('/api/admin/launch-notify?state=active&limit=100', { headers: AUTH })
    ).json();
    expect((active.rows as any[]).every((r) => r.unsubscribedAt === null)).toBe(true);

    const gone = await (
      await request.get('/api/admin/launch-notify?state=unsubscribed&limit=100', { headers: AUTH })
    ).json();
    expect((gone.rows as any[]).every((r) => r.unsubscribedAt !== null)).toBe(true);
  });

  test('한 쪽 크기를 넘겨 달라고 해도 상한에서 멈춘다', async ({ request }) => {
    const res = await request.get('/api/admin/launch-notify?limit=99999', { headers: AUTH });
    const data = await res.json();
    // 상한이 없으면 명단 전체가 한 번에 나옵니다.
    expect((data.rows as any[]).length).toBeLessThanOrEqual(200);
  });
});

test.describe('가입 회원', () => {
  test('목록 모양이 약속대로다', async ({ request }) => {
    const res = await request.get('/api/admin/users?limit=20', { headers: AUTH });
    expect(res.ok()).toBe(true);
    const data = await res.json();

    expect(typeof data.total).toBe('number');
    expect(Array.isArray(data.rows)).toBe(true);
    for (const row of data.rows as any[]) {
      expect(Array.isArray(row.providers)).toBe(true);
      expect(typeof row.orders).toBe('number');
      expect(typeof row.hasAddress).toBe('boolean');
    }
  });

  test('찾기가 이메일을 좁힌다', async ({ request }) => {
    const res = await request.get('/api/admin/users?q=존재하지않는사람&limit=20', { headers: AUTH });
    const data = await res.json();
    expect(data.rows).toEqual([]);
    expect(data.total).toBe(0);
  });
});

test.describe('화면', () => {
  test.use({ extraHTTPHeaders: { ...TEST_HEADERS, 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN } });

  test('탭 두 개가 있고 눌러야 열린다', async ({ page, request }) => {
    await seedSignup(request);
    await page.goto('/admin');

    const signups = page.locator('[data-panel="signups"]');
    const users = page.locator('[data-panel="users"]');
    await expect(signups).toBeHidden();
    await expect(users).toBeHidden();

    await page.click('[data-tab="signups"]');
    await expect(signups).toBeVisible();
    await expect(users).toBeHidden();
    await expect(page.locator('[data-su-table-wrap] tbody tr').first()).toBeVisible();

    await page.click('[data-tab="users"]');
    await expect(users).toBeVisible();
    await expect(signups).toBeHidden();

    /*
     * 회원 탭이 **제 자리에** 그려야 합니다.
     *
     * "표가 보인다" 만으로는 모자랍니다 — 행을 남의 표에 그려도 이 표는
     * 비어 있는 채로 보입니다. 서버가 말하는 건수와 맞대야 잡힙니다.
     */
    const total = (
      await (await request.get('/api/admin/users?limit=20', { headers: AUTH })).json()
    ).total as number;

    if (total > 0) {
      await expect.poll(() => page.locator('[data-us-rows] tr').count()).toBeGreaterThan(0);
    } else {
      await expect(page.locator('[data-us-state]')).toContainText('회원이 없습니다');
    }
  });

  test('두 탭이 표를 공유하지 않는다', async ({ page, request }) => {
    // 명단에는 반드시 있고 회원 표에는 있을 수 없는 값을 하나 심습니다.
    const email = `admin-split-${Date.now()}@example.com`;
    await request.post('/api/launch-notify', {
      data: { email, source: 'home-hero', consent: true },
    });

    await page.goto('/admin');
    await page.click('[data-tab="signups"]');
    await expect(page.locator('[data-su-rows]')).toContainText(email);

    await page.click('[data-tab="users"]');
    await expect(page.locator('[data-us-table-wrap], [data-us-state]').first()).toBeVisible();
    // 회원 표가 명단의 행을 그대로 물려받으면 안 됩니다.
    await expect(page.locator('[data-us-rows]')).not.toContainText(email);
  });

  test('모바일에서 표가 가로로 넘치지 않는다', async ({ page }) => {
    // 표는 좁은 화면에서 반드시 넘칩니다 — 넘치는 것은 tableWrap 안이어야 하고,
    // 문서가 통째로 옆으로 밀리면 안 됩니다.
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/admin');

    for (const tab of ['signups', 'users']) {
      await page.click(`[data-tab="${tab}"]`);
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${tab} 탭에서 문서가 ${overflow}px 넘칩니다`).toBeLessThanOrEqual(1);
    }
  });

  test('신청자 이메일이 화면에 그대로 보인다', async ({ page, request }) => {
    const email = `admin-ui-${Date.now()}@example.com`;
    await request.post('/api/launch-notify', {
      data: { email, source: 'home-hero', consent: true },
    });

    await page.goto('/admin');
    await page.click('[data-tab="signups"]');
    await expect(page.locator('[data-su-rows]')).toContainText(email);
  });

  test('손님이 넣은 값이 관리 화면에서 실행되지 않는다', async ({ page, request }) => {
    // source 는 손님이 보내는 값입니다. 화면은 textContent 로만 넣습니다.
    const email = `admin-xss-${Date.now()}@example.com`;
    await request.post('/api/launch-notify', {
      data: { email, source: '<img src=x onerror=alert(1)>', consent: true },
    });

    await page.goto('/admin');
    await page.click('[data-tab="signups"]');
    await expect(page.locator('[data-su-rows]')).toContainText(email);
    expect(await page.locator('[data-su-rows] img').count()).toBe(0);
  });

  test('새로고침이 지금 보는 탭을 다시 부른다', async ({ page, request }) => {
    await seedSignup(request);
    await page.goto('/admin');
    await page.click('[data-tab="signups"]');
    await expect(page.locator('[data-su-rows] tr').first()).toBeVisible();

    const calls: string[] = [];
    page.on('request', (r) => calls.push(r.url()));
    await page.click('[data-refresh]');
    await expect
      .poll(() => calls.some((u) => u.includes('/api/admin/launch-notify')))
      .toBe(true);
  });
});
