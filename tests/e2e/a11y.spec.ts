import { test, expect } from '@playwright/test';
import { scanA11y } from '../support/axe';

/**
 * 접근성 자동 검사 (axe-core).
 *
 * Lighthouse 접근성 점수가 100이어도 이 검사는 다른 것을 봅니다. Lighthouse 는
 * axe 규칙의 일부만 돌리고, **처음 그려진 화면만** 봅니다. 실제로 접근성이
 * 깨지는 곳은 대개 그 뒤입니다 — 열린 대화상자, 표시된 오류 메시지, 자바스크립트가
 * 채워 넣은 목록.
 *
 * 그래서 여기서는 정적 화면뿐 아니라 **움직인 뒤의 상태**도 함께 검사합니다.
 *
 * 자동 검사가 잡는 것은 접근성 문제의 일부(대략 3~4할)입니다. 통과했다고
 * 접근성이 확보된 것은 아니며, 키보드만으로 끝까지 갈 수 있는지 같은 것은
 * mobile-ux.spec.ts 가 따로 확인합니다.
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

/*
 * 규칙 목록과 첨부 처리는 `tests/support/axe.ts` 에 있습니다. 신청 시트는
 * `!CAN_ORDER` 일 때만 존재해 `tests/e2e/launch/` 에서만 검사할 수 있는데,
 * 이 파일은 두 모드에서 모두 돕니다 — 그래서 설정을 한 곳으로 옮겼습니다.
 */
const scan = scanA11y;

test.describe('검사기 자체', () => {
  test('일부러 깨뜨린 화면에서는 위반을 잡아낸다', async ({ page }, testInfo) => {
    // 위반이 0건이라는 결과는, 검사기가 실제로 도는 경우에만 의미가 있습니다.
    // 늘 통과하는 검사는 없는 것보다 나쁩니다 — 안전하다고 착각하게 만듭니다.
    await page.goto('/ko/');
    await page.evaluate(() => {
      const broken = document.createElement('img');   // alt 없음
      broken.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
      const input = document.createElement('input');  // 이름표 없음
      input.type = 'text';
      // append 가 아니라 appendChild — Workers 타입이 전역에 있어 append 가
      // Body.append 로 잡힙니다.
      document.body.appendChild(broken);
      document.body.appendChild(input);
    });

    const found = await scan(page, testInfo);
    expect(found.length, 'axe 가 아무것도 잡지 못하면 검사가 돌지 않는 것입니다').toBeGreaterThan(0);
    expect(found.map((v) => v.rule)).toContain('image-alt');
  });
});

/** 언어에 관계없이 같은 구조라, 전체 페이지는 한국어로 훑습니다. */
const KO_PAGES = [
  '',
  'brand',
  'product',
  'support',
  'reviews',
  'legal/terms',
  'legal/privacy',
  'legal/shipping',
  '404',
  'support/posts',
  // 마크다운 렌더 결과가 heading-order·대비 위반이 실제로 나는 자리입니다.
  'support/posts/shipping-notice',
];

test.describe('정적 화면', () => {
  for (const path of KO_PAGES) {
    test(`/ko/${path || '(홈)'}`, async ({ page }, testInfo) => {
      await page.goto(`/ko/${path}`);
      expect(await scan(page, testInfo)).toEqual([]);
    });
  }

  // 언어마다 글꼴·줄바꿈·lang 속성이 달라 대비와 구조가 어긋날 수 있습니다.
  for (const lang of ['en', 'zh', 'th', 'vi']) {
    test(`/${lang}/ 홈`, async ({ page }, testInfo) => {
      await page.goto(`/${lang}/`);
      expect(await scan(page, testInfo)).toEqual([]);
    });
  }
});

test.describe('움직인 뒤의 상태', () => {
  test('언어 선택 시트를 연 상태', async ({ page }, testInfo) => {
    // 대화상자는 초점 관리와 이름표가 없으면 스크린리더에서 길을 잃는 자리입니다.
    await page.goto('/ko/');
    await page.locator('[data-lang-open]').click();
    await expect(page.locator('[data-lang-sheet]')).toBeVisible();
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test('건너뛰기 링크에 초점이 간 상태', async ({ page }, testInfo) => {
    await page.goto('/ko/');
    await page.keyboard.press('Tab');
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test('데스크톱 드롭다운을 연 상태', async ({ page }, testInfo) => {
    // 900px 이상에서만 나오는 요소입니다. 뷰포트를 지정하지 않으면
    // mobile 프로젝트(390px)에서 display:none 이라 아무것도 검사하지
    // 않은 채 통과합니다.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await page.locator('[data-nav-drop]').click();
    await expect(page.locator('.nav__dropdown')).toBeVisible();
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test('모바일 메뉴의 묶음을 전부 펼친 상태', async ({ page }, testInfo) => {
    // 펼치기 전에는 하위 링크가 hidden 이라 axe 가 보지 않습니다.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await page.locator('[data-menu-open]').click();
    for (let guard = 0; guard < 10; guard++) {
      const closed = page.locator('.menu__sheet [aria-expanded="false"]');
      if ((await closed.count()) === 0) break;
      await closed.first().click();
    }
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test('모바일 메뉴를 연 상태', async ({ page }, testInfo) => {
    // 이 폭에서만 나오는 요소라, 데스크톱 크기로만 검사하면 아무도 보지 않습니다.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await page.locator('[data-menu-open]').click();
    await expect(page.locator('[data-menu-sheet]')).toBeVisible();
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test('언어 시트를 닫은 직후', async ({ page }, testInfo) => {
    // 닫을 때 초점이 갈 곳을 잃으면 키보드 사용자는 페이지 맨 위로 튕깁니다.
    await page.goto('/ko/');
    await page.locator('[data-lang-open]').click();
    await expect(page.locator('[data-lang-sheet]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-lang-sheet]')).toBeHidden();
    expect(await scan(page, testInfo)).toEqual([]);
  });

});
