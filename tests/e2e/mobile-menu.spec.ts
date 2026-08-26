import { test, expect, type Page } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 모바일 메뉴.
 *
 * 헤더의 링크 묶음은 900px 미만에서 숨겨집니다. 그동안 모바일에서 브랜드
 * 스토리·제품·고객센터로 가는 길은 푸터뿐이었습니다. 이 시트가 그 길을
 * 헤더에도 만듭니다.
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

  test('버튼이 보이고, 헤더 링크는 숨어 있다', async ({ page }) => {
    await page.goto('/ko/');
    await expect(page.locator('[data-menu-open]')).toBeVisible();
    // 이 폭에서 .nav__links 가 보인다면 메뉴 버튼은 중복입니다.
    await expect(page.locator('.nav__links')).toBeHidden();
  });

  test('메뉴로 고객센터까지 갈 수 있다', async ({ page }) => {
    await page.goto('/ko/');
    await openMenu(page);
    await page.locator('.menu__item', { hasText: '고객센터' }).click();
    await expect(page).toHaveURL(/\/ko\/support\/?$/);
  });

  test('제품·브랜드 스토리도 메뉴에 있다', async ({ page }) => {
    await page.goto('/ko/');
    await openMenu(page);
    const labels = await page.locator('.menu__item').allInnerTexts();
    expect(labels.join(' ')).toContain('브랜드 스토리');
    expect(labels.join(' ')).toContain('제품');
  });

  test('지금 보고 있는 페이지가 표시된다', async ({ page }) => {
    await page.goto('/ko/support');
    await openMenu(page);
    const current = page.locator('.menu__item[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText('고객센터');
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
    for (const href of ['/ko/', '/ko/product', '/ko/support']) {
      await expect(
        page.locator(`footer a[href="${href}"]`).first(),
        `푸터에 ${href} 링크가 없습니다`,
      ).toBeVisible();
    }
  });
});
