import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * 가격 권위와 결제 상태 전이.
 *
 * 이 파일의 테스트는 전부 코드 리뷰가 잡아낸 실제 결함에서 나왔습니다.
 * 초기 구현은 "항목 합계 == 총액"만 확인했는데, 단가도 클라이언트가 보내는 값이라
 * 단가와 총액을 함께 낮추면 통과했습니다. 32,000원짜리를 100원에 결제할 수 있었습니다.
 *
 * 이제 서버가 상품 id 와 수량만 받아 자기 가격으로 다시 계산합니다.
 */

const UNIT_PRICE = 32000; // playwright.config 이 PRODUCT_PRICE 로 넘기는 값

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function nextOrderId(): string {
  const stamp = String(20261025000000 + Math.floor(Math.random() * 999999)).padEnd(14, '0').slice(0, 14);
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `AVORA-${stamp}-${suffix}`;
}

function orderBody(overrides: Record<string, unknown> = {}) {
  return {
    orderId: nextOrderId(),
    amount: UNIT_PRICE,
    currency: 'KRW',
    locale: 'ko',
    items: [{ id: 'daily-sunscreen', name: 'Daily Sunscreen', qty: 1, unitPrice: UNIT_PRICE }],
    recipientName: '홍길동',
    recipientPhone: '010-1234-5678',
    postalCode: '04524',
    address1: '서울 중구 세종대로 110',
    ...overrides,
  };
}

const create = (request: APIRequestContext, overrides = {}) =>
  request.post('/api/orders', { data: orderBody(overrides) });

test.describe('가격은 서버가 정한다', () => {
  test('단가와 총액을 함께 낮춰도 통과하지 못한다', async ({ request }) => {
    // 리뷰가 잡은 원래 결함: 이 요청이 200 으로 통과해 100원짜리 주문이 만들어졌습니다.
    const res = await create(request, {
      amount: 100,
      items: [{ id: 'daily-sunscreen', name: 'Daily Sunscreen', qty: 1, unitPrice: 100 }],
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('AMOUNT_MISMATCH');
    expect(body.expected).toBe(UNIT_PRICE);
  });

  test('보낸 단가는 아예 쓰이지 않는다 — 총액만 맞으면 서버 가격으로 저장된다', async ({ request }) => {
    // 서버가 단가를 무시하므로, 엉뚱한 단가를 보내도 총액이 서버 계산과 맞으면
    // 주문은 성사되고 저장되는 값은 서버 가격입니다. 그게 이 설계의 요점입니다.
    const res = await request.post('/api/orders', {
      data: orderBody({
        items: [{ id: 'daily-sunscreen', name: '가짜 이름', qty: 2, unitPrice: 1 }],
        amount: UNIT_PRICE * 2,
      }),
    });
    expect(res.status()).toBe(200);

    const { orderId } = await res.json();
    const lookup = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-1234-5678' },
    });
    const stored = (await lookup.json()).order;

    expect(stored.amount).toBe(UNIT_PRICE * 2);
    expect(stored.items[0].unitPrice).toBe(UNIT_PRICE); // 보낸 1 이 아님
    expect(stored.items[0].name).toBe('Daily Sunscreen'); // 보낸 '가짜 이름' 이 아님
  });

  test('단가를 낮추고 총액도 그에 맞춰 낮추면 거절한다', async ({ request }) => {
    // 이것이 원래 뚫렸던 경로입니다 — 둘을 함께 낮추면 예전 검사를 통과했습니다.
    const res = await request.post('/api/orders', {
      data: orderBody({
        items: [{ id: 'daily-sunscreen', name: 'Daily Sunscreen', qty: 2, unitPrice: 50 }],
        amount: 100,
      }),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).expected).toBe(UNIT_PRICE * 2);
  });

  test('모르는 상품은 거절한다', async ({ request }) => {
    const res = await create(request, {
      items: [{ id: 'not-a-product', name: 'x', qty: 1, unitPrice: UNIT_PRICE }],
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('UNKNOWN_ITEM');
  });

  test('수량 상한을 넘기면 거절한다', async ({ request }) => {
    const res = await create(request, {
      items: [{ id: 'daily-sunscreen', name: 'Daily Sunscreen', qty: 1000000, unitPrice: UNIT_PRICE }],
      amount: UNIT_PRICE * 1000000,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('INVALID_QUANTITY');
  });

  test('항목을 무한정 보낼 수 없다', async ({ request }) => {
    const items = Array.from({ length: 500 }, () => ({
      id: 'daily-sunscreen', name: 'Daily Sunscreen', qty: 1, unitPrice: UNIT_PRICE,
    }));
    const res = await create(request, { items, amount: UNIT_PRICE * 500 });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('TOO_MANY_ITEMS');
  });

  test('같은 상품을 중복으로 보내면 거절한다', async ({ request }) => {
    const line = { id: 'daily-sunscreen', name: 'Daily Sunscreen', qty: 1, unitPrice: UNIT_PRICE };
    const res = await create(request, { items: [line, line], amount: UNIT_PRICE * 2 });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('DUPLICATE_ITEM');
  });

  test('알 수 없는 통화는 거절한다 — 화면을 멈추게 하는 값', async ({ request }) => {
    // Intl.NumberFormat 은 잘못된 통화 코드에 예외를 던져, 완료 페이지가 영영
    // "확인 중" 에서 멈춥니다.
    const res = await create(request, { currency: 'ZZ' });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('INVALID_CURRENCY');
  });
});

test.describe('승인 단계 금액 대조', () => {
  test('amount 를 빼면 대조를 건너뛰지 않고 거절한다', async ({ request }) => {
    const res = await create(request);
    const { orderId } = await res.json();

    // 예전에는 amount 가 없으면 검사를 통째로 건너뛰어, 파라미터를 지우기만 하면
    // "핵심 검증" 을 우회할 수 있었습니다.
    const confirm = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'ok_noamt', orderId },
    });
    expect(confirm.status()).toBe(400);
    expect((await confirm.json()).error).toBe('AMOUNT_REQUIRED');
  });

  test('amount 가 숫자가 아니어도 거절한다', async ({ request }) => {
    const res = await create(request);
    const { orderId } = await res.json();
    const confirm = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'ok_x', orderId, amount: '32000' },
    });
    expect(confirm.status()).toBe(400);
  });
});

test.describe('실패의 종류를 구분한다', () => {
  test('확정 거절이면 주문을 닫는다', async ({ request }) => {
    const res = await create(request);
    const { orderId } = await res.json();

    const confirm = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'fail_declined', orderId, amount: UNIT_PRICE },
    });
    expect(confirm.status()).toBe(502);

    const lookup = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-1234-5678' },
    });
    expect((await lookup.json()).order.status).toBe('failed');
  });

  test('일시적 실패면 주문을 열어 둔다 — 다시 시도할 수 있어야 한다', async ({ request }) => {
    const res = await create(request);
    const { orderId } = await res.json();

    // 네트워크 오류나 결제사 5xx 는 승인이 됐는지 알 수 없습니다.
    // 이걸 실패로 닫아버리면, 실제로 돈이 빠져나간 주문이 영영 failed 로 남습니다.
    const flaky = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'flaky_timeout', orderId, amount: UNIT_PRICE },
    });
    expect(flaky.status()).toBe(503);
    expect((await flaky.json()).retriable).toBe(true);

    const lookup = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-1234-5678' },
    });
    expect((await lookup.json()).order.status).toBe('pending');

    // 그리고 실제로 다시 시도해서 성사돼야 합니다.
    const retry = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'ok_retry', orderId, amount: UNIT_PRICE },
    });
    expect(retry.status()).toBe(200);
    expect((await retry.json()).order.status).toBe('paid');
  });
});

test.describe('DB 오류를 중복 주문으로 오인하지 않는다', () => {
  test('중복 주문번호는 409, 그 외 저장 실패는 409 가 아니다', async ({ request }) => {
    const id = nextOrderId();
    const first = await request.post('/api/orders', { data: orderBody({ orderId: id }) });
    expect(first.status()).toBe(200);

    const second = await request.post('/api/orders', { data: orderBody({ orderId: id }) });
    expect(second.status()).toBe(409);
    expect((await second.json()).error).toBe('ORDER_EXISTS');
  });
});
