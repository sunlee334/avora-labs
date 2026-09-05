import { test, expect } from '@playwright/test';
import { LOCALES, INDEXED_LOCALES } from '../../src/config/site';

/**
 * 레이아웃 — 컨테이너, 리듬, 배경 밴드.
 *
 * 이 층이 없어서 생긴 일이 세 가지로 보고됐습니다. "홈이 허전하다",
 * "브랜드 링크가 어색하다", "내용이 좌측으로 쏠린다". 셋 다 같은 누락에서
 * 나왔습니다 — 색과 컴포넌트는 정의돼 있었는데 그 사이의 레이아웃이 없었습니다.
 */

const PAGES = ['/ko/', '/ko/brand/', '/ko/product/'];

test.describe('컨테이너', () => {
  test('내용이 가운데 모이고, 배경 밴드는 화면을 채운다', async ({ page }) => {
    /*
     * 둘은 같은 요소에 걸려 있습니다(`<section class="section section--alt wrap">`).
     * `.wrap` 에 max-width 를 주면 섹션이 좁아지고 **배경까지 줄어듭니다** —
     * 처음에 그렇게 했다가 1440px 화면에서 교차 섹션 배경이 1120px 로
     * 잘렸습니다. 밴드는 전체 폭이고 내용만 가운데여야 합니다.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');

    const band = page.locator('.section--alt').first();
    const bandBox = (await band.boundingBox())!;
    expect(Math.round(bandBox.width), '배경 밴드가 화면을 채우지 않습니다').toBe(1440);

    const inner = (await band.locator('.display, h2, p.body').first().boundingBox())!;
    const leftGap = inner.x - bandBox.x;
    const rightGap = bandBox.x + bandBox.width - (inner.x + inner.width);

    // 좌우가 같아야 하고 —
    expect(Math.abs(leftGap - rightGap), `좌우 여백이 ${Math.round(leftGap)}/${Math.round(rightGap)}`).toBeLessThan(2);

    /*
     * — 화면이 컨테이너보다 넓으면 그 차이만큼 벌어져야 합니다.
     *
     * 대칭만 보면 부족합니다. 컨테이너 상한이 없어도 좌우 여백은 늘 같으니
     * (양쪽 다 48px) 검사가 통과합니다. 실제로 사보타주가 지나갔습니다.
     * 1440px 화면에서 1120px 컨테이너면 한쪽이 160px 이어야 합니다.
     */
    expect(
      Math.round(leftGap),
      `화면 1440px 인데 여백이 ${Math.round(leftGap)}px — 컨테이너 상한이 없습니다`,
    ).toBe(160);
  });

  test('헤드라인이 컨테이너를 넘지 않는다', async ({ page }) => {
    /*
     * 이게 "좌측으로 쏠려 보인다" 의 정체였습니다. 헤드라인은 블록이라 화면
     * 끝까지 늘어나고 본문은 65ch 에서 멈춰, 1440px 에서 상자의 오른쪽 끝이
     * 811px 어긋났습니다. 왼쪽은 맞는데 오른쪽이 들쭉날쭉하면 쏠려 보입니다.
     *
     * 상한을 걸어도 둘의 오른쪽 끝은 계속 다릅니다 — 본문에는 읽기 폭
     * 상한(65ch)이 따로 있고, 그건 없애면 안 되는 것입니다. 실제 **글자** 가
     * 끝나는 지점을 재면 차이는 93~102px 로, 문단마다 줄 끝이 다른 보통의
     * 흘림과 같은 크기입니다. 그래서 여기서 지키는 것은 상한 하나입니다.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    const sec = page.locator('.section').filter({ has: page.locator('p.body') }).first();
    const head = (await sec.locator('.display, h2').first().boundingBox())!;
    expect(Math.round(head.width), '헤드라인이 컨테이너보다 넓습니다').toBeLessThanOrEqual(1120);
  });

  test('헤더·히어로·캡션·본문·푸터가 한 줄에서 시작한다', async ({ page }) => {
    /*
     * 컨테이너를 `.wrap` 에만 넣었더니 **본문만 안쪽으로 들어오고 나머지는
     * 제자리에 남았습니다.** 1920px 에서 헤더 워드마크 48px, 본문 400px —
     * 352px 어긋남이고, 스티키 헤더라 스크롤 내내 보였습니다.
     *
     * 어긋남은 화면이 1216px(= 1120 + 48×2)를 넘어야 나타납니다. 그전까지는
     * 거터가 이겨서 전부 같은 값이 나옵니다. 320/375px 만 재던 검사가
     * 이것을 놓친 이유입니다.
     */
    for (const width of [375, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ko/');
      const lefts = await page.evaluate(() => {
        // 상자가 아니라 **글자** 가 시작하는 지점을 봅니다.
        const left = (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const range = document.createRange();
          range.selectNodeContents(el);
          const rects = [...range.getClientRects()];
          return rects.length
            ? Math.round(Math.min(...rects.map((r) => r.left)))
            : Math.round(el.getBoundingClientRect().left);
        };
        return {
          헤더: left('.nav__wordmark'),
          히어로: left('.hero__thin'),
          /*
           * 칸 안의 사진은 뺍니다. `.figure--split` 은 2열 섹션의 오른쪽
           * 칸에 있어, 그 캡션이 컨테이너 끝이 아니라 **그 칸에서** 시작하는
           * 것이 맞습니다. 여기서 지키는 것은 전면 요소들의 기준선입니다.
           */
          캡션: left('.figure:not(.figure--split) figcaption'),
          본문: left('main .section.wrap:not(.wrap--narrow) h2'),
          푸터: left('.footer__wordmark'),
        };
      });
      const found = Object.entries(lefts).filter(([, v]) => v !== null);
      expect(found.length, `${width}px 에서 잰 요소가 ${found.length}개뿐입니다`).toBe(5);
      const unique = new Set(found.map(([, v]) => v));
      expect(
        unique.size,
        `${width}px — ${found.map(([k, v]) => `${k} ${v}`).join(' · ')}`,
      ).toBe(1);
    }
  });

  test('좁은 섹션도 같은 자리에서 시작한다', async ({ page }) => {
    /*
     * `.wrap--narrow` 를 가운데 정렬로 두면 좁은 섹션이 넓은 섹션보다
     * 200px 더 들어갑니다((1120−720)/2). 홈을 세로로 읽으면 시작점이
     * 160 → 360 → 160 으로 튀고, 모든 섹션이 좁은 `/brand` 는 헤더·푸터가
     * 160px 인데 본문만 360px 이라 페이지 전체가 밀린 것처럼 보였습니다.
     *
     * 좁히는 것은 오른쪽 끝이지 시작점이 아닙니다.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ['/ko/', '/ko/brand/']) {
      await page.goto(path);
      const lefts = await page.evaluate(() =>
        [...document.querySelectorAll('main .section')]
          .map((sec) => {
            const head = sec.querySelector('.kicker, h2, .display');
            if (!head) return null;
            const range = document.createRange();
            range.selectNodeContents(head);
            const rects = [...range.getClientRects()];
            if (!rects.length) return null;
            return {
              sec: (sec as HTMLElement).dataset.section ?? sec.className,
              left: Math.round(Math.min(...rects.map((r) => r.left))),
            };
          })
          .filter((x): x is { sec: string; left: number } => x !== null),
      );
      expect(lefts.length, `${path} 에서 잰 섹션이 없습니다`).toBeGreaterThan(2);
      const unique = new Set(lefts.map((x) => x.left));
      expect(
        unique.size,
        `${path} — ${lefts.map((x) => `${x.sec} ${x.left}`).join(' · ')}`,
      ).toBe(1);
    }
  });

  test('본문 텍스트를 가운데 정렬하지 않는다', async ({ page }) => {
    /*
     * "좌측으로 쏠린다" 는 보고를 받고 `text-align: center` 로 바꾸면 안 됩니다.
     * 블록을 화면 가운데 놓는 것과 글자를 가운데로 모으는 것은 다릅니다.
     * 가운데 정렬된 본문은 줄마다 시작점이 달라 읽기 어렵습니다.
     */
    for (const path of PAGES) {
      await page.goto(path);
      const aligns = await page.evaluate(() =>
        [...document.querySelectorAll('main p.body')].map((el) => getComputedStyle(el).textAlign),
      );
      expect(aligns.every((a) => a !== 'center'), `${path} 에 가운데 정렬된 본문이 있습니다`).toBe(true);
    }
  });

  test('긴 글은 다섯 언어 모두 읽기 좋은 줄 길이다', async ({ page }) => {
    /*
     * 1120px 로 흘리면 한글이 한 줄 70자를 넘어, 눈이 다음 줄 첫머리를 찾지
     * 못합니다.
     *
     * 범위가 문자 체계마다 다릅니다. 한글·한자는 글자 하나가 거의 정사각형이라
     * 40~50자가 편안하고, 라틴·태국 문자는 글자가 좁아 같은 물리적 폭에
     * 60~80자가 들어갑니다. 한 잣대로 재면 어느 한쪽이 반드시 틀립니다 —
     * 처음에는 한국어 기준 하나만 두어 나머지 넷을 아예 보지 못했습니다.
     */
    /*
     * ── 왜 글자 수가 아니라 em 인가 ────────────────────────────
     * 처음에는 `글자 수 ÷ 줄 수` 로 쟀습니다. 그런데 브랜드 페이지에서
     * **문단 그릇이 전부 581px 로 같은데** 어떤 문단은 57자, 어떤 문단은
     * 34자로 재어졌습니다. 라틴 낱말과 구두점이 섞이면 같은 폭에 글자가 더
     * 많이 들어가기 때문입니다. 그릇이 같은데 결과가 갈리면 그건 그릇을 재는
     * 지표가 아닙니다 — 문단의 구두점 밀도를 재고 있었던 것입니다.
     *
     * 지금은 **가장 긴 줄의 실제 폭** 을 글자 크기로 나눠 em 으로 봅니다.
     * 문자 체계와 무관하게 같은 것을 재고, 그릇이 넓어지면 반드시 걸립니다.
     *
     * 범위는 이 검사가 원래 쓰던 글자 수 기준을 그대로 옮긴 것입니다 —
     * 한글·한자는 글자 하나가 약 1em, 라틴·태국 문자는 약 0.5em 입니다.
     *   ko 30~52자  → 30~52em      en·th·vi 45~85자 → 22.5~42.5em
     *   zh 22~52자  → 22~52em
     */
    const BOUNDS: Record<string, [number, number]> = {
      ko: [30, 52],
      zh: [22, 52],
      en: [22.5, 42.5],
      th: [22.5, 42.5],
      vi: [22.5, 42.5],
    };
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const lang of LOCALES) {
      await page.goto(`/${lang}/brand/`);
      await page.evaluate(() => document.fonts.ready);
      const perLine = await page.evaluate(() =>
        [...document.querySelectorAll('main p.body')].map((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const rects = [...range.getClientRects()].filter((r) => r.height > 4);
          const widest = Math.max(...rects.map((r) => r.width), 0);
          const em = parseFloat(getComputedStyle(el).fontSize);
          return { em: Math.round((widest / em) * 10) / 10, wrapped: rects.length > 1 };
        }),
      );
      expect(perLine.length, `${lang} 에 본문이 없습니다`).toBeGreaterThan(0);
      const [lo, hi] = BOUNDS[lang];
      const shown = perLine.map((r) => `${r.em}${r.wrapped ? '' : '(한줄)'}`).join(', ');
      for (const { em, wrapped } of perLine) {
        // 너무 긴 줄은 한 줄짜리 문단에서도 문제입니다.
        expect(em, `${lang} 본문 줄 폭 ${shown} em (허용 ${lo}~${hi})`).toBeLessThanOrEqual(hi);
        /*
         * 하한은 **줄바꿈이 일어난 문단에만** 적용합니다. 한 줄로 끝난 문단의
         * 폭은 그릇이 아니라 그 문장의 길이라, 짧은 문단이 있다는 이유로
         * "그릇이 좁다" 고 말하면 거짓말입니다. 그릇이 정말 좁아지면 긴 문단이
         * 좁게 줄바꿈되면서 여기 걸립니다.
         */
        if (wrapped) {
          expect(em, `${lang} 본문 줄 폭 ${shown} em (허용 ${lo}~${hi})`).toBeGreaterThanOrEqual(lo);
        }
      }
    }
  });
});

test.describe('언어별 폭', () => {
  test('인용문 폭이 다섯 언어에서 같다', async ({ page }) => {
    /*
     * `1ch` 는 **첫 번째 사용 가능한 서체의 숫자 0 자폭** 이고, 그 글자가 없으면
     * 규격이 `0.5em` 을 쓰라고 정합니다. 표시서체는 ko·zh·th 에서 라틴 자족과
     * 자국 자족 두 벌로 나뉘는데 뒤쪽에 숫자가 없어, 같은 `24ch` 가
     * ko·zh·th 336px / en·vi 429px 로 갈렸습니다.
     *
     * 서브셋에 어떤 글자가 담기느냐가 레이아웃을 정하면, 폰트 파이프라인을
     * 건드릴 때마다 조용히 28% 씩 움직입니다.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    const widths: Record<string, string> = {};
    for (const lang of LOCALES) {
      await page.goto(`/${lang}/brand/`);
      await page.evaluate(() => document.fonts.ready);
      widths[lang] = await page.locator('.quote').first().evaluate((el) => getComputedStyle(el).maxWidth);
    }
    expect(
      new Set(Object.values(widths)).size,
      Object.entries(widths).map(([k, v]) => `${k} ${v}`).join(' · '),
    ).toBe(1);
  });
});

test.describe('섹션 리듬', () => {
  test('여백이 한 값으로 통일돼 있지 않다', async ({ page }) => {
    /*
     * 모든 섹션이 같은 여백이면 페이지가 한 덩어리로 읽힙니다. 실측했을 때
     * 홈의 아홉 섹션이 예외 없이 104px 이었습니다.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    const values = await page.evaluate(() =>
      [...document.querySelectorAll('main .section')].map(
        (s) => getComputedStyle(s).paddingBlockStart,
      ),
    );
    expect(new Set(values).size, `여백이 ${[...new Set(values)].join(', ')} 뿐입니다`).toBeGreaterThan(1);
  });

  test('섹션 여백은 토큰에서만 온다', async ({ page }) => {
    // 임의의 px 값이 섞이면 리듬이 아니라 우연이 됩니다.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    const allowed = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return [
        cs.getPropertyValue('--space-section-desktop'),
        cs.getPropertyValue('--space-section-lg-desktop'),
        cs.getPropertyValue('--space-section-sm-desktop'),
      ].map((v) => v.trim());
    });
    const used = await page.evaluate(() =>
      [...document.querySelectorAll('main .section')].map((s) => getComputedStyle(s).paddingBlockStart),
    );
    const stray = used.filter((v) => !allowed.includes(v));
    expect(stray, `토큰 밖의 값: ${[...new Set(stray)].join(', ')}`).toEqual([]);
  });
});

test.describe('배경 밴드', () => {
  test('같은 배경이 세 개 이상 연속되지 않는다', async ({ page }) => {
    // 스크롤하는 동안 화면이 변하지 않으면 페이지가 비어 보입니다.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    const runs = await page.evaluate(() => {
      const bgs = [...document.querySelectorAll('main .section')].map(
        (s) => getComputedStyle(s).backgroundColor,
      );
      let max = 0, cur = 1;
      for (let i = 1; i < bgs.length; i++) {
        cur = bgs[i] === bgs[i - 1] ? cur + 1 : 1;
        max = Math.max(max, cur);
      }
      return max;
    });
    expect(runs, `같은 배경이 ${runs}개 연속입니다`).toBeLessThan(3);
  });

  test('한 색이 페이지 절반을 넘지 않는다', async ({ page }) => {
    /*
     * 섹션 **개수** 만 세면 놓칩니다. 앞선 검사는 "같은 배경 3연속 금지" 인데,
     * `/brand` 는 마지막 섹션이 어두운 밴드이고 **푸터도 같은 잉크색** 이라
     * 둘이 이어 붙었습니다. 개수로는 2연속이라 통과하지만 실제 화면에서는
     * 문서의 61~64% 가 끊김 없는 한 색이었습니다(홈은 27%).
     *
     * 그래서 높이로 봅니다. 푸터도 함께 넣습니다 — 보는 사람에게 푸터는
     * 마지막 섹션 다음에 오는 또 하나의 면일 뿐입니다.
     */
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/ko/', '/ko/brand/']) {
        await page.goto(path);
        const share = await page.evaluate(() => {
          const blocks = [...document.querySelectorAll('main > *'), document.querySelector('.footer')];
          const rows = blocks
            .filter((el): el is HTMLElement => el instanceof HTMLElement)
            /*
             * 흐름 밖의 것은 밴드가 아닙니다.
             *
             * 홈 끝에는 하단 고정 CTA(`position: fixed`)와 신청 시트
             * (`<dialog>`)가 `main` 의 직계 자식으로 있습니다. 스크롤하며
             * 지나가는 면이 아니라 **화면에 붙어 있거나 닫혀 있는** 것들이라,
             * 높이를 밴드 길이에 보태면 "한 색이 얼마나 이어지는가" 라는
             * 질문의 답이 틀어집니다. 지금은 68px 이라 결과가 뒤집히지
             * 않지만, 뒤집히지 않는다는 것이 세도 된다는 뜻은 아닙니다.
             */
            .filter((el) => getComputedStyle(el).position === 'static')
            .map((el) => ({ bg: getComputedStyle(el).backgroundColor, h: el.getBoundingClientRect().height }));
          const total = rows.reduce((a, x) => a + x.h, 0);
          let best = 0, cur = 0, prev: string | null = null;
          for (const x of rows) {
            cur = x.bg === prev ? cur + x.h : x.h;
            prev = x.bg;
            best = Math.max(best, cur);
          }
          return best / total;
        });
        expect(
          share,
          `${path} ${width}px — 한 색이 ${Math.round(share * 100)}% 를 차지합니다`,
        ).toBeLessThan(0.5);
      }
    }
  });

  test('어두운 면 위의 선이 보인다', async ({ page }) => {
    /*
     * 글자만 챙기면 놓칩니다. `--color-border` 는 `rgba(37,43,49,.14)` —
     * **잉크 자신의 14%** 입니다. 어두운 면 위에서는 잉크에 잉크를 얹는 셈이라
     * 선이 사라집니다. 실제로 The Journey 의 `li` 구분선 5줄이 1.00:1 이었고,
     * 목록이 문단 덩어리로 뭉쳐 보였습니다.
     *
     * 대비 기준(4.5:1)은 글자용입니다. 1px 실선은 그보다 훨씬 낮아도 보이므로
     * 여기서는 "배경과 구분되는가" 만 봅니다.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ['/ko/', '/ko/brand/']) {
      await page.goto(path);
      const worst = await page.evaluate(() => {
        const lin = (c: number) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        const parse = (s: string) => {
          const m = s.match(/[\d.]+/g)!.map(Number);
          return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 };
        };
        type C = { r: number; g: number; b: number; a: number };
        // 반투명 선은 배경 위에 얹힌 뒤의 색으로 봐야 합니다.
        const over = (fg: C, bg: C): C => ({
          r: fg.r * fg.a + bg.r * (1 - fg.a),
          g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a),
          a: 1,
        });
        const L = (c: C) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
        const ratio = (a: C, b: C) => {
          const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x);
          return (hi + 0.05) / (lo + 0.05);
        };
        let min = 99;
        for (const surf of document.querySelectorAll('.section--dark, .footer, .notice')) {
          const bg = parse(getComputedStyle(surf).backgroundColor);
          for (const el of surf.querySelectorAll<HTMLElement>('*')) {
            const cs = getComputedStyle(el);
            for (const side of ['Top', 'Bottom', 'Left', 'Right'] as const) {
              const w = parseFloat(cs[`border${side}Width` as keyof CSSStyleDeclaration] as string);
              if (!w || (cs[`border${side}Style` as keyof CSSStyleDeclaration] as string) === 'none') continue;
              const bc = parse(cs[`border${side}Color` as keyof CSSStyleDeclaration] as string);
              min = Math.min(min, ratio(over(bc, bg), bg));
            }
          }
        }
        return min;
      });
      expect(worst, `${path} 어두운 면 위 선 최저 ${worst.toFixed(2)}:1`).toBeGreaterThan(1.2);
    }
  });

  test('어두운 밴드 안의 글자가 읽힌다', async ({ page }) => {
    /*
     * `.section--dark` 는 역할 토큰 자체를 뒤집습니다. 전에는 `.kicker` 와
     * `.body` 두 클래스만 이름으로 적었는데, 그러면 밴드에 새 클래스가 들어올
     * 때마다 빠집니다 — The Journey 를 옮기자 50개 요소가 1.75:1 이 됐습니다.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ['/ko/', '/ko/brand/']) {
      await page.goto(path);
      const worst = await page.evaluate(() => {
        const lin = (c: number) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        const L = (s: string) => {
          const [r, g, b] = s.match(/\d+/g)!.slice(0, 3).map(Number);
          return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        };
        let min = 99;
        for (const sec of document.querySelectorAll('.section--dark')) {
          const bg = L(getComputedStyle(sec).backgroundColor);
          for (const el of sec.querySelectorAll<HTMLElement>('p, h2, li, span, blockquote')) {
            if (!el.textContent?.trim()) continue;
            if (el.querySelector('p, h2, li, span, blockquote')) continue;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            const cs = getComputedStyle(el);
            const fg = L(cs.color);
            const [hi, lo] = [fg, bg].sort((a, b) => b - a);
            const ratio = (hi + 0.05) / (lo + 0.05);
            const large =
              parseFloat(cs.fontSize) >= 24 ||
              (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
            min = Math.min(min, ratio / (large ? 3 : 4.5));
          }
        }
        return min;
      });
      expect(worst, `${path} 어두운 밴드 대비가 기준의 ${(worst * 100).toFixed(0)}%`).toBeGreaterThanOrEqual(1);
    }
  });
});

test.describe('브랜드 페이지', () => {
  test('5개 언어에 있고 헤더가 그곳을 가리킨다', async ({ page, request }) => {
    /*
     * 전에는 `/{lang}/#story` 앵커였습니다. 섹션 순서가 바뀌면서 누르면
     * 페이지 중간으로 튕겼습니다 — 네비게이션이 목적지를 약속하고 스크롤을
     * 배달하는 셈이었습니다.
     */
    for (const lang of LOCALES) {
      const res = await request.get(`/${lang}/brand/`);
      expect(res.status(), `/${lang}/brand/ 가 열리지 않습니다`).toBe(200);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    const href = await page.locator('.nav__links a', { hasText: '브랜드' }).first().getAttribute('href');
    expect(href, '헤더가 아직 앵커를 가리킵니다').toBe('/ko/brand/');
  });

  test('밖에 공유된 #story 링크가 깨지지 않는다', async ({ page }) => {
    // 인스타 프로필·단톡방·북마크에 남아 있을 수 있습니다.
    await page.goto('/ko/#story');
    await page.waitForURL(/\/ko\/brand\/#story$/, { timeout: 5000 });
    await expect(page.locator('#story')).toBeVisible();
    /*
     * 조각까지 따라와야 합니다. `/brand` 가 착지점으로 달아 둔 `id="story"`
     * 는 조각을 버리는 순간 한 번도 쓰이지 않는 죽은 코드가 됩니다. 지금은
     * 마침 그 섹션이 맨 위라 눈에 보이는 차이가 없어, 어긋나도 아무도
     * 알아채지 못합니다.
     */
    expect(new URL(page.url()).hash, '조각이 버려졌습니다').toBe('#story');
  });

  test('자바스크립트가 없어도 브랜드로 가는 길이 홈에 있다', async ({ request }) => {
    // #story 넘김은 스크립트가 합니다. 없으면 홈에 머무는데, 그때도 길은 있어야 합니다.
    const html = await (await request.get('/ko/')).text();
    expect(html, '홈에 /brand 링크가 없습니다').toContain('href="/ko/brand/"');
  });

  test('색인하는 언어만 사이트맵에 있다', async ({ request }) => {
    const xml = await (await request.get('/sitemap-0.xml')).text();
    for (const lang of INDEXED_LOCALES) {
      expect(xml, `${lang} 브랜드 페이지가 사이트맵에 없습니다`).toContain(`/${lang}/brand/`);
    }
    for (const lang of LOCALES.filter((l) => !INDEXED_LOCALES.includes(l))) {
      expect(xml, `${lang} 은 색인 대상이 아닌데 사이트맵에 있습니다`).not.toContain(`/${lang}/brand/`);
    }
  });
});

test.describe('스크립트가 없을 때', () => {
  /*
   * `.rise` 가 `opacity: 0` 으로 시작하고 스크립트가 나타내던 시절, 스크립트가
   * 없으면 나타내는 일이 영영 없었습니다. `/brand` 는 본문 세 덩어리가 전부
   * `.rise` 라 가운데가 통째로 백지였고, 홈도 히어로만 남고 일곱 덩어리가
   * 사라졌습니다.
   *
   * 지금은 연출이 CSS 스크롤 타임라인이라 스크립트와 무관하지만, 이 검사는
   * 남겨 둡니다 — 다음 사람이 다시 스크립트로 감출 수도 있습니다.
   *
   * Playwright 의 `toBeVisible()` 은 opacity 를 보지 않아 이것을 통과시킵니다.
   * 그래서 계산된 opacity 를 직접 읽습니다.
   */
  test.use({ javaScriptEnabled: false });

  for (const path of ['/ko/', '/ko/brand/', '/ko/product/']) {
    test(`${path} 의 본문이 보인다`, async ({ page }) => {
      await page.goto(path);
      const hidden = await page.evaluate(() =>
        [...document.querySelectorAll('main > *')]
          .filter((el) => parseFloat(getComputedStyle(el).opacity) < 0.05)
          .map((el) => el.tagName.toLowerCase() + '.' + (el.className || '').split(' ')[0]),
      );
      expect(hidden, `안 보이는 덩어리: ${hidden.join(', ')}`).toEqual([]);
    });
  }
});
