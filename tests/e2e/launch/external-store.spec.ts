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

  test('헤더에 장바구니 배지가 표시되지 않는다', async ({ page }) => {
    await page.goto('/ko/');
    const badge = page.locator('[data-nav-cart-count]');
    await expect(badge).toHaveAttribute('data-has-items', 'false');
  });

  test('체크아웃 페이지는 결제 준비 안내만 보여준다', async ({ page }) => {
    await page.goto('/ko/checkout');
    await expect(page.locator('[data-checkout]')).toHaveCount(0);
    await expect(page.locator('.cart__notice')).toBeVisible();
  });

  test('가격이 없으면 제품 페이지에 가격 확정 예정으로 표시된다', async ({ page }) => {
    await page.goto('/ko/product');
    await expect(page.locator('.product-hero__price')).toContainText('가격 확정 예정');
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
