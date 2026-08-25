import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * 주문 API — 이 파일의 관심사는 대부분 보안입니다.
 *
 * 결제 금액은 브라우저가 보내는 값이라 그대로 믿으면 조작할 수 있습니다.
 * 주문을 먼저 서버에 만들어 두고 승인 직전에 대조하는 구조가 실제로
 * 조작을 막는지 확인합니다.
 *
 * 승인 경로는 PAYMENT_PROVIDER=mock 일 때만 열립니다.
 * playwright.config 이 commerce 모드에서 wrangler 에 --var 로 넘겨 줍니다.
 * 실제 PG 없이 이 경로를 확인할 방법이 그것뿐입니다.
 */

/**
 * 주문번호는 서버에서 유일해야 합니다.
 * 모바일·데스크톱 프로젝트가 병렬로 도는 데다 재시도도 있어서,
 * 순번만 쓰면 서로 겹쳐 409 가 납니다. 무작위 접미사를 붙입니다.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function nextOrderId(): string {
  const stamp = String(20261025000000 + Math.floor(Math.random() * 999999));
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `AVORA-${stamp.padEnd(14, '0').slice(0, 14)}-${suffix}`;
}

async function createOrder(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
) {
  const orderId = (overrides.orderId as string) ?? nextOrderId();
  const res = await request.post('/api/orders', {
    data: {
      orderId,
      amount: 32000,
      currency: 'KRW',
      locale: 'ko',
      items: [{ id: 'daily-sunscreen', name: 'Daily Sunscreen', qty: 1, unitPrice: 32000 }],
      recipientName: '홍길동',
      recipientPhone: '010-1234-5678',
      postalCode: '04524',
      address1: '서울 중구 세종대로 110',
      ...overrides,
    },
  });
  return { res, orderId };
}

test.describe('주문 생성', () => {
  test('정상 주문을 받는다', async ({ request }) => {
    const { res, orderId } = await createOrder(request);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.orderId).toBe(orderId);
  });

  test('항목 합계와 총액이 다르면 거절한다', async ({ request }) => {
    const { res } = await createOrder(request, { amount: 1000 });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('AMOUNT_MISMATCH');
  });

  test('같은 주문번호를 두 번 보내면 거절한다', async ({ request }) => {
    const orderId = nextOrderId();
    const first = await createOrder(request, { orderId });
    expect(first.res.status()).toBe(200);
    const second = await createOrder(request, { orderId });
    expect(second.res.status()).toBe(409);
  });

  test('필수 항목이 빠지면 거절한다', async ({ request }) => {
    const { res } = await createOrder(request, { address1: '' });
    expect(res.status()).toBe(400);
  });

  test('주문번호 형식이 아니면 거절한다', async ({ request }) => {
    const { res } = await createOrder(request, { orderId: 'NOT-AN-ORDER-ID' });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('INVALID_ORDER_ID');
  });

  test('빈 장바구니는 거절한다', async ({ request }) => {
    const { res } = await createOrder(request, { items: [] });
    expect(res.status()).toBe(400);
  });

  test('음수 수량은 거절한다', async ({ request }) => {
    const { res } = await createOrder(request, {
      items: [{ id: 'daily-sunscreen', name: 'Daily Sunscreen', qty: -1, unitPrice: 32000 }],
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('결제 승인', () => {
  test('정상 승인 후 주문이 paid 가 된다', async ({ request }) => {
    const { orderId } = await createOrder(request);
    const res = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'ok_1', orderId, amount: 32000 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.order.status).toBe('paid');
  });

  test('금액을 조작하면 승인하지 않고 주문을 실패 처리한다', async ({ request }) => {
    const { orderId } = await createOrder(request);

    const res = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'ok_2', orderId, amount: 1000 },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('AMOUNT_TAMPERED');

    // 조작 시도된 주문은 되살아나면 안 됩니다.
    const lookup = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-1234-5678' },
    });
    expect((await lookup.json()).order.status).toBe('failed');
  });

  test('같은 주문을 다시 승인해도 중복 결제되지 않는다', async ({ request }) => {
    const { orderId } = await createOrder(request);
    await request.post('/api/payments/confirm', {
      data: { paymentKey: 'ok_3', orderId, amount: 32000 },
    });
    const again = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'ok_3', orderId, amount: 32000 },
    });
    expect(again.status()).toBe(200);
    const body = await again.json();
    expect(body.alreadyPaid).toBe(true);
  });

  test('PG 가 거절하면 주문이 failed 가 된다', async ({ request }) => {
    const { orderId } = await createOrder(request);
    const res = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'fail_x', orderId, amount: 32000 },
    });
    expect(res.status()).toBe(502);

    const lookup = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-1234-5678' },
    });
    expect((await lookup.json()).order.status).toBe('failed');
  });

  test('없는 주문은 404', async ({ request }) => {
    const res = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'ok', orderId: 'AVORA-19700101000000-ZZZZZZ', amount: 1 },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('주문 조회', () => {
  test('주문번호와 연락처가 맞으면 조회된다', async ({ request }) => {
    const { orderId } = await createOrder(request);
    const res = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-1234-5678' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.order.id).toBe(orderId);
    expect(body.order.recipientName).toBe('홍길동');
  });

  test('연락처가 다르면 404 — 주문번호 추측으로 남의 배송지를 볼 수 없다', async ({ request }) => {
    const { orderId } = await createOrder(request);
    const res = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-9999-9999' },
    });
    expect(res.status()).toBe(404);
  });

  test('연락처 표기가 달라도 같은 번호면 조회된다', async ({ request }) => {
    const { orderId } = await createOrder(request, { recipientPhone: '010-1111-2222' });
    const res = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '01011112222' },
    });
    expect(res.status()).toBe(200);
  });

  test('조회 응답에 연락처와 메모는 포함하지 않는다', async ({ request }) => {
    const { orderId } = await createOrder(request, { memo: '문 앞에 두세요' });
    const res = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-1234-5678' },
    });
    const body = await res.json();
    expect(body.order.recipientPhone).toBeUndefined();
    expect(body.order.memo).toBeUndefined();
  });

  test('주문 정보 응답은 캐시되지 않는다', async ({ request }) => {
    const { orderId } = await createOrder(request);
    const res = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-1234-5678' },
    });
    expect(res.headers()['cache-control']).toContain('no-store');
  });
});

test.describe('구조화 데이터가 화면과 일치한다', () => {
  test('가격이 있으면 offers 도 같은 값을 담는다', async ({ request }) => {
    // 예전에는 화면은 runtime 가격을, JSON-LD 는 product.json 을 읽어
    // 미리보기 빌드에서 "화면엔 가격이 있는데 구조화 데이터엔 offers 가 없는" 모순이 있었습니다.
    const html = await (await request.get('/ko/product')).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)];
    const product = blocks.map((m) => JSON.parse(m[1])).find((s) => s['@type'] === 'Product');

    expect(product.offers).toBeTruthy();
    expect(product.offers.price).toBe(32000);
    expect(product.offers.priceCurrency).toBe('KRW');
  });
});
