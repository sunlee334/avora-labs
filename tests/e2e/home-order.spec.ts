import { test, expect } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };

/**
 * 홈의 섹션 순서.
 *
 * 기획안 2-2-4 의 메시지 위계는 1차(히어로 태그라인) → **2차 근거** →
 * 3차 스펙입니다. 예전에는 근거(The Choice)가 여덟 번째라, 모바일에서 40%
 * 지점에 이탈하는 방문자는 PAROS 가 왜 다른지 모른 채 떠났습니다.
 *
 * 순서는 눈으로 확인하기 어렵고 한 번 어긋나면 조용합니다. 그래서 화면에서
 * 위치를 재서 못 박습니다.
 */

/** 화면 위에서부터의 좌표. 섹션이 없으면 -1. */
async function tops(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const y = (el: Element | null | undefined) =>
      el ? el.getBoundingClientRect().top + window.scrollY : -1;
    const bySection = (sel: string) => y(document.querySelector(sel)?.closest('section'));
    return {
      hero: y(document.querySelector('.hero')),
      choice: bySection('.display--tight'),
      panel: y(document.querySelector('#panel')),
      product: y(document.querySelector('main a.cta[href$="/product/"]')?.closest('section')),
      journey: y(document.querySelector('.journey')?.closest('section')),
      story: y(document.querySelector('#story')),
    };
  });
}

test.describe('메시지 위계가 순서로 드러난다', () => {
  test('근거가 스펙보다, 스펙이 서사보다 앞에 온다', async ({ page }) => {
    await page.goto('/ko/');
    const t = await tops(page);

    expect(t.panel, '검증단 섹션이 없습니다').toBeGreaterThan(0);
    expect(t.product, '제품 섹션이 없습니다').toBeGreaterThan(0);
    expect(t.story, '브랜드 서사(Origin)가 없습니다').toBeGreaterThan(0);

    expect(t.panel, '검증단이 제품 스펙보다 뒤에 있습니다').toBeLessThan(t.product);
    expect(t.product, '제품 스펙이 브랜드 서사보다 뒤에 있습니다').toBeLessThan(t.story);

    /*
     * 이 파일이 막겠다는 회귀는 **The Choice 가 뒤로 밀리는 것** 입니다.
     * 위 두 줄만으로는 그것을 잡지 못합니다 — 검증단과 스펙의 상대 순서만
     * 보기 때문입니다. 근거층(The Choice)이 히어로 바로 다음에 오는지를
     * 직접 봅니다.
     */
    expect(t.choice, 'The Choice 섹션을 찾지 못했습니다').toBeGreaterThan(0);
    expect(t.choice, '근거(The Choice)가 검증단보다 뒤에 있습니다').toBeLessThan(t.panel);
    expect(t.choice, '근거가 브랜드 서사보다 뒤에 있습니다').toBeLessThan(t.story);
    expect(t.journey, '여정 섹션을 찾지 못했습니다').toBeGreaterThan(0);
    expect(t.journey, '여정이 제품 스펙보다 앞에 있습니다').toBeGreaterThan(t.product);
  });

  test('검증단 지원으로 가는 길이 있다', async ({ page }) => {
    /*
     * **이 링크가 없으면 /panel 에 아무도 못 들어갑니다.** 10월에 크루로
     * 뿌릴 주소는 그쪽이지만, 사이트를 둘러보다 관심이 생긴 사람에게도
     * 길이 있어야 합니다.
     */
    await page.goto('/ko/');
    const link = page.locator('#panel a[href$="/panel/"]');
    await expect(link, '홈에서 /panel 로 가는 링크가 없습니다').toHaveCount(1);
    await expect(link).toHaveText(ko.home.panel.cta);

    await link.click();
    await expect(page).toHaveURL(/\/ko\/panel\/?$/);
  });

  test('네 감각과 다섯 여정이 홈에 겹쳐 나오지 않는다', async ({ page }) => {
    /*
     * 4개짜리와 5개짜리 프레임워크가 연달아 나오면 어느 쪽도 기억에
     * 남지 않습니다. 네 감각은 제품 페이지에 있습니다.
     */
    await page.goto('/ko/');
    await expect(page.locator('.promise')).toHaveCount(0);
    await expect(page.locator('.journey')).toHaveCount(1);

    await page.goto('/ko/product/');
    await expect(page.locator('.principles'), '네 감각이 제품 페이지에 없습니다').toHaveCount(1);
  });
});
