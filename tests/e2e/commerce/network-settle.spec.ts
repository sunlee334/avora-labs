import { test, expect, type Page, type Request, type APIRequestContext } from '@playwright/test';

/**
 * 띄운 요청은 닫혀야 합니다.
 *
 * 상태 코드만 보고 빠져나가면서 **응답 본문을 읽지 않으면** 스트림이 열린 채
 * 남습니다. 화면은 멀쩡히 그려지므로 눈으로는 보이지 않고, 브라우저의
 * 네트워크만 조용해지지 않아 `networkidle` 에 영영 닿지 못합니다.
 *
 * ── 엔진에 따라 다릅니다 ────────────────────────────────────
 * 이 결함은 **Chromium 에서만** 드러납니다. WebKit 은 읽지 않은 본문을
 * 알아서 닫습니다 (되돌려 5회 반복 확인: desktop 5/5 실패, mobile 5/5 통과).
 * 그래서 무작위로 흔들리는 테스트가 아니라 **엔진별로 결정적**이고, 하필
 * Chromium 이 Lighthouse·PageSpeed 가 도는 곳이라 잡아야 할 쪽에서 잡힙니다.
 *
 * WebKit 에서는 어느 단언도 실패할 수 없으므로 파일 전체를 건너뜁니다 —
 * 3초 대기를 두 번씩 하면서 신호를 0 주는 것은 스위트에 손해입니다.
 *
 * ── 이 파일이 한 번 아무것도 지키지 못했습니다 ──────────────
 * 처음 쓸 때 두 번째 테스트가 `/ko/order/lookup` 을 **그냥 열고** 남는
 * 요청이 없는지 봤습니다. 그런데 그 화면은 조회에 성공하기 전까지 `/api/` 를
 * 한 번도 부르지 않습니다 — `fetch` 도 `mountInquiry` 도 전부 submit 핸들러
 * 안입니다(`order/lookup.astro:108` 이 여는 핸들러 안의 `:122`·`:165`).
 * 즉 단언이 `expect([]).toEqual([])` 였고, 고침을 지워도 통과했습니다.
 * 실측으로 확인했습니다 — 로드 시 `/api/` 요청 **0건**.
 *
 * 그래서 지금은 **조회를 실제로 성공시키고 문의까지 제출한 뒤** 잽니다.
 * 그 경로가 문의 기능에서 가장 흔하고, 가장 오래 새던 곳입니다 —
 * 제출 성공 응답(201, 본문 있음)을 화면이 쓰지 않기 때문입니다.
 */

const SUBJECT = '네트워크 정리 확인';
const BODY = '요청이 다 닫히는지 보기 위한 문의입니다.';

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
      recipientName: '정리시험',
      recipientPhone: phone,
      postalCode: '04039',
      address1: '서울특별시 마포구',
    },
  });
  expect(res.status(), `주문 생성 실패: ${await res.text()}`).toBe(200);
  return orderId;
}

/** 아직 끝나지 않은 API 요청을 감시한다. 반환된 함수가 현재 목록을 준다. */
function watchPending(page: Page): () => string[] {
  const pending = new Set<Request>();
  page.on('request', (r) => {
    if (r.url().includes('/api/')) pending.add(r);
  });
  page.on('requestfinished', (r) => pending.delete(r));
  page.on('requestfailed', (r) => pending.delete(r));
  return () => [...pending].map((r) => `${r.method()} ${new URL(r.url()).pathname}`);
}

/**
 * 요청이 다 닫힐 때까지 기다린다.
 *
 * 고정 대기가 아니라 폴링입니다 — 평시엔 즉시 끝나고, CI 에서 워커 일곱이
 * 한 Worker 를 두드려 응답이 늦어도 오탐을 내지 않습니다. 누수된 스트림은
 * 3초든 30초든 영원히 pending 이므로 진짜 회귀는 그대로 잡힙니다.
 */
async function settled(page: Page, pending: () => string[], deadlineMs = 15_000): Promise<string[]> {
  const start = Date.now();
  let left = pending();
  while (left.length > 0 && Date.now() - start < deadlineMs) {
    await page.waitForTimeout(250);
    left = pending();
  }
  return left;
}

const WHY = '응답 본문을 읽지 않아 스트림이 열린 채 남았습니다';

test.describe('띄운 요청은 닫힌다', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'WebKit 은 읽지 않은 본문을 알아서 닫아 어느 단언도 실패할 수 없습니다',
  );

  test('로그인하지 않고 마이페이지를 열어도 남는 요청이 없다', async ({ page }) => {
    // 이 화면은 로드 즉시 /api/account/me 와 /api/inquiries 를 부르고
    // 둘 다 401 로 돌아옵니다 — 본문을 안 읽으면 둘 다 열린 채 남습니다.
    const pending = watchPending(page);
    await page.goto('/ko/account', { waitUntil: 'load' });
    expect(await settled(page, pending), WHY).toEqual([]);
  });

  test('주문조회로 문의를 남기고 나서도 남는 요청이 없다', async ({ page, request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);

    const pending = watchPending(page);
    await page.goto('/ko/order/lookup', { waitUntil: 'load' });

    // 조회에 성공해야 문의 섹션이 붙습니다(lookup.astro:165).
    await page.fill('[data-lookup] input[name="orderId"]', orderId);
    await page.fill('[data-lookup] input[name="phone"]', phone);
    await page.click('[data-lookup-submit]');
    await expect(page.locator('[data-inquiry-form]')).toBeVisible();

    // 그리고 실제로 제출합니다 — 201 은 본문이 있는데 화면이 쓰지 않습니다.
    await page.fill('#inq-subject', SUBJECT);
    await page.fill('#inq-body', BODY);
    await page.click('[data-inquiry-submit]');
    await expect(page.locator('.inquiryList__subject', { hasText: SUBJECT })).toBeVisible();

    expect(await settled(page, pending), WHY).toEqual([]);
  });

  /**
   * 위 둘은 "지금 이 화면이 괜찮다" 는 확인입니다. 이것은 **왜 괜찮은지**
   * 를 고정합니다 — 본문을 읽지 않으면 정말로 요청이 끝나지 않는다는 사실이
   * 사라지면, 위 둘은 통과하면서도 아무것도 지키지 못하게 됩니다.
   */
  test('본문을 읽지 않은 401 은 끝나지 않는다 — 이 파일이 지키는 전제', async ({ page }) => {
    const pending = new Set<string>();
    const key = (r: Request) => new URL(r.url()).search;
    page.on('request', (r) => {
      if (r.url().includes('probe=')) pending.add(key(r));
    });
    page.on('requestfinished', (r) => pending.delete(key(r)));
    page.on('requestfailed', (r) => pending.delete(key(r)));

    await page.goto('/ko/account', { waitUntil: 'load' });
    await page.evaluate(async () => {
      const unread = await fetch('/api/inquiries?probe=unread');
      void unread.status; // 일부러 본문을 읽지 않습니다
      const read = await fetch('/api/inquiries?probe=read');
      await read.text();
    });
    await page.waitForTimeout(3000);

    expect([...pending]).toEqual(['?probe=unread']);
  });
});
