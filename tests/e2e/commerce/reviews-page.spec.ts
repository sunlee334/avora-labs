import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN_DEV_TOKEN } from '../../../playwright.config';

/**
 * 리뷰 페이지.
 *
 * 여기서 가장 중요한 두 가지입니다.
 *
 *   1. 후기가 **초기 HTML 에 들어 있는가** — 자바스크립트로만 채우면
 *      답변엔진과 크롤러가 보지 못하고, 리뷰 페이지의 값어치는 대부분
 *      거기서 나옵니다.
 *   2. 후기 본문이 **HTML 로 실행되지 않는가** — 손님이 쓴 글을 서버에서
 *      HTML 에 넣으므로, 저장형 XSS 의 자리입니다. 관리 화면에서 같은
 *      실수를 한 적이 있어(수령인 이름을 innerHTML 로 넣음) 여기서는
 *      처음부터 시험합니다.
 */

const AUTH = { 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN };
const UNIT_PRICE = 32000;
const PHONE = '010-7777-8888';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

let seq = 0;
function nextOrderId(): string {
  seq += 1;
  const stamp = `2026082613${String(seq).padStart(4, '0')}`;
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `AVORA-${stamp}-${suffix}`;
}

async function seedReview(
  request: APIRequestContext,
  rating: number,
  body: string,
  name = '박후기',
): Promise<string> {
  const orderId = nextOrderId();
  await request.post('/api/orders', {
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
  await request.post('/api/payments/confirm', {
    data: { orderId, paymentKey: `mock-${orderId}`, amount: UNIT_PRICE },
  });
  const res = await request.post('/api/reviews', {
    data: { orderId, phone: PHONE, rating, body },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).review.id;
}

test.describe('후기가 초기 HTML 에 들어 있다', () => {
  test('자바스크립트 없이 받은 문서에 후기 본문이 있다', async ({ request }) => {
    const body = `초기 HTML 확인용 후기 ${Date.now()}`;
    await seedReview(request, 5, body);

    // fetch 로 받은 원문입니다 — 브라우저가 스크립트를 돌리기 전의 상태.
    const html = await (await request.get('/ko/reviews')).text();
    expect(html, '후기 본문이 초기 HTML 에 없습니다').toContain(body);
  });

  test('별점 요약도 서버가 그린다', async ({ request }) => {
    await seedReview(request, 4, '요약 확인용 후기입니다. 가볍고 좋습니다.');
    const html = await (await request.get('/ko/reviews')).text();
    expect(html).toContain('reviews__summary');
    expect(html).toContain('reviews__bar-fill');
  });

  test('구매 확인 표시가 붙는다', async ({ request }) => {
    await seedReview(request, 5, '구매 확인 표시 검사용 후기입니다.');
    const html = await (await request.get('/ko/reviews')).text();
    expect(html).toContain('구매 확인');
  });

  test('5개 언어 모두 열린다', async ({ request }) => {
    for (const lang of ['ko', 'en', 'zh', 'th', 'vi']) {
      const res = await request.get(`/${lang}/reviews`);
      expect(res.status(), `${lang}`).toBe(200);
    }
  });
});

test.describe('후기 본문은 HTML 로 실행되지 않는다', () => {
  test('스크립트 태그가 담긴 후기가 실행되지 않는다', async ({ page, request }) => {
    const marker = `xss-${Date.now()}`;
    await seedReview(
      request,
      5,
      `<img src=x onerror="window.__pwned=1"><script>window.__pwned=1<\/script> ${marker}`,
    );

    await page.goto('/ko/reviews');
    await expect(page.locator('.reviews__list')).toBeVisible();
    // 글자로는 보여야 합니다 — 지워버리면 후기가 왜곡됩니다.
    await expect(page.locator('.reviews__list')).toContainText(marker);
    expect(await page.evaluate(() => (window as never as { __pwned?: number }).__pwned)).toBeUndefined();
  });

  test('꺾쇠가 이스케이프되어 나간다', async ({ request }) => {
    const body = `부등호 시험 <b>굵게</b> & "따옴표" ${Date.now()}`;
    await seedReview(request, 4, body);
    const html = await (await request.get('/ko/reviews')).text();
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>굵게</b>');
  });

  test('이름에 담긴 HTML 도 실행되지 않는다', async ({ page, request }) => {
    await seedReview(request, 5, `이름 XSS 검사용 후기 ${Date.now()}`, '<img src=x onerror="window.__pwnedName=1">');
    await page.goto('/ko/reviews');
    await expect(page.locator('.reviews__list')).toBeVisible();
    expect(
      await page.evaluate(() => (window as never as { __pwnedName?: number }).__pwnedName),
    ).toBeUndefined();
  });
});

test.describe('답변엔진에 내보내는 것', () => {
  async function aggregate(request: APIRequestContext) {
    const html = await (await request.get('/ko/reviews')).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
    return blocks.map((m) => JSON.parse(m[1])).find((s) => s.aggregateRating);
  }

  test('후기가 있으면 AggregateRating 이 나간다', async ({ request }) => {
    await seedReview(request, 5, '구조화 데이터 확인용 후기입니다. 아주 만족합니다.');
    const schema = await aggregate(request);
    expect(schema, 'AggregateRating 이 없습니다').toBeTruthy();
    expect(schema.aggregateRating.reviewCount).toBeGreaterThan(0);
    expect(schema.aggregateRating.ratingValue).toBeGreaterThan(0);
    expect(schema.aggregateRating.ratingValue).toBeLessThanOrEqual(5);
  });

  test('구조화 데이터가 같은 문서의 화면 숫자와 맞는다', async ({ request }) => {
    // 두 번 나눠 받으면 그 사이에 다른 테스트가 후기를 넣어 숫자가 어긋납니다.
    // **한 문서 안에서** 화면에 그려진 값과 스키마 값을 맞춰 봅니다 —
    // 사람이 보는 숫자와 답변엔진이 읽는 숫자가 다르면 그게 진짜 결함입니다.
    await seedReview(request, 3, '개수 대조 확인용 후기입니다. 무난합니다.');
    const html = await (await request.get('/ko/reviews')).text();

    const schema = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
      .map((m) => JSON.parse(m[1]))
      .find((s) => s.aggregateRating);
    expect(schema, 'AggregateRating 이 없습니다').toBeTruthy();

    const shownCount = Number(html.match(/class="reviews__count">(\d+)/)?.[1]);
    const shownAverage = Number(html.match(/class="reviews__average"><strong>([\d.]+)/)?.[1]);

    expect(schema.aggregateRating.reviewCount, '화면 개수와 스키마 개수').toBe(shownCount);
    expect(schema.aggregateRating.ratingValue, '화면 평균과 스키마 평균').toBe(shownAverage);
  });

  test('숨긴 후기는 구조화 데이터에도 없다', async ({ request }) => {
    const body = `숨김 후 스키마 확인 ${Date.now()}`;
    const reviewId = await seedReview(request, 1, body);
    await request.patch(`/api/admin/reviews/${reviewId}`, {
      headers: AUTH,
      data: { status: 'hidden', reason: '검사용' },
    });

    const schema = await aggregate(request);
    expect(JSON.stringify(schema)).not.toContain(body);
  });

  test('실명은 구조화 데이터에도 나가지 않는다', async ({ request }) => {
    await seedReview(request, 5, `실명 확인용 후기 ${Date.now()}`, '정후기');
    const schema = await aggregate(request);
    expect(JSON.stringify(schema)).not.toContain('정후기');
  });
});

test.describe('숨긴 후기는 화면에서 사라진다', () => {
  test('숨기면 페이지에 더 이상 없다', async ({ request }) => {
    const body = `숨김 시험 본문 ${Date.now()}`;
    const reviewId = await seedReview(request, 2, body);

    const before = await (await request.get('/ko/reviews')).text();
    expect(before).toContain(body);

    await request.patch(`/api/admin/reviews/${reviewId}`, {
      headers: AUTH,
      data: { status: 'hidden', reason: '개인정보 노출' },
    });

    const after = await (await request.get('/ko/reviews')).text();
    expect(after).not.toContain(body);
  });
});
