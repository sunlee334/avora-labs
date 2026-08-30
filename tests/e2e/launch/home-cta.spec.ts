import { test, expect } from '@playwright/test';

/**
 * 홈 끝의 두 요청 — 팔 수 없을 때.
 *
 * 처음에는 "제품 보기" 와 신청 폼이 한 섹션 안에 64px 간격으로 나란히
 * 있었습니다. 스토리를 끝까지 읽은 사람에게 두 가지를 동시에 시킨 셈이고,
 * 게다가 "제품 보기" 를 누르면 도착한 곳에서 **또 같은 요청** 을 받습니다.
 *
 * 그때는 폼을 위에 두고 링크를 cta--ghost 로 내려서 우열을 매겼습니다.
 * 지금은 아예 섹션을 나눴습니다 — 폼은 검증단 섹션에, 링크는 제품 섹션에.
 * 그래서 우열을 스타일로 표시할 이유가 없어졌고, 지켜야 할 것은
 * "한 자리에서 두 가지를 시키지 않는다" 쪽으로 옮겨갔습니다.
 */
test.describe('홈 끝의 요청', () => {
  test('신청 폼과 제품 보기가 같은 섹션에 있지 않다', async ({ page }) => {
    await page.goto('/ko/');
    const shareSection = await page.evaluate(() => {
      const form = document.querySelector('[data-source="home-end"]');
      const link = document.querySelector('main a.cta[href$="/product/"]');
      if (!form || !link) return null;
      return form.closest('section') === link.closest('section');
    });
    expect(shareSection, '폼과 링크를 둘 다 찾지 못했습니다').not.toBeNull();
    expect(shareSection, '한 섹션에서 두 가지를 동시에 시키고 있습니다').toBe(false);
  });

  test('제품 보기 링크는 홈에 하나뿐이다', async ({ page }) => {
    await page.goto('/ko/');
    await expect(page.locator('main a.cta[href$="/product/"]')).toHaveCount(1);
  });

  test('신청 폼이 제품 보기보다 위에 온다', async ({ page }) => {
    // 지금 1순위는 명단입니다(기획안 13-1, 2027년 1월 500명).
    // 링크가 먼저 나오면 폼까지 내려오기 전에 페이지를 떠납니다.
    await page.goto('/ko/');
    const pos = await page.evaluate(() => {
      const y = (el: Element | null) => (el ? el.getBoundingClientRect().top + window.scrollY : -1);
      return {
        form: y(document.querySelector('[data-source="home-end"]')),
        link: y(document.querySelector('main a.cta[href$="/product/"]')),
      };
    });
    expect(pos.form).toBeGreaterThan(0);
    expect(pos.form, '주된 것이 위에 옵니다').toBeLessThan(pos.link);
  });
});
