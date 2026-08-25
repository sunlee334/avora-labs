import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ADMIN_DEV_TOKEN } from '../../../playwright.config';

/**
 * 결제 흐름의 접근성.
 *
 * 돈을 내는 화면이라 접근성이 깨지면 그대로 매출이 됩니다. 그리고 여기가
 * 자동 검사의 값어치가 가장 큰 자리입니다 — 장바구니 줄과 오류 메시지는
 * 자바스크립트가 만들어 넣기 때문에, 처음 그려진 HTML 만 보는 검사로는
 * 아예 존재하지 않는 것으로 보입니다.
 */

/**
 * 검사 중에는 모션을 끕니다.
 *
 * 스크롤 등장 애니메이션이 도는 동안 재면, 반쯤 투명한 글자의 혼합색이
 * 잡혀 대비 1.05 같은 값이 나옵니다. 실제 화면의 색이 아니라 애니메이션
 * 중간값이라 오탐입니다. 사이트가 이미 prefers-reduced-motion 을 존중해
 * 등장 요소를 즉시 보여주므로(mobile-ux.spec.ts 가 확인), 그 상태로 재면
 * 애니메이션이 끝난 뒤와 같은 색을 결정적으로 얻습니다.
 */
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

async function scan(page: Page, testInfo: { attach: Function }) {
  const results = await new AxeBuilder({ page }).withTags([...WCAG]).analyze();
  if (results.violations.length > 0) {
    await testInfo.attach('axe-violations', {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });
  }
  return results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    where: v.nodes.map((n) => n.target.join(' ')).slice(0, 3),
  }));
}

test.describe('구매 흐름', () => {
  test('빈 장바구니', async ({ page }, testInfo) => {
    await page.goto('/ko/cart');
    await expect(page.locator('[data-cart-empty]')).toBeVisible();
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test('상품이 담긴 장바구니 — 수량 버튼과 합계', async ({ page }, testInfo) => {
    await page.goto('/ko/product');
    await page.locator('[data-add-to-cart]').click();
    await page.goto('/ko/cart');
    await expect(page.locator('.cart__line')).toHaveCount(1);
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test('담기 토스트가 뜬 상태', async ({ page }, testInfo) => {
    // 화면에 갑자기 나타나는 알림은 스크린리더에도 전달돼야 합니다.
    await page.goto('/ko/product');
    await page.locator('[data-add-to-cart]').click();
    await expect(page.locator('[data-toast]')).toHaveAttribute('data-open', 'true');
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test('체크아웃 폼', async ({ page }, testInfo) => {
    await page.goto('/ko/product');
    await page.locator('[data-add-to-cart]').click();
    await page.goto('/ko/checkout');
    await expect(page.locator('[data-checkout-lines] li')).toHaveCount(1);
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test('체크아웃 오류가 표시된 상태', async ({ page }, testInfo) => {
    // 오류 메시지가 입력칸과 연결되지 않으면, 무엇이 잘못됐는지 알 수 없는 채로
    // "오류가 있습니다" 만 듣게 됩니다.
    await page.goto('/ko/product');
    await page.locator('[data-add-to-cart]').click();
    await page.goto('/ko/checkout');
    await page.locator('[data-pay]').click();
    await expect(page.locator('[data-error-for]:not([hidden])').first()).toBeVisible();
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test('주문 조회 화면과 결과', async ({ page, request }, testInfo) => {
    const stamp = String(20261025000000 + Math.floor(Math.random() * 999999)).padEnd(14, '0').slice(0, 14);
    const orderId = `AVORA-${stamp}-A11Y01`;
    await request.post('/api/orders', {
      data: {
        orderId, amount: 32000, currency: 'KRW', locale: 'ko',
        items: [{ id: 'daily-sunscreen', qty: 1 }],
        recipientName: '접근성', recipientPhone: '010-3333-4444',
        postalCode: '04524', address1: '서울 중구 세종대로 110',
      },
    });

    await page.goto('/ko/order/lookup');
    expect(await scan(page, testInfo)).toEqual([]);

    await page.locator('[name="orderId"]').fill(orderId);
    await page.locator('[name="phone"]').fill('010-3333-4444');
    await page.locator('[data-lookup-submit]').click();
    await expect(page.locator('[data-lookup-result]')).toBeVisible();
    expect(await scan(page, testInfo)).toEqual([]);
  });
});

test.describe('마이페이지', () => {
  test('로그인 전', async ({ page }, testInfo) => {
    await page.goto('/ko/account');
    await expect(page.locator('[data-account-anon]')).toBeVisible();
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test('로그인 후 — 주문내역과 가져오기 폼이 그려진 상태', async ({ page }, testInfo) => {
    const start = await page.request.get('/api/auth/login?returnTo=%2Fko%2Faccount', {
      maxRedirects: 0,
    });
    const callback = new URL(start.headers()['location']);
    callback.searchParams.set('code', 'a11y-account-user');
    await page.request.get(callback.href, { maxRedirects: 0 });

    await page.goto('/ko/account');
    await expect(page.locator('[data-account-signed]')).toBeVisible();
    expect(await scan(page, testInfo)).toEqual([]);
  });
});

test.describe('관리 화면', () => {
  test.use({ extraHTTPHeaders: { 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN } });

  test('주문 목록', async ({ page }, testInfo) => {
    await page.goto('/admin');
    await expect(page.locator('[data-rows] tr').first()).toBeVisible();
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test('주문 상세 대화상자를 연 상태', async ({ page, request }, testInfo) => {
    const stamp = String(20261025000000 + Math.floor(Math.random() * 999999)).padEnd(14, '0').slice(0, 14);
    const orderId = `AVORA-${stamp}-A11Y02`;
    await request.post('/api/orders', {
      data: {
        orderId, amount: 32000, currency: 'KRW', locale: 'ko',
        items: [{ id: 'daily-sunscreen', qty: 1 }],
        recipientName: '접근성', recipientPhone: '010-3333-4445',
        postalCode: '04524', address1: '서울 중구 세종대로 110',
      },
    });

    await page.goto('/admin');
    await page.locator('[data-filters] [name="search"]').fill(orderId);
    await page.locator('[data-filters] [name="search"]').press('Enter');
    await page.locator('[data-rows] tr', { hasText: orderId }).click();
    await expect(page.locator('[data-detail]')).toBeVisible();
    expect(await scan(page, testInfo)).toEqual([]);
  });
});
