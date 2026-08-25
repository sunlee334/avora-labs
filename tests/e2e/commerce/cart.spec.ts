import { test, expect } from '@playwright/test';

/**
 * 장바구니 — 브라우저에만 사는 상태라 새로고침·탭 이동을 견디는지가 관심사입니다.
 */

test.describe('장바구니', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ko/');
    await page.evaluate(() => localStorage.clear());
  });

  test('담기 → 토스트 → 헤더 배지', async ({ page }) => {
    await page.goto('/ko/product');
    await expect(page.locator('[data-nav-cart-count]')).toHaveAttribute('data-has-items', 'false');

    await page.locator('[data-add-to-cart]').click();

    await expect(page.locator('[data-toast]')).toHaveAttribute('data-open', 'true');
    await expect(page.locator('[data-nav-cart-count]')).toHaveAttribute('data-has-items', 'true');
    await expect(page.locator('[data-nav-cart-count]')).toHaveText('1');
  });

  test('새로고침해도 담은 것이 남는다', async ({ page }) => {
    await page.goto('/ko/product');
    await page.locator('[data-add-to-cart]').click();
    await expect(page.locator('[data-nav-cart-count]')).toHaveText('1');

    await page.reload();
    await expect(page.locator('[data-nav-cart-count]')).toHaveText('1');
  });

  test('수량을 늘리면 합계가 따라 바뀐다', async ({ page }) => {
    await page.goto('/ko/product');
    await page.locator('[data-add-to-cart]').click();
    await page.goto('/ko/cart');

    await expect(page.locator('[data-cart-total]')).toHaveText('₩32,000');
    await page.locator('.cart__line [data-inc]').click();
    await expect(page.locator('[data-cart-total]')).toHaveText('₩64,000');
    await page.locator('.cart__line [data-dec]').click();
    await expect(page.locator('[data-cart-total]')).toHaveText('₩32,000');
  });

  test('배송비 정책이 화면에 반영된다', async ({ page }) => {
    await page.goto('/ko/product');
    await page.locator('[data-add-to-cart]').click();
    await page.goto('/ko/cart');
    // commerce.json 의 기본 정책은 전국 무료입니다.
    await expect(page.locator('[data-cart-shipping]')).toHaveText('무료');
  });

  test('수량 상한을 넘기면 + 버튼이 잠긴다', async ({ page }) => {
    await page.goto('/ko/product');
    await page.locator('[data-add-to-cart]').click();
    await page.goto('/ko/cart');

    const inc = page.locator('.cart__line [data-inc]');
    for (let i = 0; i < 9; i++) await inc.click();
    await expect(page.locator('.cart__line output')).toHaveText('10');
    await expect(inc).toBeDisabled();
  });

  test('삭제하면 빈 상태로 돌아간다', async ({ page }) => {
    await page.goto('/ko/product');
    await page.locator('[data-add-to-cart]').click();
    await page.goto('/ko/cart');

    await page.locator('.cart__line [data-remove]').click();
    await expect(page.locator('[data-cart-empty]')).toBeVisible();
    await expect(page.locator('[data-nav-cart-count]')).toHaveAttribute('data-has-items', 'false');
  });

  test('손상된 저장값이 있어도 죽지 않는다', async ({ page }) => {
    await page.goto('/ko/');
    await page.evaluate(() => localStorage.setItem('avora.cart.v1', '{"not":"an array"}'));
    await page.goto('/ko/cart');
    await expect(page.locator('[data-cart-empty]')).toBeVisible();
  });

  test('모르는 상품 id 는 무시한다', async ({ page }) => {
    await page.goto('/ko/');
    await page.evaluate(() =>
      localStorage.setItem('avora.cart.v1', JSON.stringify([{ id: 'ghost-product', qty: 3 }])),
    );
    await page.goto('/ko/cart');
    await expect(page.locator('[data-cart-empty]')).toBeVisible();
  });
});
