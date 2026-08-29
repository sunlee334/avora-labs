import { test, expect, type Page } from '@playwright/test';
import { visibleTop, allLeaves, menuDestinations } from '../../src/config/nav';
import { LOCALES } from '../../src/config/site';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import commerce from '../../src/config/commerce.json' with { type: 'json' };

/**
 * 데스크톱 헤더 — 두 행, 드롭다운, 그리고 **정의가 한 곳이라는 증명**.
 *
 * ── 왜 뷰포트를 매번 지정하는가 ────────────────────────────
 * 이 파일은 `tests/e2e/` 루트에 있어 `mobile`(iPhone 14, WebKit, 390px)
 * 프로젝트에서도 돕니다. 그 폭에서 `.nav__links` 는 `display: none` 이라,
 * 뷰포트를 지정하지 않으면 **아무것도 검사하지 않은 채 통과** 합니다.
 * 그래도 mobile 에서 도는 것을 버리지 않습니다 — WebKit 드롭다운 커버리지가
 * 거기서만 나옵니다.
 */

const MODE = (process.env.E2E_MODE ?? 'commerce') as 'commerce' | 'launch';

/**
 * 앱의 게이트 유도를 그대로 옮깁니다.
 *
 * `accounts` 를 `commerce.json` 에서 바로 읽으면 안 됩니다 — commerce 모드는
 * `playwright.config.ts:20` 이 `PUBLIC_ACCOUNTS=on` 을 주므로 앱이 그 파일을
 * 보지 않습니다. 오늘은 두 값이 우연히 같지만, 설정을 내리면 앱은 옳은데
 * 이 테스트만 빨개집니다.
 */
const FLAGS = {
  checkout: MODE === 'commerce',
  accounts: MODE === 'commerce' ? true : commerce.accounts.enabled,
};

/** localePath 규칙(`i18n/index.ts:32`)을 여기서 재현합니다 — 그 모듈은 스펙에서 로드되지 않습니다. */
function href(lang: string, path: string): string {
  return `/${lang}/${path.replace(/^\//, '')}`.replace(/\/$/, '') || `/${lang}`;
}

async function desktop(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
}

test.describe('헤더 최상위', () => {
  test.beforeEach(async ({ page }) => desktop(page));

  test('최상위는 정확히 3개이고 순서가 정해져 있다', async ({ page }) => {
    await page.goto('/ko/');
    const items = page.locator('.nav__links > li');
    await expect(items).toHaveCount(3);
    expect(await items.allInnerTexts().then((t) => t.map((s) => s.trim()))).toEqual([
      '제품',
      '브랜드',
      '고객센터',
    ]);
  });

  test('5개 언어 전부 라벨이 비어 있지 않다', async ({ page }) => {
    for (const lang of LOCALES) {
      await page.goto(`/${lang}/`);
      const labels = await page.locator('.nav__links > li').allInnerTexts();
      expect(labels, `${lang}: 최상위가 3개가 아닙니다`).toHaveLength(3);
      expect(
        labels.filter((l) => !l.trim()),
        `${lang}: 빈 라벨이 있습니다`,
      ).toEqual([]);
    }
  });

  test('900px 에서 5개 언어 모두 헤더가 가로로 넘치지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    for (const lang of LOCALES) {
      await page.goto(`/${lang}/`);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `${lang}: 헤더가 ${over}px 넘칩니다`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('한 항목 규칙', () => {
  test.beforeEach(async ({ page }) => desktop(page));

  test('하위가 하나뿐인 최상위에는 화살표가 없다', async ({ page }) => {
    await page.goto('/ko/');
    for (const id of ['product', 'brand']) {
      const label = visibleTop(FLAGS).find((top) => top.id === id)!.label(ko as never);
      const li = page.locator('.nav__links > li', { hasText: label });
      await expect(li.locator('.nav__caret'), `${id}: 화살표가 있습니다`).toHaveCount(0);
    }
  });

  test('하위가 여럿인 최상위에는 화살표가 있다', async ({ page }) => {
    // 이것이 없으면 위 테스트는 캐럿을 아예 렌더하지 않아도 만점 통과합니다.
    await page.goto('/ko/');
    const li = page.locator('.nav__links > li', { hasText: '고객센터' });
    await expect(li.locator('.nav__caret')).toHaveCount(1);
  });

  test('하나뿐인 것을 누르면 서랍이 아니라 그 페이지로 간다', async ({ page }) => {
    await page.goto('/ko/');
    const li = page.locator('.nav__links > li', { hasText: '제품' });
    // 이동 **전** 에 봅니다 — 이동 후에는 문서가 새로 그려져 자명하게 0 입니다.
    await expect(li.locator('[data-nav-drop]')).toHaveCount(0);
    await expect(li.locator('a[href="/ko/product"]')).toHaveCount(1);
    await li.locator('a').click();
    await expect(page).toHaveURL(/\/ko\/product\/?$/);
  });
});

test.describe('드롭다운', () => {
  test.beforeEach(async ({ page }) => desktop(page));

  test('열면 정의에 있는 하위가 그대로 나온다', async ({ page }) => {
    /*
     * 개수를 여기 적지 않습니다.
     *
     * 예전에는 3 과 "리뷰가 있다" 를 박아 두었는데, 리뷰에 게이트가 생겨
     * 팔 수 없는 빌드에서는 2 가 됐습니다. 값을 베껴 적으면 "정의가
     * 바뀌었다" 와 "화면이 정의와 어긋난다" 가 구분되지 않습니다.
     */
    const group = visibleTop(FLAGS).find((top) => top.kind === 'group');
    expect(group, '하위가 여럿인 묶음이 없습니다').toBeTruthy();
    const expected = group!.kind === 'group' ? group!.children : [];

    await page.goto('/ko/');
    await page.locator('[data-nav-drop]').click();
    const panel = page.locator('.nav__dropdown');
    await expect(panel).toBeVisible();
    await expect(panel.locator('a')).toHaveCount(expected.length);
    for (const leaf of expected) {
      await expect(
        panel.locator(`a[href="${href('ko', leaf.path)}"]`),
        `${leaf.id} 이 서랍에 없습니다`,
      ).toBeVisible();
    }
  });

  test('Esc 로 닫히고 포커스가 트리거로 돌아온다', async ({ page }) => {
    await page.goto('/ko/');
    const trigger = page.locator('[data-nav-drop]');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
  });

  test('키보드만으로 열고 닫는다', async ({ page }) => {
    await page.goto('/ko/');
    test.skip(!(await finePointer(page)), '마우스가 없는 기기입니다');
    const trigger = page.locator('[data-nav-drop]');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.nav__dropdown')).toBeVisible();
  });

  /*
   * hover 는 마우스가 있는 기기에서만 걸립니다. mobile 프로젝트는
   * iPhone 14(hasTouch) 라 `pointer: fine` 이 거짓이고, 그 폭에서 아래
   * 단언들은 **실패하는 것이 옳습니다** — 손가락이 스치는 것으로 메뉴가
   * 열리면 안 되기 때문입니다. 그래서 건너뜁니다.
   */
  const finePointer = (page: Page) =>
    page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches);

  test('마우스를 올리면 열린다', async ({ page }) => {
    await page.goto('/ko/');
    test.skip(!(await finePointer(page)), '마우스가 없는 기기입니다');
    const trigger = page.locator('[data-nav-drop]');
    await page.locator('.nav__group').hover();
    await expect(page.locator('.nav__dropdown')).toBeVisible();
    // 눈에 보이는 것과 보조기술이 듣는 것이 어긋나면 안 됩니다.
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  test('패널로 마우스를 옮겨도 닫히지 않는다', async ({ page }) => {
    // 이벤트를 버튼에 걸면 패널로 가는 순간 버튼을 벗어나 닫힙니다.
    // 패널이 <li> 안에 있으므로 <li> 에 걸어야 합니다.
    await page.goto('/ko/');
    test.skip(!(await finePointer(page)), '마우스가 없는 기기입니다');
    await page.locator('.nav__group').hover();
    await page.locator('.nav__dropdown a').first().hover();
    await expect(page.locator('.nav__dropdown a').first()).toBeVisible();
  });

  test('벗어나면 닫힌다', async ({ page }) => {
    await page.goto('/ko/');
    test.skip(!(await finePointer(page)), '마우스가 없는 기기입니다');
    await page.locator('.nav__group').hover();
    await expect(page.locator('.nav__dropdown')).toBeVisible();
    await page.locator('.nav__wordmark').hover();
    await expect(page.locator('.nav__dropdown')).toBeHidden();
    await expect(page.locator('[data-nav-drop]')).toHaveAttribute('aria-expanded', 'false');
  });

  test('키보드로 연 것은 마우스가 스쳐도 유지된다', async ({ page }) => {
    // hover 는 보조 수단입니다. 키보드로 연 것을 마우스가 지나가며 닫으면
    // 키보드 사용자가 자기가 연 것을 잃습니다.
    await page.goto('/ko/');
    const trigger = page.locator('[data-nav-drop]');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.locator('.nav__group').hover();
    await page.locator('.nav__wordmark').hover();
    await expect(page.locator('.nav__dropdown')).toBeVisible();
  });

  test('올려서 열린 것을 눌러도 닫히지 않는다', async ({ page }) => {
    // 마우스가 트리거에 닿는 순간 mouseenter 가 이미 열었습니다. 클릭이
    // 토글이면 "보이길래 눌렀더니 사라지는" 상태가 됩니다.
    await page.goto('/ko/');
    test.skip(!(await finePointer(page)), '마우스가 없는 기기입니다');
    await page.locator('.nav__group').hover();
    await expect(page.locator('.nav__dropdown')).toBeVisible();
    await page.locator('[data-nav-drop]').click();
    await expect(page.locator('.nav__dropdown')).toBeVisible();
  });

  test('눌렀다가 마우스를 치우면 닫힌다', async ({ page }) => {
    // 클릭도 버튼에 포커스를 줍니다. mouseleave 가 activeElement 를 보면
    // 클릭 뒤에는 영영 안 닫힙니다 — :focus-visible 로 키보드 포커스만
    // 걸러야 합니다. 운영에서 실제로 났던 결함입니다.
    await page.goto('/ko/');
    test.skip(!(await finePointer(page)), '마우스가 없는 기기입니다');
    await page.locator('.nav__group').hover();
    await page.locator('[data-nav-drop]').click();
    await expect(page.locator('.nav__dropdown')).toBeVisible();
    await page.locator('.nav__wordmark').hover();
    await expect(page.locator('.nav__dropdown')).toBeHidden();
  });

  test('열린 상태로 5개 언어 × 두 폭에서 넘치지 않는다', async ({ page }) => {
    // AC-3 은 **닫힌** 상태만 봅니다. left:0 이면 여기서 최대 133.7px 넘칩니다.
    for (const width of [900, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const lang of LOCALES) {
        await page.goto(`/${lang}/`);
        await page.locator('[data-nav-drop]').click();
        const box = await page.locator('.nav__dropdown').boundingBox();
        expect(box, `${lang}@${width}: 패널이 없습니다`).not.toBeNull();
        expect(
          box!.x + box!.width,
          `${lang}@${width}: 패널이 뷰포트를 ${Math.round(box!.x + box!.width - width)}px 넘습니다`,
        ).toBeLessThanOrEqual(width);
      }
    }
  });
});

test.describe('유틸리티 줄', () => {
  test.beforeEach(async ({ page }) => desktop(page));

  test('기본 메뉴와 다른 줄에 있다', async ({ page }) => {
    await page.goto('/ko/');
    const util = await page.locator('.nav__utility').boundingBox();
    const links = await page.locator('.nav__links').boundingBox();
    expect(util, '유틸리티 줄이 없습니다').not.toBeNull();
    expect(util!.y, '유틸리티가 기본 메뉴보다 아래에 있습니다').toBeLessThan(links!.y);
  });

  test('주문조회는 자사 결제일 때만 나온다', async ({ page }) => {
    await page.goto('/ko/');
    const lookup = page.locator('.nav__utility a[href="/ko/order/lookup"]');
    await expect(lookup).toHaveCount(FLAGS.checkout ? 1 : 0);
  });

  test('헤더 안 누를 수 있는 것이 전부 44px 이상이다', async ({ page }) => {
    // 이 저장소의 44px 검사는 전부 390px 전용이라 데스크톱 전용 행은 무감시였습니다.
    await page.goto('/ko/');
    const small: string[] = [];
    for (const el of await page.locator('.nav a, .nav button').all()) {
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      if (!box) continue;
      if (box.height < 44) small.push(`${(await el.innerText()).trim()} ${Math.round(box.height)}px`);
    }
    expect(small, `44px 미만: ${small.join(', ')}`).toEqual([]);
  });

  test('메뉴가 화면 중앙에 있다', async ({ page }) => {
    // 워드마크가 왼쪽 열을 차지한 채 justify-self: center 를 주면 그 열
    // 너비의 절반(47px)만큼 늘 치우칩니다. 메뉴 줄이 두 열을 다 써야 합니다.
    for (const width of [900, 1280, 1600]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ko/');
      const off = await page.evaluate(() => {
        const box = document.querySelector('.nav__links')!.getBoundingClientRect();
        return Math.round(box.left + box.width / 2) - Math.round(window.innerWidth / 2);
      });
      expect(Math.abs(off), `${width}px: 중앙에서 ${off}px 치우쳤습니다`).toBeLessThanOrEqual(1);
    }
  });

  test('<nav> 는 여전히 하나다', async ({ page }) => {
    await page.goto('/ko/');
    await expect(page.locator('nav')).toHaveCount(1);
  });
});

test.describe('언어 패널이 헤더를 덮지 않는다', () => {
  test('패널이 헤더 아래에서 시작한다', async ({ page }) => {
    // .lang__sheet 의 inset 이 74px 하드코딩이었습니다. 헤더가 두 행이 되면
    // 패널이 헤더 **안쪽** 에 떠서 기본 메뉴 줄을 덮습니다. 기존 i18n.spec.ts 는
    // 보임/숨김과 Esc 만 보고 좌표 단언이 한 줄도 없어 이것을 못 잡습니다.
    await desktop(page);
    await page.goto('/ko/');
    await page.locator('[data-lang-open]').click();
    const nav = await page.locator('.nav').boundingBox();
    const sheet = await page.locator('.lang__sheet').boundingBox();
    expect(sheet!.y, '언어 패널이 헤더를 덮습니다').toBeGreaterThanOrEqual(nav!.y + nav!.height - 1);
  });

  test('--nav-height 토큰이 실제 헤더 높이와 같다', async ({ page }) => {
    // 손으로 적은 상수라 낡을 수 있습니다. 낡으면 위 패널이 조용히 어긋납니다.
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ko/');
      const { token, actual } = await page.evaluate(() => ({
        token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')),
        actual: document.querySelector('.nav')!.getBoundingClientRect().height,
      }));
      expect(Math.abs(token - actual), `${width}px: 토큰 ${token} vs 실제 ${actual}`).toBeLessThan(1.5);
    }
  });
});

test.describe('브랜드 항목이 스토리까지 데려간다', () => {
  test('다른 페이지에서 눌러도 헤더에 가리지 않는다', async ({ page }) => {
    // 저장소에 scroll-margin/scroll-padding 선언이 0건이었습니다. 헤더가
    // 117px 이 되면 착지가 29px 가려집니다 — 고침이 없으면 음수가 됩니다.
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ko/product');
      // 헤더 링크는 900px 이상에서만 보입니다. 여기서 보는 것은 **착지** 이지
      // 클릭 경로가 아니므로(그쪽은 단일 출처 테스트가 덮습니다) 같은 주소로
      // 바로 이동합니다 — 브랜드 항목이 하는 일과 글자 단위로 같습니다.
      await page.evaluate(() => {
        location.href = '/ko/#story';
      });
      await page.waitForLoadState('load');
      await page.waitForTimeout(700);
      const top = await page.evaluate(() => {
        const first = document.querySelector('#story > *');
        return first ? first.getBoundingClientRect().top : NaN;
      });
      const navH = await page.evaluate(
        () => document.querySelector('.nav')!.getBoundingClientRect().height,
      );
      expect(top, `${width}px: 스토리 내용이 헤더에 ${Math.round(navH - top)}px 가립니다`).toBeGreaterThanOrEqual(navH - 1);
    }
  });
});

/**
 * 축 1 — 정의가 한 곳이라는 증명.
 *
 * 테스트가 `src/config/nav.ts` 를 **직접 import** 해서 세 화면의 렌더 결과와
 * 대조합니다. 정의 파일에 잎을 하나 더하면 기대집합이 늘고, 세 화면 중
 * 하나라도 반영하지 않으면 실제집합이 안 늘어 여기가 빨개집니다.
 *
 * 집합으로 비교합니다 — `toEqual` 은 배열 순서에 민감해서, 순전히 시각적인
 * 재배치만으로 "단일 출처가 깨졌다" 로 읽히는 실패를 냅니다. 순서가
 * 요구사항인 곳(최상위 3개)은 위에서 따로 봅니다.
 */
test.describe('정의는 한 곳이다', () => {
  const expected = [...new Set(menuDestinations(FLAGS).map((l) => href('ko', l.path)))].sort();

  test('헤더가 정의된 목적지를 그대로 낸다', async ({ page }) => {
    await desktop(page);
    await page.goto('/ko/');
    const actual = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLAnchorElement>('.nav__links a, .nav__utility a'),
      ].map((a) => new URL(a.href).pathname + new URL(a.href).hash),
    );
    expect([...new Set(actual)].sort()).toEqual(expected);
  });

  test('시트가 정의된 목적지를 그대로 낸다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/ko/');
    await page.locator('[data-menu-open]').click();
    // 모든 묶음을 펼칩니다 — live locator 라 인덱스 순회는 밀립니다.
    for (let guard = 0; guard < 10; guard++) {
      const closed = page.locator('.menu__sheet [aria-expanded="false"]');
      if ((await closed.count()) === 0) break;
      await closed.first().click();
    }
    const actual = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('.menu__sheet a[href]')].map(
        (a) => new URL(a.href).pathname + new URL(a.href).hash,
      ),
    );
    expect([...new Set(actual)].sort()).toEqual(expected);
  });

  test('푸터가 정의된 목적지를 그대로 낸다', async ({ page }) => {
    await page.goto('/ko/');
    const actual = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('[data-footer-menu] a')].map(
        (a) => new URL(a.href).pathname + new URL(a.href).hash,
      ),
    );
    expect([...new Set(actual)].sort()).toEqual(expected);
  });

  test('세 화면이 서로 같다 — 하나만 고쳐도 셋이 따라온다', async ({ page }) => {
    // allLeaves() 가 정의 파일의 잎 전부입니다. 셋 다 이것을 담고 있어야
    // "한 파일만 고치면 세 화면에 반영된다"(AC-24)가 사실이 됩니다.
    expect(allLeaves(FLAGS).length).toBeGreaterThan(0);
    await page.goto('/ko/');
    for (const leaf of allLeaves(FLAGS)) {
      const target = href('ko', leaf.path);
      await expect(
        page.locator(`[data-footer-menu] a[href="${target}"]`),
        `푸터에 ${target} 이 없습니다`,
      ).toHaveCount(1);
    }
  });
});
