import { test, expect } from '@playwright/test';
import product from '../../../src/data/product.json' with { type: 'json' };

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

  test('구조화 데이터의 가격이 제품 정보와 같고, 아직 못 산다고 말한다', async ({ request }) => {
    /*
     * 전에는 "offers 가 없다" 였습니다. 가격이 정해지지 않았을 때 offers 를
     * 내보내면 검색엔진에 잘못된 사실을 주기 때문입니다.
     *
     * 제품 기획안 6-1 이 정가를 32,000원으로 **확정** 하면서 그 전제가
     * 사라졌습니다. 이제 지켜야 할 것은 두 가지입니다.
     *
     *   ① 화면과 같은 값일 것 — 두 곳이 갈리면 어느 쪽이 참인지 알 수 없습니다
     *   ② **아직 팔지 않는다는 사실이 함께 있을 것** — 가격만 내보내면
     *      지금 살 수 있다는 뜻이 됩니다. 판매 개시는 2027년 5월입니다
     */
    const html = await (await request.get('/ko/product')).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)];
    const schema = blocks.map((m) => JSON.parse(m[1])).find((s) => s['@type'] === 'Product');

    expect(schema.offers, 'offers 가 없습니다 — 확정된 가격을 숨기고 있습니다').toBeDefined();
    expect(schema.offers.price, '구조화 데이터의 가격이 product.json 과 다릅니다').toBe(
      product.price,
    );
    expect(schema.offers.availability, '아직 팔지 않는다는 사실이 빠졌습니다').toContain(
      'PreOrder',
    );
  });

  test('체크아웃 페이지는 결제 준비 안내만 보여준다', async ({ page }) => {
    await page.goto('/ko/checkout');
    await expect(page.locator('[data-checkout]')).toHaveCount(0);
    await expect(page.locator('.cart__notice')).toBeVisible();
  });

  test('가격은 확정된 값만 보여주고, 그래도 할 일을 준다', async ({ page }) => {
    /*
     * 예전에는 이 자리에 눌리지 않는 회색 글자("가격 확정 예정")가 있었고,
     * 그다음에는 아무것도 없었습니다. 지금은 기획안 6-1 이 확정한 정가가
     * 있습니다.
     *
     * 값이 생겨도 **할 일은 그대로여야 합니다.** 2027년 5월까지는 살 수
     * 없으므로, 가격 옆에 출시 시기와 알림 신청이 함께 있어야 합니다.
     * 숫자만 남으면 지금 살 수 있다는 뜻이 됩니다.
     */
    await page.goto('/ko/product');
    const price = page.locator('.product-hero__price');
    await expect(price, '확정된 가격이 화면에 없습니다').toHaveCount(1);
    await expect(price, '가격이 product.json 과 다릅니다').toContainText(
      String(product.price).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    );
    // 무엇의 가격인지 — 펀딩가(21,000~25,500원)와 헷갈리면 안 됩니다.
    await expect(price.locator('small'), '무엇의 가격인지 말하지 않습니다').toHaveCount(1);

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
