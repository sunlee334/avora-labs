import { test, expect } from '@playwright/test';

/**
 * 1차(launch) 모드 — 구매 버튼이 외부몰로 가고 자사 결제는 닫혀 있어야 합니다.
 * Round 15 에서 정한 "10월은 브랜드사이트, 결제는 2차" 상태가 실제로 그런지 확인합니다.
 */

test.describe('1차 오픈 상태', () => {
  test('제품 페이지에 장바구니 담기 버튼이 없다', async ({ page }) => {
    await page.goto('/ko/product');
    await expect(page.locator('[data-add-to-cart]')).toHaveCount(0);
  });

  test('헤더에 장바구니 링크 자체가 없다', async ({ page }) => {
    // 담을 수 없는 장바구니로 가는 링크를 헤더에 두면 막다른 길이 됩니다.
    await page.goto('/ko/');
    await expect(page.locator('[data-nav-cart]')).toHaveCount(0);
  });

  test('제품 페이지 구조화 데이터에 offers 가 없다', async ({ request }) => {
    // 가격이 없는 상태에서 offers 를 내보내면 검색엔진에 잘못된 사실을 줍니다.
    const html = await (await request.get('/ko/product')).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)];
    const product = blocks.map((m) => JSON.parse(m[1])).find((s) => s['@type'] === 'Product');
    expect(product.offers).toBeUndefined();
  });

  test('체크아웃 페이지는 결제 준비 안내만 보여준다', async ({ page }) => {
    await page.goto('/ko/checkout');
    await expect(page.locator('[data-checkout]')).toHaveCount(0);
    await expect(page.locator('.cart__notice')).toBeVisible();
  });

  test('가격이 없으면 가격을 지어내지 않고 할 일을 준다', async ({ page }) => {
    // 예전에는 이 자리에 눌리지 않는 회색 글자("가격 확정 예정")가 있었습니다.
    // 제품이 2027년 상반기에 나오는데 그때까지 관심이 생긴 사람이 남길 수
    // 있는 것이 아무것도 없었습니다. 지금은 출시 시기를 밝히고 알림을 받습니다.
    await page.goto('/ko/product');
    await expect(page.locator('.product-hero__price')).toHaveCount(0);
    await expect(page.locator('.product-hero__window')).toContainText('2027');
    await expect(page.locator('[data-launch-notify]')).toBeVisible();
  });

  test('장바구니 페이지는 색인되지 않는다', async ({ request }) => {
    const html = await (await request.get('/ko/cart')).text();
    expect(html).toContain('noindex');
  });
});

test.describe('결제 엔드포인트 (PG 미설정)', () => {
  test('PG 가 설정되지 않았으면 503 과 이유를 돌려준다', async ({ request }) => {
    const res = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'test_key', orderId: 'AVORA-20261025000000-ABCDEF', amount: 32000 },
    });
    expect(res.status()).toBe(503);
    expect((await res.json()).error).toBe('PAYMENT_NOT_CONFIGURED');
  });

  test('GET 은 405', async ({ request }) => {
    const res = await request.get('/api/payments/confirm');
    expect(res.status()).toBe(405);
  });
});
