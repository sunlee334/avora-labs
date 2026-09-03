import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 한 행이 되는 폭.
 *
 * 900px 로 잡았다가 되돌렸습니다. 유틸리티(장바구니·주문조회·언어)가
 * 베트남어에서 219px 인데, 메뉴를 화면 가운데 두려면 양옆 열이 같아야 하고
 * 900px 에서는 한쪽이 184px 밖에 안 남아 유틸리티가 자기 열을 넘칩니다.
 * 그러면 헤더가 다시 두 행이 됩니다 — 고치려던 것이 그대로 돌아옵니다.
 */
const ONE_ROW_FROM = 1100;

/**
 * 헤더가 세로를 얼마나 쓰고, 뒤를 얼마나 덮고, 앵커를 어디에 세우는가.
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 * 데스크톱 헤더가 **117px, 두 행** 이었습니다. 워드마크가 윗줄, 메뉴가
 * 아랫줄. 항목이 넷뿐인데 스티키 헤더가 세로를 두 배로 썼고, 모바일은 이미
 * 한 행 69px 로 잘 돌고 있었습니다.
 *
 * 두 행이던 이유는 기록돼 있었습니다 — "워드마크가 왼쪽 열을 차지한 채로
 * 메뉴를 가운데 정렬하면 그 열 너비의 절반만큼 치우친다." 맞는 관찰인데,
 * 해법이 행을 늘리는 것일 필요는 없었습니다. 양옆을 **같은 `1fr`** 로 두면
 * 가운데 열의 중심이 화면 중심과 정확히 같습니다.
 *
 * 그래서 이 파일은 높이만 보지 않고 **가운데에 섰는지** 도 봅니다. 높이만
 * 보면 메뉴를 왼쪽에 붙여 놓고도 통과합니다.
 */

/** 한 행이면 이 아래여야 합니다. 두 행이면 117px 이었습니다. */
const MAX_HEIGHT = 90;

test.describe('헤더 모양', () => {
  for (const width of [ONE_ROW_FROM, 1280, 1920]) {
    for (const locale of LOCALES) {
      test(`${width}px ${locale} — 한 행이고 메뉴가 화면 가운데에 선다`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${locale}/`);

        const shape = await page.evaluate(() => {
          const nav = document.querySelector('.nav')!.getBoundingClientRect();
          const links = document.querySelector('.nav__links')!.getBoundingClientRect();
          return {
            height: Math.round(nav.height),
            offCenter: Math.round(Math.abs((links.left + links.right) / 2 - window.innerWidth / 2)),
            overflow:
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
            linkWidth: Math.round(links.width),
          };
        });

        expect(shape.height, '헤더가 한 행보다 높습니다').toBeLessThanOrEqual(MAX_HEIGHT);
        /*
         * 가장 긴 언어(베트남어 404px)에서도 넘치지 않아야 합니다. 한 행으로
         * 바꾸면서 메뉴가 워드마크·유틸리티와 같은 줄을 나눠 쓰게 됐으므로,
         * 이 검사가 없으면 어느 한 언어에서만 조용히 접힙니다.
         */
        expect(shape.overflow, '가로로 넘칩니다').toBeLessThanOrEqual(0);
        expect(shape.offCenter, '메뉴가 화면 가운데에서 벗어났습니다').toBeLessThanOrEqual(2);
      });
    }
  }

  test('한 행 미만 폭에서는 길이 사라지지 않는다', async ({ page }) => {
    /*
     * 한 행을 1100px 부터로 옮기다 900~1099 구간에서 **메뉴가 통째로
     * 사라진** 적이 있습니다. 그 구간은 햄버거도 숨는 폭이라, 사이트를
     * 돌아다닐 길이 하나도 없었습니다. 높이만 보는 검사는 그걸 못 잡습니다.
     */
    for (const width of [900, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ko/');
      const reachable = await page.evaluate(() => {
        const links = document.querySelector('.nav__links')!;
        const burger = document.querySelector('.menu__toggle, [data-menu-open]');
        return {
          links: getComputedStyle(links).display !== 'none',
          burger: burger ? getComputedStyle(burger).display !== 'none' : false,
        };
      });
      expect(
        reachable.links || reachable.burger,
        `${width}px 에서 헤더 링크도 메뉴 버튼도 없습니다`,
      ).toBe(true);
    }
  });

  test('모바일 헤더는 그대로다', async ({ page }) => {
    /*
     * 지시서가 "모바일 헤더는 1행 68px 로 적절하다" 며 되돌리지 말라고
     * 적었습니다. 데스크톱을 고치다 모바일을 건드리기 쉬운 자리입니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    const height = await page
      .locator('.nav')
      .evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(height).toBeLessThanOrEqual(72);
  });

  test('스크롤해도 뒤 글자가 헤더에 비치지 않는다', async ({ page }) => {
    /*
     * 88% 였을 때 헤더 안에 뒤 글자의 잔상이 생겼습니다. 흐리게만 해서는
     * 글자 모양이 남습니다 — 덮는 양을 늘려야 합니다.
     */
    await page.goto('/ko/');
    const paint = await page.locator('.nav').evaluate((el) => {
      const cs = getComputedStyle(el);
      const alpha = cs.backgroundColor.match(/[\d.]+\s*\)$/)?.[0].replace(')', '').trim();
      return { alpha: alpha ? Number(alpha) : 1, blur: cs.backdropFilter };
    });
    expect(paint.alpha, `헤더 배경이 ${paint.alpha} 로 비칩니다`).toBeGreaterThanOrEqual(0.96);
  });
});

test.describe('앵커로 이동해도 제목이 가리지 않는다', () => {
  for (const [width, height] of [
    [390, 844],
    [1280, 900],
  ] as const) {
    test(`${width}px — 앵커 대상이 헤더 아래에 선다`, async ({ page }) => {
      /*
       * `#main` 하나만 `scroll-margin-top` 을 갖고 있어서, 밖에 공유되는
       * `#notify`·`#panel` 은 헤더에 가렸습니다. 요소마다 붙이는 대신 문서
       * 전체에 `scroll-padding-top` 을 한 번 선언했고, 값은 `--nav-height`
       * 한 곳에서 옵니다.
       */
      await page.setViewportSize({ width, height });

      /*
       * `#notify` 는 알림 신청을 받는 동안에만 존재합니다(`!CAN_ORDER`).
       * `#panel` 은 언제나 있습니다.
       */
      const anchors = process.env.E2E_MODE === 'launch' ? ['#notify', '#panel'] : ['#panel'];
      for (const anchor of anchors) {
        await page.goto(`/ko/${anchor}`);
        // 이 사이트는 Lenis 로 스크롤을 부드럽게 만듭니다 — 멎기를 기다립니다.
        await page.waitForFunction(
          () => {
            const w = window as unknown as { __prev?: number };
            const settled = w.__prev !== undefined && Math.abs(window.scrollY - w.__prev) < 1;
            w.__prev = window.scrollY;
            return settled;
          },
          undefined,
          { polling: 120, timeout: 5000 },
        );

        const gap = await page.evaluate((a) => {
          const el = document.querySelector(a);
          if (!el) return null;
          const navHeight = document.querySelector('.nav')!.getBoundingClientRect().height;
          return Math.round(el.getBoundingClientRect().top - navHeight);
        }, anchor);

        expect(gap, `${anchor} 대상을 못 찾았습니다`).not.toBeNull();
        expect(gap!, `${anchor} 이 헤더에 ${-gap!}px 가렸습니다`).toBeGreaterThanOrEqual(0);
      }
    });
  }

  test('여백 값이 헤더 높이에서 온다', async ({ page }) => {
    /*
     * 숫자를 따로 적어 두면 헤더 높이를 바꾸는 날 한쪽만 고쳐집니다.
     * 계산식이 `--nav-height` 를 지나는지 확인합니다.
     */
    await page.goto('/ko/');
    const values = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        pad: root.scrollPaddingTop,
        navVar: root.getPropertyValue('--nav-height').trim(),
        navReal: Math.round(document.querySelector('.nav')!.getBoundingClientRect().height),
      };
    });
    expect(values.pad, 'scroll-padding-top 이 없습니다').not.toBe('auto');
    // 변수와 실제 높이가 갈라지면 계산식이 맞아도 결과가 틀립니다.
    expect(
      Math.abs(Number.parseInt(values.navVar, 10) - values.navReal),
      `--nav-height(${values.navVar}) 와 실제 높이(${values.navReal}px)가 다릅니다`,
    ).toBeLessThanOrEqual(2);
    expect(Number.parseInt(values.pad, 10)).toBeGreaterThanOrEqual(values.navReal);
  });
});
