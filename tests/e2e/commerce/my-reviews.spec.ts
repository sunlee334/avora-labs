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
    await expect(page.locator('[data-my-reviews-note]')).toContainText('로그인');
  });
});

test.describe('내 후기 고치기·삭제', () => {
  /** 후기 하나를 만들고 그 id 를 돌려줍니다. */
  async function ownReview(page: Page): Promise<{ id: string; orderId: string; phone: string }> {
    const phone = freshPhone();
    const orderIdValue = await paidOrder(page.request, phone);
    await page.request.post('/api/account/claim', { data: { orderId: orderIdValue, phone } });
    const created = await page.request.post('/api/reviews', {
      data: { orderId: orderIdValue, phone, rating: 3, body: '처음 쓴 후기 본문입니다.' },
    });
    expect(created.status()).toBe(201);
    const list = await (await page.request.get('/api/account/reviews')).json();
    const mine = list.reviews.find((r: { orderId: string }) => r.orderId === orderIdValue);
    return { id: mine.id, orderId: orderIdValue, phone };
  }

  test('본문과 별점을 고칠 수 있다', async ({ page }) => {
    await loginAs(page, freshCode());
    const { id } = await ownReview(page);

    const res = await page.request.patch(`/api/account/reviews/${id}`, {
      data: { rating: 5, body: '마음이 바뀌어 고친 후기 본문입니다.' },
    });
    expect(res.status(), await res.text()).toBe(200);

    const after = await (await page.request.get('/api/account/reviews')).json();
    const mine = after.reviews.find((r: { id: string }) => r.id === id);
    expect(mine.rating).toBe(5);
    expect(mine.body).toContain('마음이 바뀌어');
  });

  test('고칠 때도 작성과 같은 검사를 받는다', async ({ page }) => {
    // 고칠 때만 느슨하면 그 길로 들어옵니다.
    await loginAs(page, freshCode());
    const { id } = await ownReview(page);

    const short = await page.request.patch(`/api/account/reviews/${id}`, {
      data: { rating: 5, body: '짧음' },
    });
    expect(short.status()).toBe(400);
    expect((await short.json()).error).toBe('BODY_TOO_SHORT');

    const bad = await page.request.patch(`/api/account/reviews/${id}`, {
      data: { rating: 9, body: '별점 범위를 벗어난 값으로 고치려는 시도입니다.' },
    });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toBe('INVALID_RATING');
  });

  test('삭제하면 공개 목록에서 사라진다', async ({ page, request }) => {
    await loginAs(page, freshCode());
    const { id } = await ownReview(page);

    const before = await (await request.get('/api/reviews?limit=50')).json();
    expect(before.reviews.some((r: { id: string }) => r.id === id)).toBe(true);

    const res = await page.request.delete(`/api/account/reviews/${id}`);
    expect(res.status()).toBe(200);

    const after = await (await request.get('/api/reviews?limit=50')).json();
    expect(after.reviews.some((r: { id: string }) => r.id === id), '공개 목록에 남아 있습니다').toBe(
      false,
    );
  });

  test('삭제한 주문은 다시 쓸 수 있는 목록으로 돌아온다', async ({ page }) => {
    // 한 번 지운 사람이 영영 후기를 못 쓰면 그것은 삭제가 아니라 박탈입니다.
    await loginAs(page, freshCode());
    const { id, orderId: order } = await ownReview(page);
    await page.request.delete(`/api/account/reviews/${id}`);

    const after = await (await page.request.get('/api/account/reviews')).json();
    expect(after.reviews.some((r: { id: string }) => r.id === id)).toBe(false);
    expect(
      after.pending.some((o: { orderId: string }) => o.orderId === order),
      '삭제한 주문이 다시 쓸 수 있는 목록에 없습니다',
    ).toBe(true);
  });

  test('삭제한 주문에 다시 쓰면 UNIQUE 에 걸리지 않는다', async ({ page }) => {
    // idx_reviews_order 가 주문 하나에 후기 하나를 강제하므로, 지운 뒤
    // 새로 INSERT 하면 걸립니다. 같은 행을 되살려야 합니다.
    await loginAs(page, freshCode());
    const { id, orderId: order, phone } = await ownReview(page);
    await page.request.delete(`/api/account/reviews/${id}`);

    const again = await page.request.post('/api/reviews', {
      data: { orderId: order, phone, rating: 4, body: '지웠다가 다시 쓴 후기 본문입니다.' },
    });
    expect(again.status(), await again.text()).toBe(201);

    const after = await (await page.request.get('/api/account/reviews')).json();
    const mine = after.reviews.find((r: { orderId: string }) => r.orderId === order);
    expect(mine.body).toContain('다시 쓴');
  });

  test('관리자가 내린 후기는 본인도 되살릴 수 없다', async ({ page }) => {
    // 이 파일에서 가장 중요한 단언입니다. 본인이 고쳐 다시 보이게 하거나
    // 지워 없앨 수 있으면, 조정의 근거가 사라집니다.
    await loginAs(page, freshCode());
    const { id } = await ownReview(page);
    await page.request.patch(`/api/admin/reviews/${id}`, {
      headers: AUTH,
      data: { status: 'hidden', reason: '광고성 내용' },
    });

    const edit = await page.request.patch(`/api/account/reviews/${id}`, {
      data: { rating: 5, body: '조정을 지우려는 시도입니다. 막혀야 합니다.' },
    });
    expect(edit.status(), '관리자 조정을 본인이 되돌렸습니다').toBe(409);
    expect((await edit.json()).error).toBe('MODERATED');

    const del = await page.request.delete(`/api/account/reviews/${id}`);
    expect(del.status(), '관리자가 내린 후기를 본인이 지웠습니다').toBe(409);

    // 그리고 실제로 그대로여야 합니다.
    const after = await (await page.request.get('/api/account/reviews')).json();
    const mine = after.reviews.find((r: { id: string }) => r.id === id);
    expect(mine.status).toBe('hidden');
    expect(mine.body).toContain('처음 쓴');
  });

  test('남의 후기는 고칠 수도 지울 수도 없다', async ({ page, browser }) => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await loginAs(otherPage, freshCode());
    const { id } = await ownReview(otherPage);
    await other.close();

    await loginAs(page, freshCode());
    const edit = await page.request.patch(`/api/account/reviews/${id}`, {
      data: { rating: 1, body: '남의 후기를 고치려는 시도입니다.' },
    });
    // 없는 것과 남의 것을 같은 응답으로 — 후기 번호 존재 여부를 알려주지 않습니다.
    expect(edit.status()).toBe(404);
    expect((await page.request.delete(`/api/account/reviews/${id}`)).status()).toBe(404);
  });

  test('로그인하지 않으면 아예 못 부른다', async ({ request }) => {
    const res = await request.patch('/api/account/reviews/REVIEW-20260101000000-AAAAAA', {
      data: { rating: 5, body: '로그인 없이 고치려는 시도입니다.' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('화면에서 고치고 지운다', () => {
  test('고치기를 누르면 폼이 열리고 저장하면 반영된다', async ({ page }) => {
    await loginAs(page, freshCode());
    const phone = freshPhone();
    const order = await paidOrder(page.request, phone);
    await page.request.post('/api/account/claim', { data: { orderId: order, phone } });
    await page.request.post('/api/reviews', {
      data: { orderId: order, phone, rating: 2, body: '화면에서 고칠 후기 본문입니다.' },
    });

    await page.goto('/ko/account');
    await page.locator('[data-my-reviews] [data-edit]').first().click();
    const form = page.locator('[data-edit-form]');
    await expect(form).toBeVisible();

    await form.locator('textarea').fill('화면에서 고친 뒤의 후기 본문입니다.');
    await form.locator('input[type="radio"][value="5"]').check();
    await form.locator('button[type="submit"]').click();

    await expect(page.locator('[data-my-reviews] .myReviews__body').first()).toContainText(
      '고친 뒤의',
    );
  });

  test('관리자가 내린 후기에는 버튼이 아예 없다', async ({ page }) => {
    // 눌러 봐야 거절당할 버튼을 보여주는 것은 없는 것만 못합니다.
    await loginAs(page, freshCode());
    const phone = freshPhone();
    const order = await paidOrder(page.request, phone);
    await page.request.post('/api/account/claim', { data: { orderId: order, phone } });
    const created = await page.request.post('/api/reviews', {
      data: { orderId: order, phone, rating: 1, body: '관리자가 내릴 후기 본문입니다.' },
    });
    const { review } = await created.json();
    await page.request.patch(`/api/admin/reviews/${review.id}`, {
      headers: AUTH,
      data: { status: 'hidden', reason: '검사용' },
    });

    await page.goto('/ko/account');
    const item = page.locator('[data-my-reviews] .myReviews__item').first();
    await expect(item.locator('.myReviews__locked')).toBeVisible();
    await expect(item.locator('[data-edit]')).toHaveCount(0);
    await expect(item.locator('[data-remove]')).toHaveCount(0);
  });
});

test.describe('관리 화면 후기 탭', () => {
  test.use({ extraHTTPHeaders: { 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN } });

  /** 후기 하나를 만들고 id 를 돌려줍니다. 관리 화면은 남의 후기도 봅니다. */
  async function someReview(page: Page): Promise<string> {
    const phone = freshPhone();
    const order = await paidOrder(page.request, phone, '관리시험');
    const created = await page.request.post('/api/reviews', {
      data: { orderId: order, phone, rating: 2, body: '관리 화면에서 볼 후기 본문입니다.' },
    });
    expect(created.status()).toBe(201);
    return (await created.json()).review.id;
  }

  test('탭이 있고 목록이 그려진다', async ({ page }) => {
    await someReview(page);
    await page.goto('/admin');
    await page.locator('[data-tab="reviews"]').click();
    await expect(page.locator('[data-panel="reviews"]')).toBeVisible();
    await expect(page.locator('[data-rv-rows] tr').first()).toBeVisible();
  });

  test('행을 누르면 상세가 열리고 전체 본문이 보인다', async ({ page }) => {
    await someReview(page);
    await page.goto('/admin');
    await page.locator('[data-tab="reviews"]').click();
    await page.locator('[data-rv-rows] tr').first().click();
    await expect(page.locator('[data-rv-detail]')).toBeVisible();
    await expect(page.locator('[data-rv-d-body]')).toContainText('관리 화면에서 볼');
  });

  test('이유 없이 숨길 수 없다', async ({ page }) => {
    // 기준 없이 숨긴 기록이 없으면, 부정적 후기만 골라 숨겼는지 나중에
    // 아무도 증명할 수 없습니다.
    await someReview(page);
    await page.goto('/admin');
    await page.locator('[data-tab="reviews"]').click();
    await page.locator('[data-rv-rows] tr').first().click();
    await page.locator('[data-rv-hide]').click();
    await expect(page.locator('[data-rv-error]')).toBeVisible();
    await expect(page.locator('[data-rv-error]')).toContainText('이유');
  });

  test('이유를 적으면 숨겨지고 공개 목록에서 빠진다', async ({ page, request }) => {
    const id = await someReview(page);
    await page.goto('/admin');
    await page.locator('[data-tab="reviews"]').click();
    await page.locator(`[data-rv-row="${id}"]`).click();
    await page.locator('#rv-reason').fill('제품과 무관한 내용');
    await page.locator('[data-rv-hide]').click();
    await expect(page.locator('[data-rv-detail]')).toBeHidden();

    const publicList = await (await request.get('/api/reviews?limit=50')).json();
    expect(publicList.reviews.some((r: { id: string }) => r.id === id)).toBe(false);
  });

  test('작성자가 내린 후기는 관리자도 되살릴 수 없다', async ({ page, browser }) => {
    // updateOwnReview 가 막는 것(본인이 관리자 조정을 되돌리는 것)의 짝입니다.
    const owner = await browser.newContext();
    const ownerPage = await owner.newPage();
    await loginAs(ownerPage, freshCode());
    const phone = freshPhone();
    const order = await paidOrder(ownerPage.request, phone);
    await ownerPage.request.post('/api/account/claim', { data: { orderId: order, phone } });
    const created = await ownerPage.request.post('/api/reviews', {
      data: { orderId: order, phone, rating: 1, body: '작성자가 곧 내릴 후기입니다.' },
    });
    const id = (await created.json()).review.id;
    await ownerPage.request.delete(`/api/account/reviews/${id}`);
    await owner.close();

    const res = await page.request.patch(`/api/admin/reviews/${id}`, {
      data: { status: 'visible' },
    });
    expect(res.status(), '지운 후기를 관리자가 되살렸습니다').toBe(409);
    expect((await res.json()).error).toBe('AUTHOR_REMOVED');
  });

  test('작성자가 내린 후기에는 상태 폼이 안 보인다', async ({ page, browser }) => {
    const owner = await browser.newContext();
    const ownerPage = await owner.newPage();
    await loginAs(ownerPage, freshCode());
    const phone = freshPhone();
    const order = await paidOrder(ownerPage.request, phone);
    await ownerPage.request.post('/api/account/claim', { data: { orderId: order, phone } });
    const created = await ownerPage.request.post('/api/reviews', {
      data: { orderId: order, phone, rating: 1, body: '폼이 감춰져야 하는 후기입니다.' },
    });
    const id = (await created.json()).review.id;
    await ownerPage.request.delete(`/api/account/reviews/${id}`);
    await owner.close();

    await page.goto('/admin');
    await page.locator('[data-tab="reviews"]').click();
    await page.locator('#rv-status').selectOption('removed');
    await page.locator('[data-rv-filters] button[type="submit"]').click();
    await page.locator(`[data-rv-row="${id}"]`).click();
    await expect(page.locator('[data-rv-removed]')).toBeVisible();
    await expect(page.locator('[data-rv-form]')).toBeHidden();
  });

  test('후기 본문이 관리 화면에서 실행되지 않는다', async ({ page }) => {
    // 이 화면은 Access 뒤에 있지만, innerHTML 로 넣으면 손님의 <script> 가
    // 관리자 세션에서 실행됩니다.
    const phone = freshPhone();
    const order = await paidOrder(page.request, phone);
    await page.request.post('/api/reviews', {
      data: { orderId: order, phone, rating: 1, body: '<img src=x onerror=alert(1)> 실행 금지' },
    });

    await page.goto('/admin');
    await page.locator('[data-tab="reviews"]').click();
    await expect(page.locator('[data-rv-rows]')).toContainText('<img');
    await expect(page.locator('[data-rv-rows] img')).toHaveCount(0);
  });
});
