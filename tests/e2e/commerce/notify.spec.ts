import { test, expect, type APIRequestContext } from '@playwright/test';
import { CAPTURE_URL } from '../../../playwright.config';
import { composeMessage } from '../../../worker/notify/webhook';

/**
 * 새 주문 알림.
 *
 * 두 가지를 봅니다.
 *
 *   1. 발송할 것이 생겼을 때만 알린다 — 결제가 성사된 순간에만.
 *      주문이 만들어진 순간이 아닙니다. 체크아웃까지 왔다가 결제창에서
 *      그만두는 사람이 훨씬 많고, 그걸 다 알리면 알림 대부분이
 *      처리할 일 없는 알림이 됩니다.
 *
 *   2. 알림이 실패해도 결제는 멀쩡하다 — 고객은 이미 돈을 냈고,
 *      Slack 이 죽은 것은 고객의 문제가 아닙니다.
 */

const UNIT_PRICE = 32000;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function nextOrderId(): string {
  const stamp = String(20261025000000 + Math.floor(Math.random() * 999999)).padEnd(14, '0').slice(0, 14);
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `AVORA-${stamp}-${suffix}`;
}

async function seedOrder(
  request: APIRequestContext,
  qty = 1,
  recipientName = '박지훈',
): Promise<string> {
  const orderId = nextOrderId();
  const res = await request.post('/api/orders', {
    data: {
      orderId,
      amount: UNIT_PRICE * qty,
      currency: 'KRW',
      locale: 'ko',
      items: [{ id: 'daily-sunscreen', qty }],
      recipientName,
      recipientPhone: '010-5555-1234',
      postalCode: '04524',
      address1: '서울 중구 세종대로 110',
    },
  });
  expect(res.status()).toBe(200);
  return orderId;
}

interface Captured {
  path: string;
  body: { text?: string; content?: string };
}

async function captured(request: APIRequestContext): Promise<Captured[]> {
  const res = await request.get(`${CAPTURE_URL}/received`);
  return (await res.json()).received;
}

/** 알림은 waitUntil 로 응답 뒤에 나가므로, 도착할 시간을 줍니다. */
async function waitForNotification(
  request: APIRequestContext,
  orderId: string,
): Promise<Captured | null> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const all = await captured(request);
    const hit = all.find((c) => (c.body.text ?? c.body.content ?? '').includes(orderId));
    if (hit) return hit;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

test.describe('알림 문구', () => {
  // 순수 함수라 서버 없이 바로 확인합니다.
  test('주문번호·상품·금액·받는 분이 들어간다', () => {
    const message = composeMessage({
      orderId: 'AVORA-20261025120000-AB12CD',
      amount: 64000,
      currency: 'KRW',
      items: [{ name: 'Daily Sunscreen', qty: 2 }],
      recipientName: '박지훈',
      adminUrl: 'https://example.com/admin',
      paidAt: '2026-10-25T12:00:00.000Z',
    });

    expect(message).toContain('AVORA-20261025120000-AB12CD');
    expect(message).toContain('Daily Sunscreen × 2');
    expect(message).toContain('64,000');
    expect(message).toContain('박지훈');
    expect(message).toContain('https://example.com/admin');
  });

  test('주소와 연락처는 넣지 않는다', () => {
    // 웹훅이 닿는 곳은 채팅방이고, 채팅방은 관리 화면과 달리 Access 뒤에
    // 있지 않습니다. 배송에 필요한 정보는 관리 화면에서 봅니다.
    const message = composeMessage({
      orderId: 'AVORA-20261025120000-AB12CD',
      amount: 32000,
      currency: 'KRW',
      items: [{ name: 'Daily Sunscreen', qty: 1 }],
      recipientName: '박지훈',
      adminUrl: null,
      paidAt: '2026-10-25T12:00:00.000Z',
    });

    expect(message).not.toContain('세종대로');
    expect(message).not.toMatch(/010[-\d]/);
  });

  test('알 수 없는 통화라도 문구를 만들어 낸다', () => {
    // Intl.NumberFormat 은 잘못된 통화 코드에 예외를 던집니다.
    // 알림이 그것 때문에 통째로 안 나가면 안 됩니다.
    const message = composeMessage({
      orderId: 'AVORA-20261025120000-AB12CD',
      amount: 1000,
      currency: 'ZZZ',
      items: [{ name: 'x', qty: 1 }],
      recipientName: 'y',
      adminUrl: null,
      paidAt: '2026-10-25T12:00:00.000Z',
    });
    expect(message).toContain('1,000');
  });
});

test.describe('알림 문구는 채팅 제어 문법으로 읽히지 않는다', () => {
  // 리뷰가 잡은 결함: 받는 분 이름이 그대로 실려 나갔습니다. Slack 은 <!channel> 을
  // 전체 멘션으로, <주소|글자> 를 링크로 해석합니다. 이름칸은 인증 없이 누구나
  // 넣을 수 있어, 고객이 판매자 채널 전체를 호출할 수 있었습니다.
  const hostile = {
    orderId: 'AVORA-20261025120000-AB12CD',
    amount: 32000,
    currency: 'KRW',
    items: [{ name: '<!here>', qty: 1 }],
    recipientName: '<!channel> <http://evil.example|결제확인>',
    adminUrl: null,
    paidAt: '2026-10-25T12:00:00.000Z',
  };

  test('Slack 으로 갈 때는 & < > 를 엔티티로 바꾼다', () => {
    const escaped = composeMessage(hostile, (v) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    );
    expect(escaped).not.toContain('<!channel>');
    expect(escaped).not.toContain('<http://evil.example|');
    expect(escaped).toContain('&lt;!channel&gt;');
  });

  test('실제로 나간 알림에 제어 문법이 남아 있지 않다', async ({ request }) => {
    const orderId = await seedOrder(request, 1, '<!channel> 김고객');

    const confirm = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'ok_escape', orderId, amount: UNIT_PRICE },
    });
    expect(confirm.status()).toBe(200);

    const hit = await waitForNotification(request, orderId);
    expect(hit).not.toBeNull();

    const text = hit!.body.text ?? hit!.body.content ?? '';
    expect(text).not.toContain('<!channel>');
    expect(text).toContain('김고객');
  });
});

test.describe('언제 알리는가', () => {
  test('결제가 끝나면 알림이 나간다', async ({ request }) => {
    const orderId = await seedOrder(request, 2);

    const confirm = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'ok_notify', orderId, amount: UNIT_PRICE * 2 },
    });
    expect(confirm.status()).toBe(200);

    const hit = await waitForNotification(request, orderId);
    expect(hit, '결제 후 알림이 도착해야 합니다').not.toBeNull();

    const text = hit!.body.text ?? hit!.body.content ?? '';
    expect(text).toContain('Daily Sunscreen × 2');
    expect(text).toContain('박지훈');
    expect(text).toContain('/admin');
  });

  test('주문만 만들고 결제하지 않으면 알리지 않는다', async ({ request }) => {
    // 체크아웃까지 왔다가 결제창에서 그만두는 주문까지 알리면,
    // 판매자에게 오는 알림 대부분이 처리할 일 없는 알림이 됩니다.
    const orderId = await seedOrder(request);

    await new Promise((resolve) => setTimeout(resolve, 800));
    const all = await captured(request);
    expect(all.some((c) => (c.body.text ?? c.body.content ?? '').includes(orderId))).toBe(false);
  });

  test('결제가 거절되면 알리지 않는다', async ({ request }) => {
    const orderId = await seedOrder(request);
    const confirm = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'fail_declined', orderId, amount: UNIT_PRICE },
    });
    expect(confirm.status()).toBe(502);

    await new Promise((resolve) => setTimeout(resolve, 800));
    const all = await captured(request);
    expect(all.some((c) => (c.body.text ?? c.body.content ?? '').includes(orderId))).toBe(false);
  });

  test('완료 화면을 새로고침해도 알림은 한 번만 나간다', async ({ request }) => {
    const orderId = await seedOrder(request);
    const payload = { paymentKey: 'ok_once', orderId, amount: UNIT_PRICE };

    expect((await request.post('/api/payments/confirm', { data: payload })).status()).toBe(200);
    expect(await waitForNotification(request, orderId)).not.toBeNull();

    // 두 번째 호출은 "이미 결제됨" 으로 일찍 돌아갑니다.
    const again = await request.post('/api/payments/confirm', { data: payload });
    expect((await again.json()).alreadyPaid).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 800));
    const all = await captured(request);
    const count = all.filter((c) =>
      (c.body.text ?? c.body.content ?? '').includes(orderId),
    ).length;
    expect(count).toBe(1);
  });
});

test.describe('알림이 실패해도 주문은 멀쩡하다', () => {
  test('일시적 실패로 다시 시도한 결제도 알림은 한 번', async ({ request }) => {
    const orderId = await seedOrder(request);

    // 첫 시도는 결과를 알 수 없는 실패 — 주문은 pending 으로 남습니다.
    const flaky = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'flaky_timeout', orderId, amount: UNIT_PRICE },
    });
    expect(flaky.status()).toBe(503);

    await new Promise((resolve) => setTimeout(resolve, 500));
    let all = await captured(request);
    expect(all.some((c) => (c.body.text ?? c.body.content ?? '').includes(orderId))).toBe(false);

    // 재시도로 성사되면 그때 한 번 나갑니다.
    const retry = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'ok_after_flaky', orderId, amount: UNIT_PRICE },
    });
    expect(retry.status()).toBe(200);
    expect(await waitForNotification(request, orderId)).not.toBeNull();

    all = await captured(request);
    expect(
      all.filter((c) => (c.body.text ?? c.body.content ?? '').includes(orderId)).length,
    ).toBe(1);
  });
});
