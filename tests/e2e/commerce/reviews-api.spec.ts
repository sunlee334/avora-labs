import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN_DEV_TOKEN } from '../../../playwright.config';

/**
 * 구매 후기 API.
 *
 * 이 파일의 관심사는 "리뷰가 저장된다" 가 아니라 **아무나 못 쓴다** 입니다.
 * 후기는 광고 효과가 있어서, 쓸 자격을 느슨하게 두면 그 순간 자작 리뷰가
 * 가능해집니다. "구매 확인" 표시는 그 자격이 실제로 지켜질 때만 사실입니다.
 */

const AUTH = { 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN };
const UNIT_PRICE = 32000;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

let seq = 0;
function nextOrderId(): string {
  seq += 1;
  const stamp = `2026082612${String(seq).padStart(4, '0')}`;
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `AVORA-${stamp}-${suffix}`;
}

const PHONE = '010-4444-5555';

/** 결제까지 끝난 주문 하나를 만들어 둡니다 — 후기를 쓸 자격이 있는 상태. */
async function seedPaidOrder(
  request: APIRequestContext,
  name = '김후기',
): Promise<string> {
  const orderId = nextOrderId();
  const created = await request.post('/api/orders', {
    data: {
      orderId,
      amount: UNIT_PRICE,
      currency: 'KRW',
      locale: 'ko',
      items: [{ id: 'daily-sunscreen', qty: 1 }],
      recipientName: name,
      recipientPhone: PHONE,
      postalCode: '04524',
      address1: '서울특별시 중구 세종대로 110',
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();

  const paid = await request.post('/api/payments/confirm', {
    data: { orderId, paymentKey: `mock-${orderId}`, amount: UNIT_PRICE },
  });
  expect(paid.ok(), await paid.text()).toBeTruthy();
  return orderId;
}

/** 결제 전 주문. 후기를 쓸 수 없어야 합니다. */
async function seedPendingOrder(request: APIRequestContext): Promise<string> {
  const orderId = nextOrderId();
  const created = await request.post('/api/orders', {
    data: {
      orderId,
      amount: UNIT_PRICE,
      currency: 'KRW',
      locale: 'ko',
      items: [{ id: 'daily-sunscreen', qty: 1 }],
      recipientName: '김미결제',
      recipientPhone: PHONE,
      postalCode: '04524',
      address1: '서울특별시 중구 세종대로 110',
    },
  });
  expect(created.ok()).toBeTruthy();
  return orderId;
}

const GOOD = { rating: 5, body: '땀을 흘려도 밀리지 않아서 러닝할 때 잘 쓰고 있습니다.' };

test.describe('후기는 구매한 사람만 쓸 수 있다', () => {
  test('결제한 주문이면 쓸 수 있다', async ({ request }) => {
    const orderId = await seedPaidOrder(request);
    const res = await request.post('/api/reviews', {
      data: { orderId, phone: PHONE, ...GOOD, locale: 'ko' },
    });
    expect(res.status()).toBe(201);
    const { review } = await res.json();
    expect(review.rating).toBe(5);
  });

  test('없는 주문번호로는 쓸 수 없다', async ({ request }) => {
    const res = await request.post('/api/reviews', {
      data: { orderId: nextOrderId(), phone: PHONE, ...GOOD },
    });
    expect(res.status()).toBe(404);
  });

  test('연락처가 다르면 쓸 수 없다', async ({ request }) => {
    const orderId = await seedPaidOrder(request);
    const res = await request.post('/api/reviews', {
      data: { orderId, phone: '010-0000-0000', ...GOOD },
    });
    expect(res.status()).toBe(404);
  });

  test('없는 주문과 연락처 불일치가 같은 응답이다', async ({ request }) => {
    // 다르게 답하면 주문번호가 존재하는지를 알려주는 셈이 됩니다.
    const orderId = await seedPaidOrder(request);
    const wrongPhone = await request.post('/api/reviews', {
      data: { orderId, phone: '010-0000-0000', ...GOOD },
    });
    const noOrder = await request.post('/api/reviews', {
      data: { orderId: nextOrderId(), phone: PHONE, ...GOOD },
    });
    expect(wrongPhone.status()).toBe(noOrder.status());
    expect(await wrongPhone.json()).toEqual(await noOrder.json());
  });

  test('결제되지 않은 주문으로는 쓸 수 없다', async ({ request }) => {
    const orderId = await seedPendingOrder(request);
    const res = await request.post('/api/reviews', {
      data: { orderId, phone: PHONE, ...GOOD },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('ORDER_NOT_PAID');
  });

  test('같은 주문으로 두 번 쓸 수 없다', async ({ request }) => {
    const orderId = await seedPaidOrder(request);
    const first = await request.post('/api/reviews', {
      data: { orderId, phone: PHONE, ...GOOD },
    });
    expect(first.status()).toBe(201);

    const second = await request.post('/api/reviews', {
      data: { orderId, phone: PHONE, rating: 1, body: '두 번째로 남기는 후기입니다.' },
    });
    expect(second.status()).toBe(409);
    expect((await second.json()).error).toBe('ALREADY_REVIEWED');
  });

  test('동시에 두 번 보내도 한 건만 남는다', async ({ request }) => {
    // 조회 후 저장 사이의 틈은 아무리 좁혀도 남습니다. UNIQUE 제약이 막아야 합니다.
    const orderId = await seedPaidOrder(request);
    const results = await Promise.all(
      [1, 2, 3, 4].map(() =>
        request.post('/api/reviews', { data: { orderId, phone: PHONE, ...GOOD } }),
      ),
    );
    const created = results.filter((r) => r.status() === 201);
    expect(created.length, '201 이 하나여야 합니다').toBe(1);
  });
});

test.describe('입력을 그대로 믿지 않는다', () => {
  test('별점이 1~5 밖이면 거절한다', async ({ request }) => {
    for (const rating of [0, 6, -1, 2.5, 999]) {
      const orderId = await seedPaidOrder(request);
      const res = await request.post('/api/reviews', {
        data: { orderId, phone: PHONE, rating, body: GOOD.body },
      });
      expect(res.status(), `별점 ${rating}`).toBe(400);
    }
  });

  test('본문이 너무 짧으면 거절한다', async ({ request }) => {
    const orderId = await seedPaidOrder(request);
    const res = await request.post('/api/reviews', {
      data: { orderId, phone: PHONE, rating: 5, body: '좋아요' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('BODY_TOO_SHORT');
  });

  test('본문이 지나치게 길면 거절한다', async ({ request }) => {
    const orderId = await seedPaidOrder(request);
    const res = await request.post('/api/reviews', {
      data: { orderId, phone: PHONE, rating: 5, body: '가'.repeat(2001) },
    });
    expect(res.status()).toBe(400);
  });

  test('상태를 사용자가 정할 수 없다', async ({ request }) => {
    // status 를 보내도 무시하고 visible 로 만들어야 합니다 —
    // 받아들이면 아무나 자기 리뷰를 숨김 상태로 심어둘 수 있습니다.
    const orderId = await seedPaidOrder(request);
    const res = await request.post('/api/reviews', {
      data: { orderId, phone: PHONE, ...GOOD, status: 'hidden', sponsored: true },
    });
    expect(res.status()).toBe(201);

    const list = await (await request.get('/api/reviews?limit=50')).json();
    const mine = list.reviews.find((r: { body: string }) => r.body === GOOD.body);
    expect(mine, '보이는 목록에 있어야 합니다').toBeTruthy();
    // sponsored 도 손님이 정하는 값이 아닙니다.
    expect(mine.sponsored).toBe(false);
  });
});

test.describe('공개 목록에 나가는 것', () => {
  test('이름은 가려서 나가고 주문번호는 나가지 않는다', async ({ request }) => {
    const orderId = await seedPaidOrder(request, '김후기');
    await request.post('/api/reviews', { data: { orderId, phone: PHONE, ...GOOD } });

    const res = await request.get('/api/reviews?limit=50');
    const { reviews } = await res.json();
    const mine = reviews.find((r: { body: string }) => r.body === GOOD.body);

    expect(mine.author).toBe('김*기');
    expect(JSON.stringify(mine)).not.toContain(orderId);
    expect(JSON.stringify(mine)).not.toContain(PHONE);
    expect(JSON.stringify(mine)).not.toContain('김후기');
  });

  test('별점 요약이 스스로 앞뒤가 맞는다', async ({ request }) => {
    // 다른 테스트가 같은 저장소에 리뷰를 넣고 있어 "이전보다 하나 늘었는가" 는
    // 흔들립니다. 대신 요약이 **자기 자신과** 맞는지를 봅니다 — 합계가 개수와
    // 같고, 평균이 분포에서 나온 값과 같아야 합니다.
    const orderId = await seedPaidOrder(request);
    await request.post('/api/reviews', {
      data: { orderId, phone: PHONE, rating: 4, body: '가볍게 발리고 백탁이 적습니다.' },
    });

    const { summary } = await (await request.get('/api/reviews')).json();
    const dist = summary.distribution as Record<string, number>;

    const sum = Object.values(dist).reduce((a, b) => a + b, 0);
    expect(sum, '분포의 합이 개수와 달라 조작처럼 보입니다').toBe(summary.count);

    const weighted = Object.entries(dist).reduce((a, [star, n]) => a + Number(star) * n, 0);
    expect(summary.average).toBeCloseTo(weighted / summary.count, 1);
    expect(summary.count).toBeGreaterThan(0);
  });

  test('리뷰가 하나도 없으면 평균은 0 이 아니라 null 이다', async ({ request }) => {
    // 0.0 을 내보내면 화면에 "별점 0" 처럼 보이고, 스키마에 들어가면
    // 답변엔진이 최하점으로 읽습니다.
    const { summary } = await (await request.get('/api/reviews')).json();
    if (summary.count === 0) expect(summary.average).toBeNull();
    else expect(summary.average).toBeGreaterThan(0);
  });
});

test.describe('관리 화면에서 숨길 수 있다', () => {
  test('인증 없이는 관리 목록을 볼 수 없다', async ({ request }) => {
    const res = await request.get('/api/admin/reviews');
    expect([401, 403]).toContain(res.status());
  });

  test('숨기면 공개 목록과 요약에서 함께 빠진다', async ({ request }) => {
    const orderId = await seedPaidOrder(request);
    const body = `숨김 시험용 후기입니다 ${orderId}`;
    const created = await request.post('/api/reviews', {
      data: { orderId, phone: PHONE, rating: 3, body },
    });
    const reviewId = (await created.json()).review.id;

    const hidden = await request.patch(`/api/admin/reviews/${reviewId}`, {
      headers: AUTH,
      data: { status: 'hidden', reason: '광고성 내용' },
    });
    expect(hidden.ok(), await hidden.text()).toBeTruthy();

    const after = await (await request.get('/api/reviews?limit=50')).json();
    expect(after.reviews.find((r: { body: string }) => r.body === body)).toBeUndefined();

    // 화면에 없는 리뷰가 평균에 남아 있으면 숫자가 맞지 않아 조작처럼 보입니다.
    // 병렬 테스트라 전체 개수는 흔들리므로, 요약이 스스로 맞는지로 확인합니다.
    const dist = after.summary.distribution as Record<string, number>;
    const sum = Object.values(dist).reduce((a: number, b: number) => a + b, 0);
    expect(sum).toBe(after.summary.count);
  });

  test('이유 없이 숨길 수 없다', async ({ request }) => {
    // 기준 없이 지운 기록이 없으면, 부정적 리뷰만 골라 숨겼는지를
    // 나중에 아무도 증명할 수 없습니다.
    const orderId = await seedPaidOrder(request);
    const created = await request.post('/api/reviews', {
      data: { orderId, phone: PHONE, ...GOOD },
    });
    const reviewId = (await created.json()).review.id;

    const res = await request.patch(`/api/admin/reviews/${reviewId}`, {
      headers: AUTH,
      data: { status: 'hidden' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('REASON_REQUIRED');
  });

  test('다시 보이게 하면 이유가 지워진다', async ({ request }) => {
    const orderId = await seedPaidOrder(request);
    const created = await request.post('/api/reviews', {
      data: { orderId, phone: PHONE, ...GOOD },
    });
    const reviewId = (await created.json()).review.id;

    await request.patch(`/api/admin/reviews/${reviewId}`, {
      headers: AUTH,
      data: { status: 'hidden', reason: '중복 게시' },
    });
    const shown = await request.patch(`/api/admin/reviews/${reviewId}`, {
      headers: AUTH,
      data: { status: 'visible' },
    });
    expect(shown.ok()).toBeTruthy();
    expect((await shown.json()).review.hiddenReason).toBeNull();
  });

  test('없는 리뷰를 고치려 하면 404', async ({ request }) => {
    const res = await request.patch('/api/admin/reviews/REVIEW-00000000000000-ZZZZZZ', {
      headers: AUTH,
      data: { status: 'hidden', reason: '시험' },
    });
    expect(res.status()).toBe(404);
  });
});
