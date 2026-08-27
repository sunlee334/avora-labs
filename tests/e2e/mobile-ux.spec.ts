import { test, expect } from '@playwright/test';

/**
 * 요구사항 7번 — 모바일 최적화가 이 프로젝트의 최우선 원칙입니다.
 * Round 8 에서 정한 정량 기준을 그대로 검사합니다.
 */

/**
 * 가로 넘침을 검사할 페이지.
 *
 * 새 페이지를 만들면 **여기에 직접 추가해야 합니다.** 목록 기반이라 자동으로
 * 늘지 않습니다. 실제로 법적 페이지와 계정 페이지가 한동안 빠져 있었습니다.
 *
 * 언어는 글꼴과 줄바꿈이 달라 넘침도 다르게 납니다 — 한국어만 보면 안 됩니다.
 */
const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'] as const;

/**
 * 한 언어만 검사하면 나머지 넷은 아무도 안 봅니다.
 *
 * 실제로 한국어만 보던 시기에 태국어 /th/product 가 360px 에서 13px 넘쳤고,
 * body 에 overflow-x:hidden 이 걸려 있어 **가로 스크롤바조차 없이 글자만
 * 잘려 있었습니다.** 언어마다 글꼴 폭과 줄바꿈 규칙이 달라 넘침도 다릅니다.
 */
const PAGES = LOCALES.flatMap((l) => [
  `/${l}/`,
  `/${l}/product`,
  `/${l}/support`,
  `/${l}/reviews`,
  `/${l}/legal/terms`,
  `/${l}/legal/privacy`,
  `/${l}/legal/shipping`,
  `/${l}/support/posts`,
]);

/**
 * 글 상세는 그 글이 있는 언어에만 존재합니다.
 *
 * 마크다운 본문은 손이 아니라 글쓴이가 만드는 문자열이라 무엇이 올지
 * 모릅니다 — 긴 URL, 표, 코드가 320px 화면을 가로로 밀어낼 수 있고,
 * 그게 `.post__body` 에 `overflow-wrap: anywhere` 를 건 이유입니다.
 * 목록 페이지에는 그런 것이 없으므로 상세를 따로 봅니다.
 */
const POST_PAGES = ['/ko/support/posts/shipping-notice', '/en/support/posts/shipping-notice'];

/**
 * 검사할 폭.
 *
 * 320 은 WCAG 2.1 의 1.4.10 Reflow 기준입니다 — 데스크톱을 200% 확대한 것과
 * 같은 폭이고, 아직 쓰이는 작은 단말(iPhone SE 1세대, 갤럭시 폴드 커버)이
 * 여기에 해당합니다. 430 은 iPhone Pro Max 계열입니다.
 */
const WIDTHS = [320, 360, 390, 430];

/** 자사 결제·회원 기능이 켜진 빌드에서만 존재하는 페이지. */
const COMMERCE_PAGES = ['/ko/cart', '/ko/checkout', '/ko/order/lookup', '/ko/account'];

test.describe('모바일 레이아웃', () => {
  for (const path of [...PAGES, ...POST_PAGES]) {
    test(`${path} — 320~430px 폭에서 가로 스크롤이 없다`, async ({ page }) => {
      for (const width of WIDTHS) {
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

  /** 화면 하나의 탭 영역을 모두 재서 44px 미만인 것을 모읍니다. */
  async function tooSmallTargets(page: import('@playwright/test').Page): Promise<string[]> {
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
    return tooSmall;
  }

  for (const path of [...PAGES, ...POST_PAGES]) {
    test(`${path} — 탭 가능한 요소가 최소 44×44px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      const tooSmall = await tooSmallTargets(page);
      expect(tooSmall, `${path} 터치 영역 부족: ${tooSmall.join(' / ')}`).toEqual([]);
    });
  }
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

test.describe('언어별 줄바꿈 규칙', () => {
  /**
   * 줄바꿈 규칙 하나를 전 언어에 통일하면 반드시 한쪽이 깨집니다.
   *
   *   keep-all  한국어에는 필요합니다. 없으면 "부드러운 케어" 가
   *             "부드러 / 운 케어" 로 잘립니다.
   *             그러나 띄어쓰기가 없는 중국어·태국어에 걸면 문장 전체가
   *             낱말 하나가 되어 줄바꿈 지점을 잃습니다.
   *
   * 이 테스트가 없으면 다음에 누가 body 에 keep-all 을 되돌려도 아무도
   * 모릅니다 — 한국어 화면은 멀쩡해 보이기 때문입니다.
   */
  const EXPECTED: Record<string, string> = {
    ko: 'keep-all',
    en: 'normal',
    zh: 'normal',
    th: 'normal',
    vi: 'normal',
  };

  for (const [lang, expected] of Object.entries(EXPECTED)) {
    test(`/${lang}/ 본문의 word-break 는 ${expected}`, async ({ page }) => {
      await page.goto(`/${lang}/`);
      const value = await page
        .locator('main p')
        .first()
        .evaluate((el) => getComputedStyle(el).wordBreak);
      expect(value, `${lang} 의 줄바꿈 규칙`).toBe(expected);
    });
  }
});

test.describe('관리 화면 스타일이 공개 페이지로 새지 않는다', () => {
  /**
   * Astro 는 사이트의 모든 `is:global` CSS 를 **한 파일로 묶어 모든 페이지에**
   * 링크합니다. admin.astro 의 `<style is:global>` 에 `body`, `table`,
   * `tbody tr` 같은 맨몸 선택자가 있으면 5개 언어 공개 페이지가 전부 그것을
   * 받습니다. 실제로 거기 있던 word-break:keep-all 때문에 태국어 페이지의
   * 글자가 화면 밖으로 잘렸습니다.
   */
  test('법적 고지의 표는 클릭 대상처럼 보이지 않는다', async ({ page }) => {
    await page.goto('/ko/legal/shipping');
    const row = page.locator('.dataTable tbody tr').first();
    await expect(row).toBeVisible();
    // 관리 화면의 `tbody tr { cursor: pointer }` 가 새면 여기서 pointer 가 됩니다.
    await expect(row).toHaveCSS('cursor', 'auto');
  });

  test('공개 페이지의 표에 관리 화면의 최소 폭이 걸리지 않는다', async ({ page }) => {
    // 관리 화면 표는 min-width:760px 입니다. 그 값이 새면 좁은 화면에서
    // 훨씬 많이 넘치고, 가로 스크롤 컨테이너의 의미가 사라집니다.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/ko/legal/shipping');
    const minWidth = await page
      .locator('.dataTable')
      .first()
      .evaluate((el) => getComputedStyle(el).minWidth);
    expect(minWidth).toBe('520px');
  });
});
