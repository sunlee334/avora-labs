import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * 회원 계정 — 1단계 (로그인 · 주문내역 · 배송지).
 *
 * 카카오·네이버는 도메인과 사업자 정보가 있어야 붙일 수 있어서, 여기서는
 * mock 제공자로 돌립니다. 제공자 뒤의 코드 — 세션, 주문 연결, 배송지 저장,
 * 이전 주문 가져오기 — 는 실제 제공자와 무관한 우리 코드이므로 그대로
 * 검증됩니다. 바뀌는 것은 인가 코드를 프로필로 바꾸는 한 함수뿐입니다.
 *
 * 여기서 가장 중요한 것은 **남의 주문이 남의 계정에 붙지 않는가** 입니다.
 */

const UNIT_PRICE = 32000;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function nextOrderId(): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const stamp = String(20261026000000 + Math.floor(Math.random() * 999999)).padEnd(14, '0').slice(0, 14);
  return `AVORA-${stamp}-${suffix}`;
}

/**
 * mock 제공자로 특정 사용자로 로그인합니다.
 *
 * page.goto 로 하면 리다이렉트를 끝까지 따라가 버려서 콜백 주소를 손볼 틈이
 * 없습니다. 그러면 code 가 mock 기본값으로 고정돼 **모든 테스트가 같은
 * 사람으로 로그인**하고, "남의 주문" 을 검사하는 테스트가 전부 무의미해집니다.
 * 실제로 처음에 그렇게 짰다가 한 테스트가 그 사실을 드러냈습니다.
 *
 * 그래서 리다이렉트를 따라가지 않고 단계마다 직접 갑니다. page.request 는
 * 브라우저 컨텍스트와 쿠키를 공유하므로 state·세션 쿠키가 그대로 적용됩니다.
 */
async function loginAs(page: Page, providerUserId: string): Promise<void> {
  const start = await page.request.get('/api/auth/login?provider=mock&returnTo=%2Fko%2Faccount', {
    maxRedirects: 0,
  });
  expect(start.status()).toBe(302);

  const callback = new URL(start.headers()['location']);
  callback.searchParams.set('code', providerUserId);

  const done = await page.request.get(callback.href, { maxRedirects: 0 });
  expect(done.status(), '콜백이 로그인시켜야 합니다').toBe(302);
}

async function seedOrder(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const orderId = nextOrderId();
  const res = await request.post('/api/orders', {
    data: {
      orderId, amount: UNIT_PRICE, currency: 'KRW', locale: 'ko',
      items: [{ id: 'daily-sunscreen', qty: 1 }],
      recipientName: '정민아', recipientPhone: '010-4444-5555',
      postalCode: '04524', address1: '서울 중구 세종대로 110', ...overrides,
    },
  });
  expect(res.status()).toBe(200);
  return orderId;
}

test.describe('로그인하지 않은 상태', () => {
  test('계정 API 는 전부 401 이고 개인정보를 흘리지 않는다', async ({ request }) => {
    for (const [method, path] of [
      ['GET', '/api/account/me'],
      ['GET', '/api/account/orders'],
    ] as const) {
      const res = await request.fetch(path, { method });
      expect(res.status(), path).toBe(401);
      expect(await res.text()).not.toContain('정민아');
    }
  });

  test('배송지 저장과 주문 가져오기도 막힌다', async ({ request }) => {
    const put = await request.put('/api/account/address', {
      data: { recipientName: '가짜', recipientPhone: '010-0000-0000', postalCode: '04524', address1: '서울' },
    });
    expect(put.status()).toBe(401);

    const claim = await request.post('/api/account/claim', {
      data: { orderId: nextOrderId(), phone: '010-0000-0000' },
    });
    expect(claim.status()).toBe(401);
  });

  test('로그인 없이도 주문할 수 있다', async ({ request }) => {
    // 결제 직전에 로그인을 요구하면 거기서 이탈합니다. 비회원 주문은 계속 받습니다.
    const orderId = await seedOrder(request);
    const lookup = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-4444-5555' },
    });
    expect(lookup.status()).toBe(200);
  });
});

test.describe('로그인', () => {
  test('로그인하면 세션 쿠키가 생기고 계정을 읽을 수 있다', async ({ page }) => {
    await loginAs(page, 'user-basic');

    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === 'avora_session');
    expect(session, '세션 쿠키가 있어야 합니다').toBeTruthy();
    expect(session!.httpOnly, '스크립트가 읽을 수 없어야 합니다').toBe(true);

    const me = await page.request.get('/api/account/me');
    expect(me.status()).toBe(200);

    // 로그인 수단은 사람과 분리돼 있습니다 — 한 사람이 여럿을 가질 수 있어
    // 계정 응답 하나로 "어느 제공자냐" 에 답할 수 없습니다.
    const { linked } = await (await page.request.get('/api/account/identities')).json();
    expect(linked.map((i: { provider: string }) => i.provider)).toContain('mock');
  });

  test('계정 응답에 내부 식별자는 나가지 않는다', async ({ page }) => {
    // 우리 쪽 계정 id 와 제공자 쪽 id 는 화면에서 쓸 일이 없습니다.
    // 나가면 다른 응답과 엮어 사람을 특정하는 데 쓰일 수 있습니다.
    await loginAs(page, 'user-noleak');
    const { user } = await (await page.request.get('/api/account/me')).json();

    expect(Object.keys(user).sort()).toEqual(
      ['address', 'createdAt', 'email', 'name'].sort(),
    );
    expect(user).not.toHaveProperty('id');
    expect(user).not.toHaveProperty('providerUserId');

    // 로그인 수단 목록에도 제공자 쪽 id 는 나가지 않습니다.
    const { linked } = await (await page.request.get('/api/account/identities')).json();
    for (const identity of linked) {
      expect(Object.keys(identity).sort()).toEqual(['createdAt', 'email', 'provider'].sort());
    }
  });

  test('이메일을 주지 않는 계정도 로그인된다', async ({ page }) => {
    // 카카오는 이메일 필수 동의로 설정해도 값을 주지 않을 수 있습니다.
    // 이메일을 식별자로 삼았다면 이런 사용자는 로그인 자체가 막힙니다.
    await loginAs(page, 'noemail-user');
    const { user } = await (await page.request.get('/api/account/me')).json();
    expect(user.email).toBeNull();

    const { linked } = await (await page.request.get('/api/account/identities')).json();
    expect(linked.map((i: { provider: string }) => i.provider)).toContain('mock');
  });

  test('로그아웃하면 세션이 무효가 된다', async ({ page }) => {
    await loginAs(page, 'user-logout');
    expect((await page.request.get('/api/account/me')).status()).toBe(200);

    await page.request.post('/api/auth/logout');
    expect((await page.request.get('/api/account/me')).status()).toBe(401);
  });

  test('위조한 세션 쿠키로는 들어올 수 없다', async ({ page, context }) => {
    await context.addCookies([
      { name: 'avora_session', value: 'a'.repeat(64), domain: '127.0.0.1', path: '/' },
    ]);
    await page.goto('/ko/account');
    expect((await page.request.get('/api/account/me')).status()).toBe(401);
  });

  test('우리가 시작하지 않은 콜백은 거절한다', async ({ request }) => {
    // state 를 대조하지 않으면 공격자가 자기 계정의 인가 코드로 콜백을 불러
    // 피해자를 공격자 계정에 로그인시킬 수 있습니다.
    const noStart = await request.get('/api/auth/callback/mock?code=user-evil&state=made-up', {
      maxRedirects: 0,
    });
    expect(noStart.status()).toBe(400);
    expect((await noStart.json()).error).toBe('INVALID_CALLBACK');
  });

  test('시작은 했지만 state 가 다르면 거절한다', async ({ page }) => {
    // 로그인을 시작해 state 쿠키는 있지만, 콜백의 state 가 다른 경우입니다.
    await page.request.get('/api/auth/login?provider=mock&returnTo=%2Fko%2Faccount', { maxRedirects: 0 });
    const res = await page.request.get('/api/auth/callback/mock?code=user-evil&state=다른값', {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('STATE_MISMATCH');
  });

  test('로그인 후 외부 주소로 보내지 않는다', async ({ page }) => {
    // returnTo 를 그대로 믿으면 로그인 직후 남의 사이트로 보낼 수 있습니다.
    const start = await page.request.get(
      '/api/auth/login?provider=mock&returnTo=https%3A%2F%2Fevil.example%2Fx',
      { maxRedirects: 0 },
    );
    const done = await page.request.get(new URL(start.headers()['location']).href, {
      maxRedirects: 0,
    });
    expect(done.headers()['location']).not.toContain('evil.example');
    expect(done.headers()['location']).toBe('/ko/account');
  });
});

test.describe('주문과 계정', () => {
  test('로그인 상태로 주문하면 계정에 붙고 배송지가 기억된다', async ({ page }) => {
    await loginAs(page, 'user-buyer');

    const orderId = nextOrderId();
    const res = await page.request.post('/api/orders', {
      data: {
        orderId, amount: UNIT_PRICE, currency: 'KRW', locale: 'ko',
        items: [{ id: 'daily-sunscreen', qty: 1 }],
        recipientName: '정민아', recipientPhone: '010-4444-5555',
        postalCode: '04524', address1: '서울 중구 세종대로 110',
      },
    });
    expect(res.status()).toBe(200);

    const { orders } = await (await page.request.get('/api/account/orders')).json();
    expect(orders.map((o: { id: string }) => o.id)).toContain(orderId);

    const { user } = await (await page.request.get('/api/account/me')).json();
    expect(user.address.address1).toBe('서울 중구 세종대로 110');
    expect(user.address.recipientPhone).toBe('01044445555');
  });

  test('이전 주문을 주문번호와 연락처로 가져온다', async ({ page, request }) => {
    const orderId = await seedOrder(request);   // 로그인 전 비회원 주문
    await loginAs(page, 'user-claimer');

    const claim = await page.request.post('/api/account/claim', {
      data: { orderId, phone: '010-4444-5555' },
    });
    expect(claim.status()).toBe(200);

    const { orders } = await (await page.request.get('/api/account/orders')).json();
    expect(orders.map((o: { id: string }) => o.id)).toContain(orderId);
  });

  test('연락처가 틀리면 가져올 수 없다', async ({ page, request }) => {
    const orderId = await seedOrder(request);
    await loginAs(page, 'user-wrongphone');

    const claim = await page.request.post('/api/account/claim', {
      data: { orderId, phone: '010-9999-9999' },
    });
    expect(claim.status()).toBe(404);

    const { orders } = await (await page.request.get('/api/account/orders')).json();
    expect(orders.map((o: { id: string }) => o.id)).not.toContain(orderId);
  });

  test('남이 이미 가져간 주문은 가져올 수 없다', async ({ page, request }) => {
    const orderId = await seedOrder(request);

    await loginAs(page, 'user-first');
    expect((await page.request.post('/api/account/claim', {
      data: { orderId, phone: '010-4444-5555' },
    })).status()).toBe(200);

    // 다른 사람이 주문번호와 연락처를 알아도 빼앗을 수 없어야 합니다.
    await page.request.post('/api/auth/logout');
    await loginAs(page, 'user-second');
    const steal = await page.request.post('/api/account/claim', {
      data: { orderId, phone: '010-4444-5555' },
    });
    expect(steal.status()).toBe(404);

    const { orders } = await (await page.request.get('/api/account/orders')).json();
    expect(orders.map((o: { id: string }) => o.id)).not.toContain(orderId);
  });

  test('남의 주문은 내 주문내역에 보이지 않는다', async ({ page, request }) => {
    const mine = nextOrderId();
    await loginAs(page, 'user-mine');
    await page.request.post('/api/orders', {
      data: {
        orderId: mine, amount: UNIT_PRICE, currency: 'KRW', locale: 'ko',
        items: [{ id: 'daily-sunscreen', qty: 1 }],
        recipientName: '내주문', recipientPhone: '010-1212-3434',
        postalCode: '04524', address1: '서울',
      },
    });
    const theirs = await seedOrder(request);

    const { orders } = await (await page.request.get('/api/account/orders')).json();
    const ids = orders.map((o: { id: string }) => o.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  });
});

test.describe('마이페이지 화면', () => {
  test('로그인 전에는 로그인 안내가, 후에는 내역이 보인다', async ({ page }) => {
    await page.goto('/ko/account');
    await expect(page.locator('[data-account-anon]')).toBeVisible();
    await expect(page.locator('[data-account-signed]')).toBeHidden();

    await loginAs(page, 'user-screen');
    await page.goto('/ko/account');
    await expect(page.locator('[data-account-signed]')).toBeVisible();
    await expect(page.locator('[data-account-anon]')).toBeHidden();
  });

  test('주문자 정보가 담긴 화면이라 색인되지 않는다', async ({ page }) => {
    await page.goto('/ko/account');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('적대적인 이름이 실행되지 않는다', async ({ page }) => {
    await loginAs(page, 'user-xss');
    await page.request.post('/api/orders', {
      data: {
        orderId: nextOrderId(), amount: UNIT_PRICE, currency: 'KRW', locale: 'ko',
        items: [{ id: 'daily-sunscreen', qty: 1 }],
        recipientName: '<img src=x onerror="window.__acct=1">',
        recipientPhone: '010-4444-5555', postalCode: '04524',
        address1: '<svg onload="window.__acct=1">서울',
      },
    });

    await page.goto('/ko/account');
    await expect(page.locator('[data-account-signed]')).toBeVisible();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as any).__acct)).toBeUndefined();
  });
});
