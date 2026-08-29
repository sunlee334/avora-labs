import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN_DEV_TOKEN, CAPTURE_URL, TEST_HEADERS } from '../../../playwright.config';

/**
 * 운영에서 실제로 돈과 개인정보가 걸리는 지점들.
 *
 * 여기 있는 테스트는 "기능이 되는가" 가 아니라 **"사고가 나는가"** 를 봅니다.
 * 기능 테스트는 잘 되는 길을 따라가지만, 사고는 늘 옆길에서 납니다 —
 * 결제가 안 된 주문, 동시에 들어온 요청, 남의 주문번호, 적대적인 입력.
 */

const AUTH = { 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN };
const UNIT_PRICE = 32000;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function nextOrderId(): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const stamp = String(20261025000000 + Math.floor(Math.random() * 999999)).padEnd(14, '0').slice(0, 14);
  return `AVORA-${stamp}-${suffix}`;
}

async function seedOrder(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const orderId = nextOrderId();
  const res = await request.post('/api/orders', {
    data: {
      orderId,
      amount: UNIT_PRICE,
      currency: 'KRW',
      locale: 'ko',
      items: [{ id: 'daily-sunscreen', qty: 1 }],
      recipientName: '이수민',
      recipientPhone: '010-1111-2222',
      postalCode: '04524',
      address1: '서울 중구 세종대로 110',
      ...overrides,
    },
  });
  expect(res.status(), '주문 생성 실패').toBe(200);
  return orderId;
}

const pay = (request: APIRequestContext, orderId: string, key = 'ok') =>
  request.post('/api/payments/confirm', {
    data: { paymentKey: key, orderId, amount: UNIT_PRICE },
  });

test.describe('돈을 받지 않은 물건은 나가지 않는다', () => {
  // 관리 화면 목록에는 결제 대기·실패 주문도 함께 나옵니다. 그래야 무슨 일이
  // 있었는지 보이니까요. 그런데 바쁠 때 한 줄 잘못 눌러 송장을 넣으면
  // 돈을 받지 않은 물건이 나갑니다. 화면 경고만으로는 부족하고 서버가 막아야 합니다.

  for (const [label, makeState] of [
    ['결제 대기', async () => null],
    ['결제 실패', async (request: APIRequestContext, id: string) => pay(request, id, 'fail_declined')],
  ] as const) {
    test(`${label} 주문은 발송 처리할 수 없다`, async ({ request }) => {
      const orderId = await seedOrder(request);
      await makeState(request, orderId);

      const res = await request.patch(`/api/admin/orders/${orderId}`, {
        headers: AUTH,
        data: { fulfillment: 'shipped', trackingNumber: '1234567890' },
      });
      expect(res.status()).toBe(409);
      expect((await res.json()).error).toBe('ORDER_NOT_PAID');

      // 그리고 실제로 아무것도 바뀌지 않았어야 합니다.
      const lookup = await request.post('/api/orders/lookup', {
        data: { orderId, phone: '010-1111-2222' },
      });
      const order = (await lookup.json()).order;
      expect(order.fulfillment).toBe('unfulfilled');
      expect(order.trackingNumber).toBeNull();
    });
  }

  test('송장번호만 넣어도 막힌다 — 상태를 안 골라도 발송으로 넘어가므로', async ({ request }) => {
    const orderId = await seedOrder(request);
    const res = await request.patch(`/api/admin/orders/${orderId}`, {
      headers: AUTH,
      data: { trackingNumber: '9999' },
    });
    expect(res.status()).toBe(409);
  });

  test('결제가 끝나면 발송할 수 있다', async ({ request }) => {
    const orderId = await seedOrder(request);
    expect((await pay(request, orderId, 'ok_ship')).status()).toBe(200);

    const res = await request.patch(`/api/admin/orders/${orderId}`, {
      headers: AUTH,
      data: { fulfillment: 'shipped', trackingNumber: '1234567890' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).order.fulfillment).toBe('shipped');
  });

  test('미결제 주문도 미발송으로 되돌리는 것은 허용한다', async ({ request }) => {
    // 잘못 누른 것을 되돌리는 길까지 막으면 안 됩니다.
    const orderId = await seedOrder(request);
    const res = await request.patch(`/api/admin/orders/${orderId}`, {
      headers: AUTH,
      data: { fulfillment: 'unfulfilled', adminMemo: '결제 확인 중' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).order.adminMemo).toBe('결제 확인 중');
  });

});

test.describe('관리 화면도 같은 규칙을 보여준다', () => {
  // 페이지는 Worker 가 인증한 뒤에야 나가므로 브라우저 컨텍스트에도 토큰이 필요합니다.
  test.use({ extraHTTPHeaders: { ...TEST_HEADERS, ...AUTH } });

  test('관리 화면이 미결제 주문의 발송 항목을 잠근다', async ({ page, request }) => {
    const orderId = await seedOrder(request);

    await page.goto('/admin', { waitUntil: 'networkidle' });
    await page.locator('[data-filters] [name="search"]').fill(orderId);
    await page.locator('[data-filters] [name="search"]').press('Enter');
    await page.locator('[data-rows] tr', { hasText: orderId }).click();

    await expect(page.locator('[data-detail-unpaid]')).toBeVisible();
    await expect(page.locator('[data-detail] [name="trackingNumber"]')).toBeDisabled();
    // '발송' 은 고를 수 없고 '미발송' 은 고를 수 있어야 합니다.
    // toBeDisabled 는 <option> 을 보지 않으므로(button·input·select·textarea 만)
    // 속성을 직접 확인합니다.
    const option = (value: string) =>
      page.locator(`[data-detail] [name="fulfillment"] option[value="${value}"]`);
    await expect(option('shipped')).toHaveJSProperty('disabled', true);
    await expect(option('delivered')).toHaveJSProperty('disabled', true);
    await expect(option('unfulfilled')).toHaveJSProperty('disabled', false);
  });
});

test.describe('남의 주문은 보이지 않는다', () => {
  test('연락처가 틀리면 주문이 나오지 않는다', async ({ request }) => {
    const orderId = await seedOrder(request);
    const res = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-9999-9999' },
    });
    expect(res.status()).toBe(404);

    // 응답에 주문 내용이 조금도 섞이면 안 됩니다.
    const body = await res.text();
    expect(body).not.toContain('이수민');
    expect(body).not.toContain('세종대로');
  });

  test('있는 주문과 없는 주문의 응답이 구별되지 않는다', async ({ request }) => {
    // 응답이 다르면 주문번호를 훑어 "이 번호는 존재한다" 를 알아낼 수 있습니다.
    const existing = await seedOrder(request);

    const wrongPhone = await request.post('/api/orders/lookup', {
      data: { orderId: existing, phone: '010-9999-9999' },
    });
    const notExist = await request.post('/api/orders/lookup', {
      data: { orderId: nextOrderId(), phone: '010-9999-9999' },
    });

    expect(wrongPhone.status()).toBe(notExist.status());
    expect(await wrongPhone.text()).toBe(await notExist.text());
  });

  test('관리 API 는 주문번호를 알아도 열리지 않는다', async ({ request }) => {
    const orderId = await seedOrder(request);
    const res = await request.get(`/api/admin/orders?search=${orderId}`);
    expect(res.status()).toBe(401);
    expect(await res.text()).not.toContain('이수민');
  });
});

test.describe('동시에 들어온 요청', () => {
  /**
   * ⚠️ 이 테스트는 확률적입니다. 믿을 만한 방어선이 아닙니다.
   *
   * 실제로 이 경쟁 조건에서 알림이 여러 번 나가는 것을 한 번 관측했고 고쳤지만,
   * 그 뒤 수정을 되돌리고 6개 병렬로 5회를 돌려도 재현되지 않았습니다.
   * 로컬 wrangler 는 요청을 충분히 직렬화하는 것으로 보입니다.
   *
   * 즉 이 테스트가 통과하는 것은 "경쟁 조건이 없다" 는 증거가 아닙니다.
   * 결정적으로 검증되는 것은 순차 중복 요청(notify.spec.ts 의 "완료 화면을
   * 새로고침해도 알림은 한 번만")뿐이고, 동시 요청 쪽은 코드를 읽어서
   * 판단해야 합니다. 그래도 남겨 둡니다 — 가끔은 잡히고, 비용이 없습니다.
   */
  test('승인이 여러 번 동시에 와도 결과는 하나다', async ({ request }) => {
    // 결제 완료 화면에서 새로고침을 연타하면 실제로 일어납니다.
    const orderId = await seedOrder(request);
    const payload = { paymentKey: 'ok_parallel', orderId, amount: UNIT_PRICE };

    // 경쟁 조건이라 요청이 적으면 재현되지 않을 수 있어 여러 개를 함께 던집니다.
    const results = await Promise.all(
      Array.from({ length: 6 }, () => request.post('/api/payments/confirm', { data: payload })),
    );
    for (const res of results) expect(res.status()).toBe(200);

    const lookup = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-1111-2222' },
    });
    expect((await lookup.json()).order.status).toBe('paid');

    // 판매자에게 알림이 세 번 가면 안 됩니다.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const all = (await (await request.get(`${CAPTURE_URL}/received`)).json()).received;
    const count = all.filter((c: { body: { text?: string; content?: string } }) =>
      (c.body.text ?? c.body.content ?? '').includes(orderId),
    ).length;
    expect(count, '알림은 한 번만 나가야 합니다').toBe(1);
  });

  test('같은 주문을 두 번 동시에 만들면 하나만 남는다', async ({ request }) => {
    const orderId = nextOrderId();
    const body = {
      orderId, amount: UNIT_PRICE, currency: 'KRW', locale: 'ko',
      items: [{ id: 'daily-sunscreen', qty: 1 }],
      recipientName: '이수민', recipientPhone: '010-1111-2222',
      postalCode: '04524', address1: '서울 중구 세종대로 110',
    };
    const [a, b] = await Promise.all([
      request.post('/api/orders', { data: body }),
      request.post('/api/orders', { data: body }),
    ]);
    const codes = [a.status(), b.status()].sort();
    expect(codes).toEqual([200, 409]);
  });
});

test.describe('클라이언트가 보낸 값은 승인에 쓰이지 않는다', () => {
  test('통화를 바꿔 보내도 저장된 주문이 그대로 승인된다', async ({ request }) => {
    const orderId = await seedOrder(request);
    const res = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'ok_cur', orderId, amount: UNIT_PRICE, currency: 'USD' },
    });
    expect(res.status()).toBe(200);
    // 32,000 을 32,000달러로 받는 일은 없어야 합니다.
    expect((await res.json()).order.currency).toBe('KRW');
  });

  test('주문에 없는 필드를 끼워 넣어도 저장되지 않는다', async ({ request }) => {
    const orderId = nextOrderId();
    await request.post('/api/orders', {
      data: {
        orderId, amount: UNIT_PRICE, currency: 'KRW', locale: 'ko',
        items: [{ id: 'daily-sunscreen', qty: 1 }],
        recipientName: '이수민', recipientPhone: '010-1111-2222',
        postalCode: '04524', address1: '서울 중구 세종대로 110',
        // 있어서는 안 될 것들
        status: 'paid',
        fulfillment: 'delivered',
        paidAt: '2020-01-01T00:00:00.000Z',
        adminMemo: '주입',
      },
    });

    const lookup = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-1111-2222' },
    });
    const order = (await lookup.json()).order;
    expect(order.status, '결제 상태를 클라이언트가 정하면 안 됩니다').toBe('pending');
    expect(order.fulfillment).toBe('unfulfilled');
    expect(order.paidAt).toBeNull();
    expect(order.adminMemo).toBeUndefined();
  });
});

test.describe('적대적인 입력이 화면을 뚫지 않는다', () => {
  test('주문 조회 화면', async ({ page, request }) => {
    const orderId = await seedOrder(request, {
      recipientName: '<img src=x onerror="window.__x=1">',
      address1: '<svg onload="window.__x=1">서울 중구 세종대로 110',
    });

    await page.goto('/ko/order/lookup');
    await page.locator('[name="orderId"]').fill(orderId);
    await page.locator('[name="phone"]').fill('010-1111-2222');
    await page.locator('[data-lookup-submit]').click();
    await expect(page.locator('[data-lookup-result]')).toBeVisible();

    expect(await page.evaluate(() => (window as any).__x)).toBeUndefined();
    await expect(page.locator('[data-r-recipient]')).toContainText('<img src=x');
  });

  test('장바구니에 상품 이름을 주입할 수 없다', async ({ page }) => {
    // 저장값에 name 을 끼워 넣어도, 이름은 늘 서버가 아는 카탈로그에서 옵니다.
    await page.goto('/ko/');
    await page.evaluate(() =>
      localStorage.setItem(
        'avora.cart.v1',
        JSON.stringify([
          { id: 'daily-sunscreen', qty: 1, name: '<img src=x onerror="window.__y=1">', price: 1 },
        ]),
      ),
    );

    for (const path of ['/ko/cart', '/ko/checkout']) {
      await page.goto(path);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => (window as any).__y), path).toBeUndefined();
    }
    await expect(page.locator('[data-checkout-lines]').first()).toContainText('Daily Sunscreen');
  });
});
