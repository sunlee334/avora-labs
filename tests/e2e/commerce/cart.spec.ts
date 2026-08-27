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

  test('프로토타입 이름을 상품 id 로 넣어도 무시한다', async ({ page }) => {
    // `'toString' in CATALOG` 는 참이라, in 연산자를 쓰면 이런 줄이 살아남아
    // 이름도 가격도 없는 항목이 장바구니에 박힙니다.
    await page.goto('/ko/');
    await page.evaluate(() =>
      localStorage.setItem(
        'avora.cart.v1',
        JSON.stringify([{ id: 'toString', qty: 1 }, { id: 'constructor', qty: 2 }]),
      ),
    );
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

/**
 * 눈으로 보는 배지와 읽히는 이름은 다릅니다.
 *
 * 숫자 배지는 `aria-hidden` 이고, 옆의 `sr-only` 가 스크린리더가 듣는
 * 전부입니다. 거기에 숫자만 넣으면 링크가 "장바구니 3" 으로 읽혀 **3 이
 * 무엇의 3인지 말하지 않습니다.** 그래서 `cart.itemCount`("{count}개")를
 * 채워 넣습니다.
 *
 * 이 문구는 언어마다 다릅니다("{count} item(s)", "{count} 件", …). 서버가
 * `data-count-template` 로 내려주므로 스크립트가 5개 언어를 알 필요는
 * 없지만, **내려주는 것을 잊으면 조용히 빈 문자열이 됩니다** — 화면은
 * 멀쩡하고 스크린리더만 아무 말도 듣지 못합니다. 그래서 여기서 봅니다.
 */
test.describe('장바구니 개수가 읽히는가', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ko/');
    await page.evaluate(() => localStorage.clear());
  });

  test('비었을 때는 개수를 말하지 않는다', async ({ page }) => {
    await page.goto('/ko/');
    await expect(page.locator('[data-nav-cart-sr]')).toHaveText('');
    // 링크 이름은 여전히 "장바구니" — 빈 장바구니라고 떠들 필요가 없습니다.
    await expect(page.locator('[data-nav-cart]')).toHaveAccessibleName(/장바구니/);
  });

  test('담으면 몇 개인지까지 읽힌다', async ({ page }) => {
    await page.goto('/ko/product');
    await page.locator('[data-add-to-cart]').click();
    await expect(page.locator('[data-nav-cart-count]')).toHaveText('1');

    // 숫자만이 아니라 단위까지 — "1" 이 아니라 "1개"
    await expect(page.locator('[data-nav-cart-sr]')).toHaveText('1개');
    await expect(page.locator('[data-nav-cart]')).toHaveAccessibleName(/장바구니.*1개/);
  });

  test('문구 틀이 5개 언어 전부에 실려 나온다', async ({ page }) => {
    // 하나라도 빠지면 그 언어에서만 조용히 개수를 안 읽습니다.
    for (const lang of ['ko', 'en', 'zh', 'th', 'vi']) {
      await page.goto(`/${lang}/`);
      const template = await page.locator('[data-nav-cart]').getAttribute('data-count-template');
      expect(template, `${lang}: data-count-template 이 없습니다`).toBeTruthy();
      expect(template, `${lang}: {count} 자리가 없어 숫자를 넣을 수 없습니다`).toContain('{count}');
    }
  });
});
