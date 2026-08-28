import { test, expect, type APIRequestContext } from '@playwright/test';
import { CAPTURE_URL } from '../../../playwright.config';
import { composeInquiryMessage } from '../../../worker/notify/inquiry';

/**
 * 새 문의 알림 (AC-20).
 *
 * 문의는 비공개라 검색 유입에 기여하지 않습니다. 목적이 오직 하나 — 이미 온
 * 사람에게 답하는 것입니다. 그런데 관리 화면은 누가 열어 보기 전까지 아무
 * 말도 하지 않습니다. 답이 늦으면 이 기능은 존재 이유가 사라집니다.
 *
 * ── 여기서 가장 중요한 것은 "무엇이 안 나가는가" 입니다 ────
 * 웹훅이 닿는 곳은 채팅방이고, 채팅방은 관리 화면과 달리 Cloudflare Access
 * 뒤에 있지 않습니다. 문의 제목·본문은 손님이 자기 문제를 서술한 문장이라
 * ("결제가 두 번 됐어요, 카드 끝자리 1234") 그대로 흘리면 안 됩니다.
 * 그리고 개인정보처리방침에 문의 내용을 외부 채널로 보낸다는 항목이 없습니다.
 *
 * 그 규칙이 깨지면 **아무도 눈치채지 못합니다** — 알림은 더 유용해 보이고,
 * 화면은 그대로이며, 새는 것은 우리가 안 보는 채팅방입니다. 그래서 봅니다.
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
let seq = 0;

function nextOrderId(): string {
  seq += 1;
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  const stamp = String(20261025000000 + Math.floor(Math.random() * 999999))
    .padEnd(14, '0')
    .slice(0, 14);
  return `AVORA-${stamp}-${suffix}`;
}

function freshPhone(): string {
  return `010${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
}

async function seedOrder(request: APIRequestContext, phone: string): Promise<string> {
  const orderId = nextOrderId();
  const res = await request.post('/api/orders', {
    data: {
      orderId,
      amount: 32000,
      currency: 'KRW',
      locale: 'ko',
      items: [{ id: 'daily-sunscreen', qty: 1 }],
      recipientName: '알림시험',
      recipientPhone: phone,
      postalCode: '04039',
      address1: '서울특별시 마포구',
    },
  });
  expect(res.status(), `주문 생성 실패: ${await res.text()}`).toBe(200);
  return orderId;
}

interface Captured {
  path: string;
  body: { text?: string; content?: string };
}

function textOf(c: Captured): string {
  return c.body.text ?? c.body.content ?? '';
}

/** 알림은 waitUntil 로 응답 뒤에 나가므로, 도착할 시간을 줍니다. */
async function waitForInquiryNotification(
  request: APIRequestContext,
  inquiryId: string,
): Promise<Captured | null> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await request.get(`${CAPTURE_URL}/received`);
    const all: Captured[] = (await res.json()).received;
    const hit = all.find((c) => textOf(c).includes(inquiryId));
    if (hit) return hit;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

test.describe('문구가 담는 것과 담지 않는 것', () => {
  const n = {
    inquiryId: 'INQUIRY-20260828010203-AB12CD',
    locale: 'ko',
    via: 'order' as const,
    adminUrl: 'https://avoralabs.co/admin',
  };

  test('문의번호·경로·언어·관리 링크가 들어간다', () => {
    const message = composeInquiryMessage(n);
    expect(message).toContain('INQUIRY-20260828010203-AB12CD');
    expect(message).toContain('주문조회');
    expect(message).toContain('ko');
    expect(message).toContain('https://avoralabs.co/admin');
  });

  test('로그인으로 남긴 것과 주문번호로 남긴 것을 구분한다', () => {
    // 어느 화면에서 답할지가 갈립니다.
    expect(composeInquiryMessage({ ...n, via: 'account' })).toContain('마이페이지');
    expect(composeInquiryMessage({ ...n, via: 'order' })).toContain('주문조회');
  });

  test('관리 링크가 없어도 문구를 만들어 낸다', () => {
    const message = composeInquiryMessage({ ...n, adminUrl: null });
    expect(message).toContain('INQUIRY-20260828010203-AB12CD');
    expect(message).not.toContain('null');
  });

  test('이스케이프 함수를 통과시킨다', () => {
    // 오늘 담는 값은 전부 우리가 만들거나 고른 것이지만, 나중에 손님이 쓴
    // 값이 하나라도 끼면 여기가 이미 막고 있어야 합니다.
    const marked = composeInquiryMessage(n, (v) => `[${v}]`);
    expect(marked).toContain('[INQUIRY-20260828010203-AB12CD]');
    expect(marked).toContain('[ko]');
  });
});

test.describe('실제로 나간 알림에 손님이 쓴 글이 없다', () => {
  test('제목도 본문도 채팅방으로 나가지 않는다', async ({ request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);

    // 알아보기 쉬운 표식을 넣습니다 — 새어 나가면 바로 눈에 띄도록.
    const subject = `유출표식제목-${Date.now().toString(36)}`;
    const body = `유출표식본문-${Date.now().toString(36)} 카드 끝자리 1234 입니다.`;

    const created = await request.post('/api/inquiries', {
      data: { orderId, phone, subject, body, locale: 'ko' },
    });
    expect(created.status()).toBe(201);
    const { inquiry } = await created.json();

    const hit = await waitForInquiryNotification(request, inquiry.id);
    expect(hit, '문의 알림이 나가지 않았습니다').not.toBeNull();

    const message = textOf(hit!);
    expect(message, '문의 제목이 채팅방으로 새 나갔습니다').not.toContain(subject);
    expect(message, '문의 본문이 채팅방으로 새 나갔습니다').not.toContain(body);
    expect(message, '연락처가 채팅방으로 새 나갔습니다').not.toContain(phone);
    expect(message, '주문번호가 채팅방으로 새 나갔습니다').not.toContain(orderId);

    // 대신 있어야 할 것
    expect(message).toContain('새 문의');
    expect(message).toContain(inquiry.id);
    expect(message).toContain('/admin');
  });

  test('로그인 없이 남긴 문의도 알림이 나간다', async ({ request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    const created = await request.post('/api/inquiries', {
      data: { orderId, phone, subject: '배송', body: '언제쯤 출발하는지 궁금합니다.', locale: 'ko' },
    });
    const { inquiry } = await created.json();

    const hit = await waitForInquiryNotification(request, inquiry.id);
    expect(hit, '주문 경로 문의가 알려지지 않았습니다').not.toBeNull();
    expect(textOf(hit!)).toContain('주문조회');
  });
});

test.describe('알림이 손님을 방해하지 않는다', () => {
  test('문의는 즉시 201 로 돌아온다', async ({ request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);

    const started = Date.now();
    const res = await request.post('/api/inquiries', {
      data: { orderId, phone, subject: '속도', body: '응답이 알림을 기다리지 않아야 합니다.', locale: 'ko' },
    });
    const elapsed = Date.now() - started;

    expect(res.status()).toBe(201);
    // waitUntil 이라 응답은 알림과 무관하게 끝나야 합니다. 넉넉히 잡아도
    // 웹훅 왕복(수십~수백 ms)이 응답에 더해졌다면 이 선을 넘습니다.
    expect(elapsed, `문의 응답이 ${elapsed}ms 걸렸습니다 — 알림을 기다린 것 같습니다`).toBeLessThan(3000);
  });

  /*
   * "거절된 문의는 알리지 않는다" 는 여기서 **관측할 수 없어** 쓰지 않았습니다.
   *
   * 400 으로 거절되면 문의가 만들어지지 않으므로 알림에 실릴 문의번호도
   * 없습니다. 열쇠가 없으니 "이 시도가 알림을 냈는가" 를 물을 방법이 없고,
   * 전역으로 "새 문의" 개수를 세면 캡처 서버가 병렬 워커 공용이라 다른
   * 테스트가 만든 알림이 섞입니다(실제로 6건이 섞여 실패했습니다).
   *
   * 그 속성은 구조가 보장합니다 — `worker/index.ts` 의 400 반환이
   * `createInquiry` **앞**에 있고 알림은 그 **뒤**에 있습니다. 관측하지
   * 못하는 것을 세어 흔들리는 테스트를 만드는 것보다, 못 본다고 적어 두는
   * 편이 낫습니다.
   */

  test('한 문의에 알림은 한 번만 나간다', async ({ request }) => {
    // 이것은 관측할 수 있습니다 — 문의번호가 열쇠가 되어 줍니다.
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    const created = await request.post('/api/inquiries', {
      data: { orderId, phone, subject: '중복', body: '알림이 한 번만 나가야 합니다.', locale: 'ko' },
    });
    const { inquiry } = await created.json();

    expect(await waitForInquiryNotification(request, inquiry.id)).not.toBeNull();
    // 도착한 뒤에도 더 오지 않는지 봅니다.
    await new Promise((resolve) => setTimeout(resolve, 800));

    const all: Captured[] = (await (await request.get(`${CAPTURE_URL}/received`)).json()).received;
    const mine = all.filter((c) => textOf(c).includes(inquiry.id));
    expect(mine, `같은 문의에 알림이 ${mine.length}번 나갔습니다`).toHaveLength(1);
  });
});
