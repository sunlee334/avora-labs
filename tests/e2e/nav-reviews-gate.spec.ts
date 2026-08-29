import { test, expect } from '@playwright/test';
import { visibleTop, allLeaves, type NavFlags } from '../../src/config/nav';
import commerce from '../../src/config/commerce.json' with { type: 'json' };

/**
 * 리뷰 항목의 게이트.
 *
 * 후기는 결제된 주문에서만 생깁니다(worker/reviews.ts). 자사 결제가 꺼져
 * 있으면 후기가 존재할 수 없으므로, 내비의 리뷰 항목은 언제 눌러도 빈
 * 페이지로 가는 길이 됩니다. 빈 상태 문구가 잘 쓰여 있어도 빈 페이지는
 * 빈 페이지입니다.
 *
 * 길만 감추고 페이지는 남깁니다 — 제품 페이지에서는 계속 갈 수 있고,
 * 첫 후기가 쌓이는 순간(=결제가 켜지는 순간) 저절로 돌아옵니다.
 */
const MODE = process.env.E2E_MODE === 'launch' ? 'launch' : 'commerce';
const FLAGS: NavFlags = {
  checkout: MODE === 'commerce',
  accounts: MODE === 'commerce' ? true : commerce.accounts.enabled,
};

function hasReviews(flags: NavFlags): boolean {
  return allLeaves(flags).some((leaf) => leaf.id === 'reviews');
}

test.describe('리뷰 항목 게이트', () => {
  test('정의가 결제 플래그를 따른다', () => {
    expect(hasReviews({ ...FLAGS, checkout: true }), '결제 켜짐 → 노출').toBe(true);
    expect(hasReviews({ ...FLAGS, checkout: false }), '결제 꺼짐 → 감춤').toBe(false);
  });

  test('묶음이 사라지지 않고 자식만 줄어든다', () => {
    // 고객센터에는 FAQ·읽을거리가 남으므로 묶음 그대로여야 합니다.
    const off = visibleTop({ ...FLAGS, checkout: false });
    const support = off.find((t) => t.id === 'support');
    expect(support, '고객센터 묶음이 사라졌습니다').toBeTruthy();
    expect(support!.kind).toBe('group');
    if (support!.kind === 'group') expect(support!.children.length).toBe(2);
  });

  test('내비·시트·푸터가 정의와 같다', async ({ page }) => {
    await page.goto('/ko/');
    const shown = hasReviews(FLAGS);
    // 탐색 영역만 봅니다 — 본문의 링크는 게이트와 무관합니다.
    for (const scope of ['.nav__links', '.menu__sheet', '[data-footer-menu]']) {
      await expect(
        page.locator(`${scope} a[href="/ko/reviews"]`),
        `${scope} 가 정의와 어긋납니다`,
      ).toHaveCount(shown ? 1 : 0);
    }
  });

  test('감춰도 제품 페이지 본문에서는 갈 수 있다', async ({ page }) => {
    // 길을 감추는 것이지 페이지를 없애는 것이 아닙니다.
    await page.goto('/ko/product');
    await expect(page.locator('main a[href="/ko/reviews"]')).toHaveCount(1);
  });

  test('감춰도 페이지 자체는 열린다', async ({ page }) => {
    const res = await page.goto('/ko/reviews');
    expect(res!.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
  });
});
