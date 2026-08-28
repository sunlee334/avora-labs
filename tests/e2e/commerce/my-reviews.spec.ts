import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { ADMIN_DEV_TOKEN } from '../../../playwright.config';

/**
 * 마이페이지 — 내가 쓴 후기 · 아직 안 쓴 주문.
 *
 * ── 이 파일이 지키는 것 ─────────────────────────────────────
 * 후기에는 `user_id` 가 없습니다. 소유 열쇠는 `order_id` 하나이고,
 * "내 후기" 는 `reviews JOIN orders ON orders.user_id` 로 나옵니다.
 * 그래서 **남의 후기가 새어 들어오지 않는가** 가 가장 중요한 단언입니다 —
 * JOIN 조건이 하나 틀리면 모든 후기가 모두에게 보입니다.
 *
 * 그리고 **로그인 없이 쓴 후기는 안 보인다** 는 것도 함께 봅니다. 이것은
 * 결함이 아니라 구조에서 나오는 사실이고, 화면이 그 사실을 말합니다.
 * 말하지 않으면 "후기를 썼는데 없어졌다" 가 됩니다.
 */

const AUTH = { 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
let seq = 0;

function orderId(): string {
  seq += 1;
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  const stamp = String(20261101000000 + Math.floor(Math.random() * 999999))
    .padEnd(14, '0')
    .slice(0, 14);
  return `AVORA-${stamp}-${suffix}`;
}

function freshPhone(): string {
  return `010${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
}

function freshCode(): string {
  seq += 1;
  return `mr-${Date.now().toString(36)}-${seq}`;
}

async function loginAs(page: Page, code: string): Promise<void> {
  const start = await page.request.get(
    `/api/auth/login?provider=mock&returnTo=%2Fko%2Faccount&code=${encodeURIComponent(code)}`,
  );
  expect(start.ok(), '모의 로그인 실패').toBeTruthy();
}

/** 결제까지 마친 주문을 만들고, 원하면 계정에 붙입니다. */
async function paidOrder(
  request: APIRequestContext,
  phone: string,
  name = '후기시험',
): Promise<string> {
  const id = orderId();
  const created = await request.post('/api/orders', {
    data: {
      orderId: id,
      amount: 32000,
      currency: 'KRW',
      locale: 'ko',
      items: [{ id: 'daily-sunscreen', qty: 1 }],
      recipientName: name,
      recipientPhone: phone,
      postalCode: '04039',
      address1: '서울특별시 마포구',
    },
  });
  expect(created.status(), `주문 생성 실패: ${await created.text()}`).toBe(200);

  const paid = await request.post('/api/payments/confirm', {
    headers: AUTH,
    data: { orderId: id, paymentKey: `mr-${id}`, amount: 32000 },
  });
  expect(paid.status(), `결제 실패: ${await paid.text()}`).toBe(200);
  return id;
}

test.describe('내 후기 API', () => {
  test('로그인하지 않으면 볼 수 없다', async ({ request }) => {
    const res = await request.get('/api/account/reviews');
    expect(res.status()).toBe(401);
  });

  test('내가 쓴 후기와 아직 안 쓴 주문이 함께 나온다', async ({ page }) => {
    await loginAs(page, freshCode());
    const phone = freshPhone();

    const reviewed = await paidOrder(page.request, phone);
    const notYet = await paidOrder(page.request, phone);
    for (const id of [reviewed, notYet]) {
      const claimed = await page.request.post('/api/account/claim', { data: { orderId: id, phone } });
      expect(claimed.ok(), '주문 연결 실패').toBeTruthy();
    }

    const wrote = await page.request.post('/api/reviews', {
      data: { orderId: reviewed, phone, rating: 5, body: '가볍고 백탁이 없어 매일 씁니다.' },
    });
    expect(wrote.status()).toBe(201);

    const res = await page.request.get('/api/account/reviews');
    expect(res.status()).toBe(200);
    const data = await res.json();

    expect(data.reviews.map((r: { orderId: string }) => r.orderId)).toContain(reviewed);
    expect(data.pending.map((o: { orderId: string }) => o.orderId)).toContain(notYet);
    // 쓴 주문은 "안 쓴 주문" 에 남아 있으면 안 됩니다.
    expect(data.pending.map((o: { orderId: string }) => o.orderId)).not.toContain(reviewed);
  });

  test('남의 후기는 섞이지 않는다', async ({ page, browser }) => {
    // JOIN 조건이 하나 틀리면 모든 후기가 모두에게 보입니다.
    const phoneA = freshPhone();
    await loginAs(page, freshCode());
    const orderA = await paidOrder(page.request, phoneA);
    await page.request.post('/api/account/claim', { data: { orderId: orderA, phone: phoneA } });
    await page.request.post('/api/reviews', {
      data: { orderId: orderA, phone: phoneA, rating: 5, body: '내가 쓴 후기입니다. 남이 보면 안 됩니다.' },
    });

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await loginAs(otherPage, freshCode());
    const res = await otherPage.request.get('/api/account/reviews');
    const data = await res.json();
    expect(
      data.reviews.map((r: { orderId: string }) => r.orderId),
      '남의 후기가 보입니다',
    ).not.toContain(orderA);
    await other.close();
  });

  test('계정에 붙이지 않은 주문의 후기는 안 보인다', async ({ page, request }) => {
    // 결함이 아니라 구조에서 나오는 사실입니다 — 화면이 이 사실을 말합니다.
    //
    // 주문을 **세션 없는** request 로 만듭니다. page.request 로 만들면
    // 서버가 로그인 상태를 보고 바로 계정에 이어 버려(`worker/index.ts:247`)
    // "로그인 없이 산 주문" 이 되지 않습니다 — 처음 이 테스트가 그래서
    // 실패했고, 실패한 쪽이 옳았습니다.
    await loginAs(page, freshCode());
    const phone = freshPhone();
    const loose = await paidOrder(request, phone);
    await request.post('/api/reviews', {
      data: { orderId: loose, phone, rating: 4, body: '로그인 없이 남긴 것과 같은 상태입니다.' },
    });

    const before = await (await page.request.get('/api/account/reviews')).json();
    expect(before.reviews.map((r: { orderId: string }) => r.orderId)).not.toContain(loose);

    // 주문을 계정에 붙이면 그때 따라옵니다.
    await page.request.post('/api/account/claim', { data: { orderId: loose, phone } });
    const after = await (await page.request.get('/api/account/reviews')).json();
    expect(after.reviews.map((r: { orderId: string }) => r.orderId)).toContain(loose);
  });

  test('본인에게도 실명과 숨김 사유는 나가지 않는다', async ({ page }) => {
    await loginAs(page, freshCode());
    const phone = freshPhone();
    const id = await paidOrder(page.request, phone, '홍길동');
    await page.request.post('/api/account/claim', { data: { orderId: id, phone } });
    const created = await page.request.post('/api/reviews', {
      data: { orderId: id, phone, rating: 3, body: '실명이 응답에 실리면 안 됩니다.' },
    });
    const { review } = await created.json();

    await page.request.patch(`/api/admin/reviews/${review.id}`, {
      headers: AUTH,
      data: { status: 'hidden', reason: '내부 기록용 사유' },
    });

    const text = await (await page.request.get('/api/account/reviews')).text();
    expect(text, '실명이 새 나갔습니다').not.toContain('홍길동');
    expect(text, '숨김 사유가 새 나갔습니다').not.toContain('내부 기록용 사유');
    expect(text, '숨겨진 것은 본인에게 알려야 합니다').toContain('hidden');
  });
});

test.describe('로그인하면 주문번호만으로 후기를 쓴다', () => {
  test('연락처 없이도 내 주문이면 쓸 수 있다', async ({ page }) => {
    // 마이페이지가 이미 그 주문을 보여주고 있는데 연락처를 다시 물을 이유가
    // 없습니다. 소유는 세션으로 확인합니다.
    await loginAs(page, freshCode());
    const phone = freshPhone();
    const id = await paidOrder(page.request, phone);
    await page.request.post('/api/account/claim', { data: { orderId: id, phone } });

    const res = await page.request.post('/api/reviews', {
      data: { orderId: id, rating: 5, body: '연락처 없이 세션으로 확인한 후기입니다.' },
    });
    expect(res.status(), await res.text()).toBe(201);
  });

  test('로그인해도 남의 주문에는 못 쓴다', async ({ page, browser }) => {
    const phone = freshPhone();
    const someoneElse = await browser.newContext();
    const otherPage = await someoneElse.newPage();
    await loginAs(otherPage, freshCode());
    const theirOrder = await paidOrder(otherPage.request, phone);
    await otherPage.request.post('/api/account/claim', { data: { orderId: theirOrder, phone } });
    await someoneElse.close();

    await loginAs(page, freshCode());
    const res = await page.request.post('/api/reviews', {
      data: { orderId: theirOrder, rating: 5, body: '남의 주문에 후기를 쓰려는 시도입니다.' },
    });
    // 없는 주문과 남의 주문을 같은 응답으로 — 주문번호 존재 여부를 알려주지 않습니다.
    expect(res.status()).toBe(404);
  });

  test('로그인하지 않으면 연락처가 여전히 필요하다', async ({ request }) => {
    // 비로그인 경로의 판정은 글자 하나 바뀌지 않아야 합니다.
    const phone = freshPhone();
    const id = await paidOrder(request, phone);
    const res = await request.post('/api/reviews', {
      data: { orderId: id, rating: 5, body: '연락처 없이 비로그인으로 쓰려는 시도입니다.' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('MISSING_FIELDS');
  });
});

test.describe('마이페이지 화면', () => {
  test('후기가 없으면 없다고 말한다', async ({ page }) => {
    await loginAs(page, freshCode());
    await page.goto('/ko/account');
    const section = page.locator('[data-my-reviews]');
    await expect(section).toBeVisible();
    await expect(section.locator('[data-my-reviews-state]')).toContainText('아직');
  });

  test('쓴 후기와 안 쓴 주문이 화면에 나온다', async ({ page }) => {
    await loginAs(page, freshCode());
    const phone = freshPhone();
    const reviewed = await paidOrder(page.request, phone);
    const notYet = await paidOrder(page.request, phone);
    for (const id of [reviewed, notYet]) {
      await page.request.post('/api/account/claim', { data: { orderId: id, phone } });
    }
    await page.request.post('/api/reviews', {
      data: { orderId: reviewed, phone, rating: 5, body: '화면에 보여야 하는 후기 본문입니다.' },
    });

    await page.goto('/ko/account');
    const section = page.locator('[data-my-reviews]');
    await expect(section.locator('.myReviews__body').first()).toContainText('화면에 보여야');
    await expect(section.locator('[data-my-reviews-pending]')).toBeVisible();
    await expect(section.locator('.myReviews__write').first()).toBeVisible();
  });

  test('후기 본문이 HTML 로 실행되지 않는다', async ({ page }) => {
    await loginAs(page, freshCode());
    const phone = freshPhone();
    const id = await paidOrder(page.request, phone);
    await page.request.post('/api/account/claim', { data: { orderId: id, phone } });
    await page.request.post('/api/reviews', {
      data: { orderId: id, phone, rating: 1, body: '<img src=x onerror=alert(1)> 실행되면 안 됩니다.' },
    });

    await page.goto('/ko/account');
    const section = page.locator('[data-my-reviews]');
    await expect(section.locator('.myReviews__body').first()).toContainText('<img');
    await expect(section.locator('.myReviews__body img')).toHaveCount(0);
  });

  test('안 쓴 주문이 없으면 그 구획이 통째로 없다', async ({ page }) => {
    // 빈 제목만 남기지 않습니다.
    await loginAs(page, freshCode());
    await page.goto('/ko/account');
    await expect(page.locator('[data-my-reviews-pending]')).toBeHidden();
  });

  test('로그인 없이 쓴 후기가 안 보이는 이유를 밝힌다', async ({ page }) => {
    // 이 문장이 없으면 "후기를 썼는데 없어졌다" 는 문의가 옵니다.
    await loginAs(page, freshCode());
    await page.goto('/ko/account');
    await expect(page.locator('[data-my-reviews] .cart__notice')).toContainText('로그인');
  });
});
