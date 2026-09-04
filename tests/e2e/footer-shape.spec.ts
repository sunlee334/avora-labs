import { test, expect } from '@playwright/test';

/**
 * 푸터가 화면 한 장을 넘지 않는가.
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 * 링크 묶음이 넷(메뉴 6 · 약관 3 · 채널 1 · 언어 5)인데 격자가 **3열**
 * 이었습니다. 넷째가 둘째 줄로 내려가고 그 줄의 오른쪽 3분의 2 가 통째로
 * 비었습니다. 1280px 에서 푸터가 **962px** — 화면 한 장보다 컸습니다.
 *
 * 좁은 화면(2열)도 같은 문제였습니다. 6과 3, 1과 5 가 짝이 되어 **308px** 이
 * 비어 있었습니다.
 *
 * ── 고친 방법 ──────────────────────────────────────────────
 * 넓은 화면은 4열로 한 줄에 세우고, 순서를 길이에 맞춰 다시 짰습니다 —
 * 긴 것끼리(메뉴 · 언어), 짧은 것끼리(약관 · 채널).
 *
 * ── 이 검사가 재는 것 ──────────────────────────────────────
 * 높이가 아니라 **빈 자리** 입니다. 높이만 보면 항목이 줄어도 통과하고,
 * 항목이 늘면 배치와 무관하게 실패합니다. 빈 자리는 배치의 문제입니다.
 */

/** 각 줄에서 가장 큰 칸과 나머지 칸의 높이 차를 모두 더한 값. */
const shapeOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const cols = [...document.querySelectorAll('.footer__col')];
    const rows = new Map<number, number[]>();
    for (const col of cols) {
      const box = col.getBoundingClientRect();
      const top = Math.round(box.top);
      const bucket = rows.get(top) ?? [];
      bucket.push(box.height);
      rows.set(top, bucket);
    }
    let wasted = 0;
    for (const heights of rows.values()) {
      const tallest = Math.max(...heights);
      for (const h of heights) wasted += tallest - h;
    }
    return { wasted: Math.round(wasted), rows: rows.size, cols: cols.length };
  });

test.describe('푸터 모양', () => {
  for (const width of [900, 1024, 1280, 1600]) {
    test(`${width}px — 묶음 넷이 한 줄에 선다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ko/');
      await page.evaluate(() => document.fonts.ready);

      const shape = await shapeOf(page);
      expect(shape.cols, '푸터 묶음이 넷이 아닙니다').toBe(4);
      expect(shape.rows, '넷이 한 줄에 서지 않습니다 — 둘째 줄이 통째로 빕니다').toBe(1);

      const height = await page
        .locator('.footer')
        .evaluate((el) => el.getBoundingClientRect().height);
      /*
       * 962px 이었습니다. 900px 은 "화면 한 장" 의 기준이고, 넘으면 푸터만
       * 보이는 화면이 생깁니다. 지금 값은 685px 입니다.
       */
      expect(height, `푸터가 ${Math.round(height)}px 입니다`).toBeLessThan(800);
    });
  }

  for (const width of [360, 390]) {
    test(`${width}px — 긴 묶음끼리, 짧은 묶음끼리 짝이 된다`, async ({ page }) => {
      /*
       * 2열에서는 어느 것을 옆에 두느냐가 곧 높이입니다. 6과 3 을 붙이면
       * 3칸이 비고, 1과 5 를 붙이면 4칸이 더 빕니다.
       */
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/ko/');
      await page.evaluate(() => document.fonts.ready);

      const shape = await shapeOf(page);
      expect(shape.rows, '2열이 아닙니다').toBe(2);
      /*
       * 링크 한 줄이 44px(탭 영역)입니다. 짝을 잘못 지으면 308px — 일곱 칸이
       * 빕니다. 지금은 132px(세 칸)이고, 6·5·3·1 로는 그 아래로 못 내려갑니다.
       */
      expect(shape.wasted, `빈 자리가 ${shape.wasted}px 입니다`).toBeLessThan(200);
    });
  }

  test('가로로 넘치지 않는다', async ({ page }) => {
    // 4열로 좁아진 칸에 긴 항목이 들어가도 화면을 밀지 않아야 합니다.
    for (const width of [900, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ko/');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${width}px 에서 가로로 넘칩니다`).toBeLessThanOrEqual(0);
    }
  });

  test('링크 탭 영역은 그대로 44px 이다', async ({ page }) => {
    /*
     * 높이를 줄이려고 탭 영역을 깎지 않았습니다. 줄인 것은 **빈 자리** 입니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    const small = await page
      .locator('.footer__col li a')
      .evaluateAll((els) =>
        els
          .filter((el) => el.getBoundingClientRect().height < 44)
          .map((el) => `${el.textContent?.trim().slice(0, 14)} ${Math.round(el.getBoundingClientRect().height)}px`),
      );
    expect(small, '푸터 링크의 탭 영역이 44px 미만입니다').toEqual([]);
  });
});
