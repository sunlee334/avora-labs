import { test, expect, type Page } from '@playwright/test';

/**
 * 체크아웃 — 모바일 폼 UX 와 검증이 관심사입니다.
 * 결제 승인 자체는 orders-api.spec.ts 가 서버 쪽에서 확인합니다.
 */

async function fillCart(page: Page) {
  await page.goto('/ko/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/ko/product');
  await page.locator('[data-add-to-cart]').click();
  await page.goto('/ko/checkout');
}

test.describe('체크아웃', () => {
  test('장바구니가 비어 있으면 안내만 보인다', async ({ page }) => {
    await page.goto('/ko/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/ko/checkout');
    await expect(page.locator('[data-checkout-empty]')).toBeVisible();
    await expect(page.locator('[data-checkout-body]')).toBeHidden();
  });

  test('주문 요약이 장바구니와 일치한다', async ({ page }) => {
    await fillCart(page);
    await expect(page.locator('[data-checkout-lines] li')).toHaveCount(1);
    await expect(page.locator('[data-sum-total]')).toHaveText('₩32,000');
  });

  test('빈 폼으로 제출하면 필수 항목마다 오류가 붙는다', async ({ page }) => {
    await fillCart(page);
    await page.locator('[data-pay]').click();

    for (const name of ['recipientName', 'recipientPhone', 'postalCode', 'address1']) {
      await expect(page.locator(`[data-error-for="${name}"]`)).toBeVisible();
      await expect(page.locator(`[name="${name}"]`)).toHaveAttribute('aria-invalid', 'true');
    }
    // 제출로 페이지가 넘어가지 않아야 합니다.
    await expect(page).toHaveURL(/\/checkout\/?$/);
  });

  test('동의하지 않으면 진행되지 않는다', async ({ page }) => {
    await fillCart(page);
    await page.fill('[name="recipientName"]', '홍길동');
    await page.fill('[name="recipientPhone"]', '01012345678');
    await page.fill('[name="postalCode"]', '04524');
    await page.fill('[name="address1"]', '서울 중구 세종대로 110');
    await page.locator('[data-pay]').click();

    await expect(page.locator('[data-error-for="agree"]')).toBeVisible();
    await expect(page).toHaveURL(/\/checkout\/?$/);
  });

  test('형식이 잘못된 연락처·우편번호·이메일을 잡는다', async ({ page }) => {
    await fillCart(page);
    await page.fill('[name="recipientName"]', '홍길동');
    await page.fill('[name="recipientPhone"]', '123');
    await page.fill('[name="postalCode"]', 'abc');
    await page.fill('[name="address1"]', '서울');
    await page.fill('[name="email"]', 'not-an-email');
    await page.check('[name="agree"]');
    await page.locator('[data-pay]').click();

    await expect(page.locator('[data-error-for="recipientPhone"]')).toBeVisible();
    await expect(page.locator('[data-error-for="postalCode"]')).toBeVisible();
    await expect(page.locator('[data-error-for="email"]')).toBeVisible();
  });

  test('고치면 오류 표시가 즉시 사라진다', async ({ page }) => {
    await fillCart(page);
    await page.locator('[data-pay]').click();
    await expect(page.locator('[data-error-for="recipientName"]')).toBeVisible();

    await page.fill('[name="recipientName"]', '홍길동');
    await expect(page.locator('[data-error-for="recipientName"]')).toBeHidden();
  });

  test('모바일 키보드 타입이 지정돼 있다', async ({ page }) => {
    await fillCart(page);
    await expect(page.locator('[name="recipientPhone"]')).toHaveAttribute('inputmode', 'tel');
    await expect(page.locator('[name="postalCode"]')).toHaveAttribute('inputmode', 'numeric');
    await expect(page.locator('[name="email"]')).toHaveAttribute('inputmode', 'email');
  });

  test('입력 글자 크기가 16px 이상이다 (iOS 확대 방지)', async ({ page }) => {
    await fillCart(page);
    const size = await page
      .locator('[name="recipientName"]')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test('올바르게 채우면 주문이 접수되고 완료 페이지로 간다', async ({ page }) => {
    await fillCart(page);
    await page.fill('[name="recipientName"]', '홍길동');
    await page.fill('[name="recipientPhone"]', '010-1234-5678');
    await page.fill('[name="postalCode"]', '04524');
    await page.fill('[name="address1"]', '서울 중구 세종대로 110');
    await page.fill('[name="address2"]', '5층');
    await page.check('[name="agree"]');

    await page.locator('[data-pay]').click();

    await expect(page).toHaveURL(/\/order\/complete\/?\?orderId=AVORA-/);
    await expect(page.locator('[data-fact-id]')).toContainText('AVORA-');
  });

  test('폼이 펼쳐져도 화면 안의 요소가 밀리지 않는다', async ({ page }) => {
    // 폼은 장바구니를 읽은 뒤 나타납니다. 그때 푸터가 화면 안에 있으면 아래로 밀려
    // 레이아웃 이동(CLS)이 생깁니다. 컨테이너가 미리 높이를 잡고 있는지 확인합니다.
    await page.goto('/ko/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/ko/checkout');

    const viewportHeight = page.viewportSize()!.height;
    const container = await page.locator('.checkout').boundingBox();
    expect(container!.height).toBeGreaterThan(viewportHeight * 0.6);
  });

  test('결제수단 목록이 설정 파일을 따른다', async ({ page }) => {
    await fillCart(page);
    // payment-config.json 에서 KR 의 enabled 결제수단은 넷입니다.
    await expect(page.locator('[name="paymentMethod"]')).toHaveCount(4);
    await expect(page.locator('[name="paymentMethod"]:checked')).toHaveCount(1);
  });
});
