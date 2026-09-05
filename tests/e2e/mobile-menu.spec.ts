import { test, expect, type Page } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 모바일 메뉴.
 *
 * 900px 미만에서 헤더는 **핵심 항목 + MENU** 입니다. 예전에는 링크 묶음을
 * 통째로 숨기고 MENU 하나만 두었는데, 그러면 제품 페이지로 가는 데 두 걸음
 * (열기 → 고르기)이 듭니다. 지금은 좁은 폭에서도 「제품」이 상단에 남고,
 * 나머지 길은 이 시트가 냅니다.
 *
 * 여기서 확인하는 것은 "열린다" 가 아니라 **닫을 수 있고, 갈 수 있고,
 * 키보드로도 자리를 잃지 않는다** 입니다. 모달은 열기보다 닫기가 어렵습니다.
 */

const MOBILE = { width: 390, height: 844 };

async function openMenu(page: Page) {
  await page.locator('[data-menu-open]').click();
  await expect(page.locator('[data-menu-sheet]')).toBeVisible();
}

test.describe('모바일에서 메뉴가 통로가 된다', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE);
  });

  test('버튼과 핵심 항목이 함께 있고, 나머지는 시트에만 있다', async ({ page }) => {
    await page.goto('/ko/');
    await expect(page.locator('[data-menu-open]')).toBeVisible();

    /*
     * 예전에는 「이 폭에서 `.nav__links` 가 보이면 MENU 는 중복이다」 였습니다.
     * 지금은 둘이 역할을 나눕니다 — 상단은 가장 많이 가는 곳 하나,
     * MENU 는 나머지 전부. 그래서 **무엇이 남았는지** 를 셉니다.
     */
    await expect(page.locator('.nav__links > li[data-top="product"]')).toBeVisible();
    for (const id of ['brand', 'panel', 'support']) {
      await expect(
        page.locator(`.nav__links > li[data-top="${id}"]`),
        `390px 에 ${id} 까지 나오면 MENU 와 중복이고 폭도 모자랍니다`,
      ).toBeHidden();
    }
  });

  test('메뉴로 고객센터까지 갈 수 있다', async ({ page }) => {
    // 고객센터는 이제 잎이 셋인 묶음이라 링크가 아니라 펼치는 버튼입니다.
    // 목적지는 그 안의 "자주 묻는 질문" 이고 주소는 그대로 /ko/support 입니다.
    await page.goto('/ko/');
    await openMenu(page);
    await page.locator('.menu__item--group', { hasText: '고객센터' }).click();
    await page.locator('.menu__item--sub', { hasText: '자주 묻는 질문' }).click();
    await expect(page).toHaveURL(/\/ko\/support\/?$/);
  });

  test('제품·브랜드도 메뉴에 있다', async ({ page }) => {
    await page.goto('/ko/');
    await openMenu(page);
    // 최상위 라벨은 묶음의 이름입니다 — "브랜드 스토리" 는 그 아래 잎의
    // 이름이고, 하위가 하나뿐이라 접혀서 부모 라벨만 보입니다.
    const labels = await page.locator('.menu__item').allInnerTexts();
    expect(labels.join(' ')).toContain('브랜드');
    expect(labels.join(' ')).toContain('제품');
    expect(labels.join(' ')).toContain('고객센터');
  });

  test('지금 보고 있는 페이지가 표시된다', async ({ page }) => {
    await page.goto('/ko/support');
    await openMenu(page);
    const current = page.locator('.menu__item[aria-current="page"]');
    // 표시는 **잎에만** 붙습니다. 그룹 버튼에도 붙이면 둘이 됩니다.
    await expect(current).toHaveCount(1);
    await expect(current).toContainText('자주 묻는 질문');
  });

  test('현재 페이지를 품은 묶음은 처음부터 펼쳐져 있다', async ({ page }) => {
    // 닫힌 서랍 안에 현재 위치가 숨어 있으면 "여기가 어디인지" 를 알 수
    // 없습니다. 한 번 더 눌러야 보이는 것은 표시가 아닙니다.
    await page.goto('/ko/support');
    await openMenu(page);
    const group = page.locator('.menu__item--group', { hasText: '고객센터' });
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.menu__item--sub', { hasText: '자주 묻는 질문' })).toBeVisible();
  });
});

test.describe('닫을 수 있는가', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/ko/');
  });

  test('닫기 버튼', async ({ page }) => {
    await openMenu(page);
    await page.locator('[data-menu-close]').click();
    await expect(page.locator('[data-menu-sheet]')).toBeHidden();
  });

  test('Esc', async ({ page }) => {
    await openMenu(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-menu-sheet]')).toBeHidden();
  });

  test('시트 바깥(백드롭)', async ({ page }) => {
    await openMenu(page);
    // 시트는 화면 아래에 붙어 있으므로 위쪽은 백드롭입니다.
    await page.mouse.click(MOBILE.width / 2, 60);
    await expect(page.locator('[data-menu-sheet]')).toBeHidden();
  });

  test('키보드로 묶음을 펼쳐도 메뉴가 닫히지 않는다', async ({ page }) => {
    /*
     * 백드롭 판정을 좌표로만 하면 **키보드가 메뉴를 닫습니다.**
     *
     * Space·Enter 로 활성화한 클릭은 `clientX = clientY = 0` 입니다. 시트는
     * 화면 아래에 붙어 `box.top` 이 항상 0보다 크므로, 그 클릭은 "시트
     * 바깥" 으로 판정됩니다. 마우스로 눌러 본 사람은 영영 모르는 자리입니다 —
     * 위의 `시트 바깥(백드롭)` 검사도 실제 좌표로 누르므로 지나갑니다.
     *
     * 고객센터를 Tab 으로 찾아가 Space 를 누르면, 하위가 펼쳐지자마자 메뉴가
     * 통째로 사라졌습니다.
     */
    await page.goto('/ko/');
    await openMenu(page);
    const group = page.locator('.menu__item--group', { hasText: '고객센터' });
    await group.focus();
    await page.keyboard.press('Space');
    await expect(group, '하위가 펼쳐지지 않았습니다').toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.locator('[data-menu-sheet]'),
      '키보드로 눌렀더니 메뉴가 닫혔습니다',
    ).toBeVisible();
  });

  test('닫으면 열었던 버튼으로 포커스가 돌아온다', async ({ page }) => {
    // 없으면 포커스가 문서 처음으로 튀어, 키보드 사용자는 메뉴를 닫을 때마다
    // 자기 자리를 잃습니다.
    await openMenu(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-menu-open]')).toBeFocused();
  });
});

test.describe('모바일 기준을 지킨다', () => {
  test('열린 시트가 320~430px 에서 넘치지 않는다', async ({ page }) => {
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/ko/');
      await openMenu(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `열린 메뉴 @ ${width}px 가로 넘침`).toBeLessThanOrEqual(0);
    }
  });

  test('펼침 항목이 브라우저 기본 버튼으로 보이지 않는다', async ({ page }) => {
    /*
     * `.menu__item--group`(고객센터처럼 하위를 여는 항목)은 `<button>` 입니다.
     * 그 기본 모양을 지우는 규칙이 한동안 `min-width: 900px` 안에 갇혀 있어서,
     * **휴대폰에서만** 회색 배경에 네모 테두리가 둘린 버튼으로 보였습니다.
     * 목록의 다른 항목은 전부 전체 폭인데 이것 하나만 글자 폭이었습니다.
     *
     * 데스크톱에서는 멀쩡했기 때문에 오래 남아 있었습니다. 그래서 이 검사는
     * 반드시 모바일 폭에서 봅니다.
     */
    await page.setViewportSize(MOBILE);
    await page.goto('/ko/');
    await openMenu(page);

    const group = page.locator('.menu__item--group').first();
    await expect(group, '펼침 항목이 없습니다').toBeVisible();

    const seen = await group.evaluate((el) => {
      const cs = getComputedStyle(el);
      const list = el.closest('.menu__list, .menu__sheet') as HTMLElement;
      return {
        배경: cs.backgroundColor,
        폭: el.getBoundingClientRect().width,
        목록폭: list.getBoundingClientRect().width,
      };
    });

    // 기본 버튼은 불투명한 회색 면을 깔고 옵니다. 투명해야 목록의 다른 줄과 같습니다.
    expect(seen.배경, `버튼 배경이 ${seen.배경} 입니다`).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    // 글자 폭이 아니라 줄 전체를 차지해야 옆의 여백을 눌러도 열립니다.
    expect(seen.폭, '펼침 항목이 줄 전체를 차지하지 않습니다').toBeGreaterThan(seen.목록폭 * 0.9);
  });

  test('메뉴 안의 탭 영역이 44px 이상이다', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/ko/');
    await openMenu(page);

    const targets = page.locator('.menu__sheet a, .menu__sheet button, [data-menu-open]');
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);

    const small: string[] = [];
    for (let i = 0; i < count; i++) {
      const box = await targets.nth(i).boundingBox();
      if (!box) continue;
      if (box.height < 44 || box.width < 44) {
        const text = ((await targets.nth(i).textContent()) || '').trim().slice(0, 16);
        small.push(`"${text}" ${Math.round(box.width)}×${Math.round(box.height)}`);
      }
    }
    expect(small, `메뉴 터치 영역 부족: ${small.join(' / ')}`).toEqual([]);
  });

  test('5개 언어 모두 메뉴가 열리고 항목이 비어 있지 않다', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    for (const lang of LOCALES) {
      await page.goto(`/${lang}/`);
      await openMenu(page);
      const labels = await page.locator('.menu__item').allInnerTexts();
      expect(labels.length, `${lang} 메뉴가 비었습니다`).toBeGreaterThanOrEqual(3);
      expect(
        labels.filter((l) => !l.trim()),
        `${lang} 에 빈 항목이 있습니다`,
      ).toEqual([]);
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('데스크톱에서는 나오지 않는다', () => {
  test('900px 이상이면 메뉴 버튼이 숨고 헤더 링크가 보인다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await expect(page.locator('[data-menu-open]')).toBeHidden();
    await expect(page.locator('.nav__links')).toBeVisible();
  });
});

test.describe('JS 가 없어도 갈 곳을 잃지 않는다', () => {
  test('푸터에 같은 링크가 평문으로 있다', async ({ page }) => {
    // 시트는 <dialog>.showModal() 로 열리므로 JS 가 없으면 열리지 않습니다.
    // 그 경우의 통로가 푸터입니다 — 여기가 비면 메뉴가 유일한 길이 됩니다.
    await page.setViewportSize(MOBILE);
    await page.goto('/ko/');
    for (const href of ['/ko/', '/ko/product/', '/ko/support/']) {
      await expect(
        page.locator(`footer a[href="${href}"]`).first(),
        `푸터에 ${href} 링크가 없습니다`,
      ).toBeVisible();
    }
  });
});
