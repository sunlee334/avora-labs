import { test, expect, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ADMIN_DEV_TOKEN } from '../../../playwright.config';

/**
 * 문의 API.
 *
 * ── 이 파일이 지키는 것 ─────────────────────────────────────
 * 문의는 **비공개**입니다. 그래서 여기서 보는 것은 "쓸 수 있는가" 보다
 * **"남의 것을 볼 수 없는가"** 입니다.
 *
 * 그리고 없는 것과 남의 것을 **구분하지 않습니다**. 다르게 답하면
 * "그 번호가 존재하는가" 를 알려주는 셈이 됩니다 —
 * `worker/accounts.ts:314` 가 세운 선례입니다.
 */

const AUTH = { 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN };
const UNIT_PRICE = 32000;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function nextOrderId(): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const stamp = String(20261025000000 + Math.floor(Math.random() * 999999))
    .padEnd(14, '0')
    .slice(0, 14);
  return `AVORA-${stamp}-${suffix}`;
}

/** 매번 다른 연락처 — 병렬 실행에서 서로의 문의를 보지 않게. */
function freshPhone(): string {
  return `010${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
}

async function seedOrder(request: APIRequestContext, phone: string): Promise<string> {
  const orderId = nextOrderId();
  const res = await request.post('/api/orders', {
    data: {
      orderId,
      amount: UNIT_PRICE,
      currency: 'KRW',
      locale: 'ko',
      items: [{ id: 'daily-sunscreen', qty: 1 }],
      recipientName: '문의시험',
      recipientPhone: phone,
      postalCode: '04039',
      address1: '서울특별시 마포구',
    },
  });
  expect(res.status(), `주문 생성 실패: ${await res.text()}`).toBe(200);
  return orderId;
}

test.describe('문의 남기기', () => {
  test('주문번호와 연락처로 남길 수 있다', async ({ request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);

    const res = await request.post('/api/inquiries', {
      data: { orderId, phone, subject: '배송 문의', body: '언제쯤 출발하나요? 궁금합니다.', locale: 'ko' },
    });
    expect(res.status()).toBe(201);

    const { inquiry } = await res.json();
    expect(inquiry.id).toMatch(/^INQUIRY-\d{14}-[A-Z0-9]{6}$/);
    expect(inquiry.status).toBe('open');
    expect(inquiry.answer, '방금 남긴 문의에 답이 있으면 안 됩니다').toBeNull();
  });

  test('연락처가 틀리면 없는 주문과 같은 답이다', async ({ request }) => {
    // 다르게 답하면 "그 주문번호가 존재한다" 를 알려주는 셈입니다.
    const orderId = await seedOrder(request, freshPhone());

    const wrong = await request.post('/api/inquiries', {
      data: { orderId, phone: freshPhone(), subject: '가', body: '열 자가 넘는 본문입니다.' },
    });
    const missing = await request.post('/api/inquiries', {
      data: { orderId: nextOrderId(), phone: freshPhone(), subject: '가', body: '열 자가 넘는 본문입니다.' },
    });

    expect(wrong.status()).toBe(404);
    expect(missing.status()).toBe(404);
    expect(await wrong.json()).toEqual(await missing.json());
  });

  test('로그인도 주문번호도 없으면 거절한다', async ({ request }) => {
    const res = await request.post('/api/inquiries', {
      data: { subject: '가', body: '열 자가 넘는 본문입니다.' },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe('NOT_LOGGED_IN');
  });

  test('너무 짧은 문의는 무엇이 부족한지 알려준다', async ({ request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);

    const res = await request.post('/api/inquiries', {
      data: { orderId, phone, subject: '가', body: '짧음' },
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toBe('BODY_TOO_SHORT');
    expect(body.message, '몇 자가 필요한지 알려주지 않습니다').toMatch(/\d+자/);
  });

  test('제목이나 본문이 없으면 거절한다', async ({ request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);

    for (const data of [
      { orderId, phone, body: '열 자가 넘는 본문입니다.' },
      { orderId, phone, subject: '제목만' },
    ]) {
      const res = await request.post('/api/inquiries', { data });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toBe('MISSING_FIELDS');
    }
  });
});

test.describe('내 문의만 보인다', () => {
  test('주문번호와 연락처로 조회한다', async ({ request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    await request.post('/api/inquiries', {
      data: { orderId, phone, subject: '배송', body: '언제쯤 출발하는지 궁금합니다.' },
    });

    const res = await request.post('/api/inquiries/lookup', { data: { orderId, phone } });
    expect(res.status()).toBe(200);

    const { inquiries } = await res.json();
    expect(inquiries).toHaveLength(1);
    expect(inquiries[0].subject).toBe('배송');
  });

  test('연락처가 틀리면 아무것도 안 나온다', async ({ request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    await request.post('/api/inquiries', {
      data: { orderId, phone, subject: '비밀', body: '남이 보면 안 되는 내용입니다.' },
    });

    const res = await request.post('/api/inquiries/lookup', {
      data: { orderId, phone: freshPhone() },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).inquiries, '남의 문의가 보입니다').toEqual([]);
  });

  test('남의 주문번호로는 못 본다', async ({ request }) => {
    const minePhone = freshPhone();
    const mineOrder = await seedOrder(request, minePhone);
    await request.post('/api/inquiries', {
      data: { orderId: mineOrder, phone: minePhone, subject: '내 문의', body: '내가 남긴 문의입니다.' },
    });

    const otherPhone = freshPhone();
    const otherOrder = await seedOrder(request, otherPhone);

    // 남의 주문번호 + 내 연락처
    const res = await request.post('/api/inquiries/lookup', {
      data: { orderId: otherOrder, phone: minePhone },
    });
    expect((await res.json()).inquiries).toEqual([]);
  });

  test('로그인하지 않으면 목록을 못 본다', async ({ request }) => {
    const res = await request.get('/api/inquiries');
    expect(res.status()).toBe(401);
  });

  test('응답에 연락처와 답변자가 들어 있지 않다', async ({ request }) => {
    // 손님 화면에 관리자 이메일이나 남의 연락처가 흘러가면 안 됩니다.
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    await request.post('/api/inquiries', {
      data: { orderId, phone, subject: '가', body: '열 자가 넘는 본문입니다.' },
    });

    const text = await (
      await request.post('/api/inquiries/lookup', { data: { orderId, phone } })
    ).text();
    expect(text).not.toContain(phone);
    expect(text).not.toContain('contactPhone');
    expect(text).not.toContain('answeredBy');
  });
});

test.describe('관리 화면에서 답한다', () => {
  test('토큰 없이는 목록을 못 본다', async ({ request }) => {
    const res = await request.get('/api/admin/inquiries');
    expect(res.status(), '인증 없이 문의가 열립니다').toBe(401);
  });

  test('토큰 없이는 답할 수 없다', async ({ request }) => {
    const res = await request.patch('/api/admin/inquiries/INQUIRY-20260101000000-AAAAAA', {
      data: { answer: '답변입니다.' },
    });
    expect(res.status()).toBe(401);
  });

  test('답하면 손님 화면에 나타난다', async ({ request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    const created = await (
      await request.post('/api/inquiries', {
        data: { orderId, phone, subject: '배송', body: '언제쯤 출발하는지 궁금합니다.' },
      })
    ).json();

    const answered = await request.patch(`/api/admin/inquiries/${created.inquiry.id}`, {
      headers: AUTH,
      data: { answer: '내일 출발합니다. 송장번호는 발송 후 안내드립니다.' },
    });
    expect(answered.status()).toBe(200);

    const { inquiries } = await (
      await request.post('/api/inquiries/lookup', { data: { orderId, phone } })
    ).json();
    expect(inquiries[0].status).toBe('answered');
    expect(inquiries[0].answer.body).toContain('내일 출발합니다');
  });

  test('이미 답한 문의에 다시 답할 수 없다', async ({ request }) => {
    // 두 번 눌린 저장 버튼이 앞선 답을 조용히 덮으면 손님이 읽던 내용이
    // 사라집니다.
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    const created = await (
      await request.post('/api/inquiries', {
        data: { orderId, phone, subject: '가', body: '열 자가 넘는 본문입니다.' },
      })
    ).json();

    const first = await request.patch(`/api/admin/inquiries/${created.inquiry.id}`, {
      headers: AUTH,
      data: { answer: '첫 번째 답변입니다.' },
    });
    expect(first.status()).toBe(200);

    const second = await request.patch(`/api/admin/inquiries/${created.inquiry.id}`, {
      headers: AUTH,
      data: { answer: '두 번째 답변입니다.' },
    });
    expect(second.status()).toBe(409);
    expect((await second.json()).error).toBe('ALREADY_ANSWERED');

    // 그리고 첫 답이 그대로 남아 있어야 합니다.
    const { inquiries } = await (
      await request.post('/api/inquiries/lookup', { data: { orderId, phone } })
    ).json();
    expect(inquiries[0].answer.body).toBe('첫 번째 답변입니다.');
  });

  test('없는 문의에 답하면 404', async ({ request }) => {
    const res = await request.patch('/api/admin/inquiries/INQUIRY-20260101000000-ZZZZZZ', {
      headers: AUTH,
      data: { answer: '답변입니다.' },
    });
    expect(res.status()).toBe(404);
  });

  test('미답변 건수를 알려준다', async ({ request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    await request.post('/api/inquiries', {
      data: { orderId, phone, subject: '가', body: '열 자가 넘는 본문입니다.' },
    });

    const res = await request.get('/api/admin/inquiries?status=open', { headers: AUTH });
    const body = await res.json();
    // 병렬 실행이라 절대값을 못 박습니다. 대신 내부 정합성을 봅니다.
    expect(body.open).toBeGreaterThan(0);
    expect(body.inquiries.every((i: any) => i.status === 'open')).toBe(true);
  });
});

test.describe('데이터베이스가 유령 행을 막는다', () => {
  test('user_id 도 order_id 도 없으면 거절한다', () => {
    /*
     * 애플리케이션이 실수해도 통과하지 않아야 합니다. 둘 다 없는 행은
     * **아무도 조회할 수 없고**, 손님은 답을 못 받는데 관리 목록에만
     * 보입니다 — 예외도 안 나는 조용한 실패입니다.
     *
     * API 로는 이 상태를 만들 수 없으므로(코드가 먼저 막습니다) D1 에
     * 직접 넣어 봅니다.
     */
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    let failed = false;
    let message = '';
    try {
      execFileSync(
        'npx',
        [
          'wrangler',
          'd1',
          'execute',
          'avora-orders',
          '--local',
          '--command',
          "INSERT INTO inquiries (id,subject,body,locale,created_at,updated_at) " +
            "VALUES ('GHOST','s','b','ko','2026-01-01','2026-01-01')",
        ],
        { cwd: root, encoding: 'utf8', stdio: 'pipe' },
      );
    } catch (error) {
      failed = true;
      const e = error as { stdout?: string; stderr?: string };
      message = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }

    expect(failed, '유령 행이 들어갔습니다').toBe(true);
    expect(message).toContain('CHECK constraint failed');
  });
});
