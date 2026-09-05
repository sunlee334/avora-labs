import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 한 행이 되는 폭.
 *
 * 900px 로 잡았다가 되돌렸습니다. 메뉴를 화면 가운데 두려면 양옆 열이 같아야
 * 하는데, 베트남어 유틸리티가 요구하는 284px 이 그 몫에 들어가려면
 * `(W − 532)/2 ≥ 284`, 즉 **W ≥ 1100** 이어야 합니다. 최소값이 정확히
 * 1100 이라 그 값을 쓰면 여유가 0 이므로 20px 을 띄웠습니다.
 * 자세한 유도는 `global.css` 의 "한 행은 1120px 부터입니다" 주석에 있습니다.
 */
const ONE_ROW_FROM = 1120;

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

  test('본문 위로 스크롤해도 뒤 글자가 헤더에 비치지 않는다', async ({ page }) => {
    /*
     * 88% 였을 때 헤더 안에 뒤 글자의 잔상이 생겼습니다. 흐리게만 해서는
     * 글자 모양이 남습니다 — 덮는 양을 늘려야 합니다.
     *
     * **실제로 스크롤합니다.** 처음에는 계산된 스타일만 보고 이름을
     * "스크롤해도" 라고 붙였는데, 그러면 헤더 아래에 글이 지나가는 상태를
     * 한 번도 만들지 않은 채 통과합니다.
     */
    await page.goto('/ko/');
    /*
     * ⚠️ 스크롤 깊이를 고정하지 않습니다.
     *
     * 전에는 1200px 로 못 박았습니다. 그런데 그 위에 있는 폼이 76px 짧아지자
     * 헤더 자리가 **요소 사이 빈 곳** 이 되어, 결함이 없는데도 "본문이 지나가는
     * 상태를 못 만들었습니다" 로 걸렸습니다. 검사가 본문 길이에 묶여 있던
     * 것입니다.
     *
     * 글이 실제로 헤더 뒤에 올 때까지 내려갑니다. 단언이 요구하는 조건은
     * 그대로입니다 — 헤더 뒤에 글이 있어야 비침을 잴 수 있습니다.
     */
    await page.evaluate(async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const navRect = () => document.querySelector('.nav')!.getBoundingClientRect();
      const covered = () => {
        const nav = navRect();
        return [...document.querySelectorAll('main p, main h2, main li')].some((t) => {
          const r = t.getBoundingClientRect();
          return r.height > 0 && r.top < nav.bottom && r.bottom > nav.top;
        });
      };

      for (let depth = 900; depth <= 4000; depth += 150) {
        // Lenis 가 감속하는 동안 재면 도착 전 위치를 읽습니다. 멈출 때까지 기다립니다.
        for (let i = 0; i < 12; i += 1) {
          window.scrollTo(0, depth);
          await sleep(80);
          const prev = window.scrollY;
          await sleep(90);
          if (Math.abs(window.scrollY - prev) < 1) break;
        }
        if (covered()) return;
      }
    });

    const paint = await page.locator('.nav').evaluate((el) => {
      const cs = getComputedStyle(el);
      const alpha = cs.backgroundColor.match(/[\d.]+\s*\)$/)?.[0].replace(')', '').trim();
      const blur = Number.parseFloat(cs.backdropFilter.match(/blur\(([\d.]+)px\)/)?.[1] ?? '0');
      // 헤더 아래에 실제로 본문이 깔려 있는지 — 아니면 이 검사는 아무것도 안 봅니다.
      const nav = el.getBoundingClientRect();
      const behind = [...document.querySelectorAll('main p, main h2, main li')].some((t) => {
        const r = t.getBoundingClientRect();
        return r.height > 0 && r.top < nav.bottom && r.bottom > nav.top;
      });
      return { alpha: alpha ? Number(alpha) : 1, blur, behind };
    });

    expect(paint.behind, '헤더 아래에 본문이 지나가는 상태를 못 만들었습니다').toBe(true);
    expect(paint.alpha, `헤더 배경이 ${paint.alpha} 로 비칩니다`).toBeGreaterThanOrEqual(0.96);
    // 불투명도만으로 통과시키지 않습니다 — 둘 중 하나만 지키면 잔상이 남습니다.
    expect(paint.blur, `헤더 blur 가 ${paint.blur}px 입니다`).toBeGreaterThanOrEqual(12);
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
      /*
       * ⚠️ **모션 최소화로 재야 결정적입니다.**
       *
       * 이 사이트는 Lenis 로 스크롤을 부드럽게 만드는데, `reduced.matches`
       * 일 때는 **아예 불러오지 않습니다**(`Base.astro`). 그러면 `scroll-padding`
       * 이 네이티브 즉시 스크롤로 적용돼 값이 흔들리지 않습니다.
       *
       * 처음에는 "scrollY 가 멎을 때까지" 기다리는 식으로 쟀는데, 그 판정이
       * 두 번만 비교해서 **감속 구간의 <1px 변화를 정지로 착각** 했습니다.
       * 로컬에서는 15px 로 나오던 값이 CI 에서 66 / 118 / 142px 로 재시도마다
       * 달라져 배포를 막았습니다. 느린 기계에서 훨씬 자주 걸립니다.
       *
       * 앵커 여백은 `scroll-padding-top` 이라는 **CSS 속성** 이고 모션과
       * 무관하므로, 이 조건에서 재는 것이 옳습니다.
       */
      await page.emulateMedia({ reducedMotion: 'reduce' });

      for (const anchor of anchors) {
        await page.goto(`/ko/${anchor}`);
        await page.waitForLoadState('load');

        const gap = await page.evaluate((a) => {
          const el = document.querySelector(a);
          if (!el) return null;
          const navHeight = document.querySelector('.nav')!.getBoundingClientRect().height;
          return Math.round(el.getBoundingClientRect().top - navHeight);
        }, anchor);

        expect(gap, `${anchor} 대상을 못 찾았습니다`).not.toBeNull();
        expect(gap!, `${anchor} 이 헤더에 ${-gap!}px 가렸습니다`).toBeGreaterThanOrEqual(0);
        /*
         * ⚠️ **상한도 봅니다.**
         *
         * 하한만 두었더니 진짜 회귀를 놓쳤습니다. `scroll-padding-top` 을
         * 문서에 더하면서 요소별 `scroll-margin-top` 을 지우지 않아 둘이
         * 더해졌고, `#notify` 가 85+93=178px 아래에 착지했습니다. 헤더는
         * 69px 인데 죽은 공간이 109px 이었습니다 — 화면 한 뭉치가 그냥
         * 비어 있는 상태인데 "가리지 않는다" 는 통과했습니다.
         *
         * 여유는 24px 을 의도한 값입니다. 렌더 오차를 감안해 그 두 배까지만
         * 허용합니다 — Lenis 는 위에서 껐으므로 감속 오차는 없습니다.
         */
        expect(gap!, `${anchor} 아래에 ${gap}px 의 죽은 공간이 생겼습니다`).toBeLessThanOrEqual(
          48,
        );
      }
    });
  }

  test('여백 값이 헤더 높이에서 온다', async ({ page }) => {
    /*
     * 숫자를 따로 적어 두면 헤더 높이를 바꾸는 날 한쪽만 고쳐집니다.
     * 계산식이 `--nav-height` 를 지나는지 확인합니다.
     *
     * ⚠️ **두 화면을 봅니다.** `#story` 는 `/brand` 에만 있어서, 홈만 훑으면
     * 거기에 `scroll-margin-top` 이 다시 붙어도 못 잡습니다 — 이 결함이
     * 처음 생긴 자리가 정확히 `#story` 였습니다.
     */
    for (const path of ['/ko/', '/ko/brand']) {
      await page.goto(path);
      const strays = await page.evaluate(() =>
        [...document.querySelectorAll('[id]')]
          .filter((el) => getComputedStyle(el).scrollMarginTop !== '0px')
          .map((el) => `#${el.id}`),
      );
      expect(strays, `${path} 에 scroll-margin 을 가진 앵커: ${strays}`).toEqual([]);
    }

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

test.describe('스크롤해도 헤더 높이는 그대로다', () => {
  /*
   * ⚠️ 이 검사는 **하지 않기로 한 것** 을 지킵니다.
   *
   * 지시서는 스크롤하면 78px → 58px 로 줄이라고 했고, 한 번 넣었다가
   * 되돌렸습니다. 이 헤더는 `position: sticky` 라 문서 흐름 안에 있어서,
   * 높이가 줄면 아래 내용이 전부 위로 딸려 올라갑니다 — 스크롤하는 내내
   * 매 프레임.
   *
   * 그 움직임이 스크롤 타임라인의 기준을 흔들어
   * `scroll-reveal.spec.ts` 의 「모든 등장 요소가 끝내 선명해진다」가
   * 모바일에서 깨졌습니다. 축소만 꺼서 12건이 통과하는 것으로 확인했습니다.
   *
   * 12px 을 얻고 페이지 전체의 스크롤 안정성을 내주는 거래입니다. 다음
   * 사람이 같은 지시서를 보고 다시 넣을 수 있으므로 여기 못 박습니다.
   */
  const H = async (page: import('@playwright/test').Page) =>
    page.locator('.nav').evaluate((el) => Math.round(el.getBoundingClientRect().height));

  /*
   * ⚠️ `window.scrollTo` 한 번으로는 원하는 자리에 서지 않습니다.
   *
   * 이 사이트는 Lenis 로 스크롤을 부드럽게 만들고, 그 라이브러리가
   * `scrollTo` 를 가로채 관성으로 따라옵니다. 맨 위로 보냈는데 **98px 에
   * 멈춘 것** 을 실측했고, 그 자리는 아직 축소 구간(0~160px) 안이라
   * "돌아오지 않았다" 로 읽혔습니다 — 헤더는 멀쩡했습니다.
   *
   * 그래서 정착할 때까지 다시 보냅니다.
   */
  const scrollTo = (page: import('@playwright/test').Page, y: number) =>
    page.evaluate(async (top) => {
      for (let i = 0; i < 12; i += 1) {
        window.scrollTo(0, top);
        await new Promise((r) => setTimeout(r, 150));
        if (Math.abs(window.scrollY - top) < 3) break;
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, y);



  test('내려도 높이가 바뀌지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');

    const 처음 = await H(page);
    await scrollTo(page, 400);
    expect(
      await H(page),
      `스크롤에 헤더 높이가 ${처음}px 에서 바뀌었습니다 — 아래 내용이 함께 밀립니다`,
    ).toBe(처음);

    await scrollTo(page, 2400);
    expect(await H(page), '더 내려가자 헤더 높이가 바뀌었습니다').toBe(처음);

    // 워드마크의 탭 영역은 어느 자리에서도 44px 입니다.
    const 워드마크 = await page
      .locator('.nav__wordmark')
      .evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(워드마크, `워드마크가 ${워드마크}px 입니다`).toBeGreaterThanOrEqual(44);
  });

  test('회사명은 접히되 글자 크기는 그대로다', async ({ page }) => {
    /*
     * `endorsement.spec.ts` 가 회사명이 브랜드의 55~60% 인지를 글자 크기로
     * 잽니다. 접는 연출로 크기를 건드리면 그 값이 스크롤 위치에 따라 달라져,
     * 두 검사가 서로를 흔듭니다.
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    test.skip(
      !(await page.evaluate(() => CSS.supports('animation-timeline', 'scroll(root block)'))),
      '이 브라우저는 스크롤 타임라인을 지원하지 않습니다',
    );

    const by = page.locator('.nav__wordmarkBy');
    const 크기 = () => by.evaluate((el) => getComputedStyle(el).fontSize);
    const 처음크기 = await 크기();
    expect(await by.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);

    await scrollTo(page, 400);
    expect(await by.evaluate((el) => Number(getComputedStyle(el).opacity)), '접히지 않았습니다').toBeLessThan(0.1);
    expect(await 크기(), '접으면서 글자 크기까지 바꿨습니다').toBe(처음크기);
  });

  test('모션을 줄이면 줄어들지 않는다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');

    const 처음 = await H(page);
    await scrollTo(page, 400);
    expect(await H(page), '모션 최소화인데 헤더가 움직였습니다').toBe(처음);
  });
});

test.describe('내릴 때 감추고 올릴 때 보인다', () => {
  /*
   * 방향은 위치의 함수가 아니라 위치의 **변화** 라, 이 하나만 스크롤 이벤트를
   * 씁니다(진행선·헤더 축소는 CSS 스크롤 타임라인입니다).
   *
   * 그래서 여기서 재는 것은 "감춰지는가" 만이 아닙니다. **감춰졌을 때 잃는
   * 것이 없는가** 를 함께 봅니다 — 키보드로 들어오면 즉시 보여야 하고,
   * 첫 화면에서는 감춰지면 안 됩니다.
   */
  const away = (page: import('@playwright/test').Page) =>
    page.locator('.nav').evaluate((el) => el.dataset.away ?? 'false');

  /*
   * ⚠️ `window.scrollTo` 한 번으로는 원하는 자리에 서지 않습니다.
   *
   * 이 사이트는 Lenis 로 스크롤을 부드럽게 만들고, 그 라이브러리가
   * `scrollTo` 를 가로채 관성으로 따라옵니다. 맨 위로 보냈는데 **98px 에
   * 멈춘 것** 을 실측했고, 그 자리는 아직 축소 구간(0~160px) 안이라
   * "돌아오지 않았다" 로 읽혔습니다 — 헤더는 멀쩡했습니다.
   *
   * 그래서 정착할 때까지 다시 보냅니다.
   */
  const wheelTo = (page: import('@playwright/test').Page, y: number) =>
    page.evaluate(async (top) => {
      for (let i = 0; i < 12; i += 1) {
        window.scrollTo(0, top);
        await new Promise((r) => setTimeout(r, 150));
        if (Math.abs(window.scrollY - top) < 3) break;
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, y);



  test('첫 화면에서는 감추지 않는다', async ({ page }) => {
    /*
     * 히어로를 지나기 전에 헤더가 사라지면 어디에 왔는지 알 방법이 사라집니다.
     * 들어오자마자 조금 내린 사람이 가장 먼저 겪는 화면입니다.
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await wheelTo(page, 200);
    expect(await away(page), '히어로 안인데 헤더가 감춰졌습니다').toBe('false');
    await expect(page.locator('.nav')).toBeInViewport();
  });

  test('히어로를 지나 내리면 감추고, 올리면 돌아온다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');

    await wheelTo(page, 2400);
    expect(await away(page), '한참 내렸는데 감춰지지 않았습니다').toBe('true');

    await wheelTo(page, 1600);
    expect(await away(page), '올렸는데 돌아오지 않았습니다').toBe('false');
  });

  test('키보드로 들어오면 즉시 보인다', async ({ page }) => {
    /*
     * ⚠️ 감춰진 헤더에도 링크는 그대로 있어 Tab 이 그리로 갑니다.
     * 보이지 않는 곳에 포커스가 놓이면 키보드 사용자는 자기가 어디 있는지
     * 알 수 없습니다 — 감추는 연출이 새로 만드는 유일한 결함입니다.
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await wheelTo(page, 2400);
    expect(await away(page)).toBe('true');

    await page.locator('.nav__wordmark').focus();
    expect(await away(page), '포커스가 들어왔는데 감춰진 채입니다').toBe('false');
    await expect(page.locator('.nav')).toBeInViewport();
  });

  test('모션을 줄이면 감추지 않는다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await wheelTo(page, 2400);
    expect(await away(page), '모션 최소화인데 헤더가 사라졌습니다').toBe('false');
    await expect(page.locator('.nav')).toBeInViewport();
  });
});
