import { test, expect } from '@playwright/test';

/**
 * 요구사항 7번 — 모바일 최적화가 이 프로젝트의 최우선 원칙입니다.
 * Round 8 에서 정한 정량 기준을 그대로 검사합니다.
 */

const PAGES = ['/ko/', '/ko/product', '/en/', '/th/'];

test.describe('모바일 레이아웃', () => {
  for (const path of PAGES) {
    test(`${path} — 360~430px 폭에서 가로 스크롤이 없다`, async ({ page }) => {
      for (const width of [360, 390, 430]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        // CSS 와 이미지가 적용된 뒤에 잽니다. domcontentloaded 시점에는 스타일이
        // 아직 안 붙어 폭 속성만 가진 이미지가 넘치는 것처럼 보입니다(사용자는 못 보는 상태).
        await page.waitForLoadState('load');

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} @ ${width}px 에서 가로 넘침`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('탭 가능한 요소가 최소 44×44px 를 확보한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');

    const targets = page.locator('a[href], button');
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);

    const tooSmall: string[] = [];
    for (let i = 0; i < count; i++) {
      const el = targets.nth(i);
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      if (!box) continue;
      if (box.height < 44 || box.width < 44) {
        const text = ((await el.textContent()) || '').trim().slice(0, 24);
        tooSmall.push(`"${text}" ${Math.round(box.width)}×${Math.round(box.height)}`);
      }
    }
    expect(tooSmall, `터치 영역 부족: ${tooSmall.join(' / ')}`).toEqual([]);
  });
});

test.describe('모션 접근성', () => {
  test('prefers-reduced-motion 이면 등장 요소가 즉시 보인다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/ko/');

    // 스크롤하지 않은 상태에서도 아래쪽 .rise 요소가 이미 보여야 합니다.
    const last = page.locator('.rise').last();
    await expect(last).toHaveClass(/is-in/);
    await expect(last).toHaveCSS('opacity', '1');
  });

  test('모션이 켜져 있으면 스크롤에 따라 등장한다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/ko/');

    const target = page.locator('.rise').nth(3);
    await target.scrollIntoViewIfNeeded();
    await expect(target).toHaveClass(/is-in/, { timeout: 3000 });
  });
});

test.describe('시맨틱 마크업', () => {
  test('h1 은 페이지당 하나, main 과 nav 가 존재한다', async ({ page }) => {
    await page.goto('/ko/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main#main')).toHaveCount(1);
    await expect(page.locator('nav')).toHaveCount(1);
  });

  test('모든 이미지에 alt 가 있다', async ({ page }) => {
    for (const path of ['/ko/', '/ko/product']) {
      await page.goto(path);
      const imgs = page.locator('img');
      const n = await imgs.count();
      for (let i = 0; i < n; i++) {
        await expect(imgs.nth(i), `${path} 의 ${i}번째 이미지`).toHaveAttribute('alt', /.+/);
      }
    }
  });

  test('본문 건너뛰기 링크가 포커스되면 화면 안으로 들어온다', async ({ page }) => {
    // Tab 키가 링크에 포커스를 주는지는 브라우저 정책입니다 — Safari 는 기본값이 꺼져 있습니다.
    // 여기서 검사할 것은 우리가 통제하는 쪽, 즉 "포커스되면 보이는가" 입니다.
    await page.goto('/ko/');
    const skip = page.locator('.skip-link');

    const before = await skip.boundingBox();
    expect(before!.y).toBeLessThan(0); // 평소에는 화면 위로 숨어 있다

    await skip.focus();
    await expect(skip).toBeFocused();

    // top 이 트랜지션으로 움직이므로 자리를 잡을 때까지 기다립니다.
    await expect
      .poll(async () => (await skip.boundingBox())!.y, { timeout: 2000 })
      .toBeGreaterThanOrEqual(0);
    expect((await skip.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await skip.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });
});
