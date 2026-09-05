import { test, expect } from '@playwright/test';

/**
 * 글과 사진이 나란히 서는 칸.
 *
 * ── 무엇을 옮겼나 ──────────────────────────────────────────
 * THE PROBLEM 의 본문은 **몸에서 무슨 일이 일어나는지** 를 말합니다 — 땀이
 * 눈으로 흘러 들어오는 장면. 그런데 그 사진은 350줄 뒤에서 장식 밴드로 혼자
 * 서 있었습니다. 새로 더한 것이 아니라 자리를 바꾼 것입니다.
 *
 * ── 이 검사가 지키는 것 ────────────────────────────────────
 * 두 열이 되는지만 보면 부족합니다. 진짜 위험은 **사진이 없는 섹션** 입니다 —
 * 열 수를 고정하면 WHO WE ARE 처럼 자식이 하나뿐인 칸에서 글이 왼쪽 절반에
 * 갇히고 오른쪽이 통째로 빕니다. 지시서가 "이미지가 없으면 1열로 동작해야
 * 한다" 고 못박은 자리입니다.
 *
 * 사진 비율도 봅니다. 전면 밴드용 `.figure img` 가 화면 높이(58svh)를 쓰는데,
 * 규칙 순서를 잘못 두면 그 값이 그대로 남아 4:3 이 1.2 가 됩니다 — 실제로
 * 한 번 그랬습니다.
 */

test.describe('2열 섹션', () => {
  test('넓은 화면에서 글 7 : 사진 5 로 선다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);

    const m = await page.evaluate(() => {
      const split = document.querySelector('[data-section="the_problem"] .split')!;
      const kids = [...split.children].map((el) => el.getBoundingClientRect());
      return {
        칸수: kids.length,
        나란히: Math.abs(kids[0].top - kids[1].top) < 10,
        비율: kids[0].width / kids[1].width,
      };
    });

    expect(m.칸수, '두 칸이 아닙니다').toBe(2);
    expect(m.나란히, '두 칸이 위아래로 쌓였습니다').toBe(true);
    /*
     * 지시서는 글 5 : 사진 7 인데 뒤집었습니다.
     *
     * 1120px 컨테이너에서 여백을 빼고 5/12 면 글이 447px — 한글 한 줄 29자라
     * `reading-width.spec.ts` 의 620~700px 을 못 넘깁니다. 실제로 그 검사가
     * 걸렸습니다. 7 : 5 면 글 625px(42자)로 읽기 폭 안이고 사진은 447px 로
     * 여전히 문단 하나보다 큽니다.
     *
     * 7/5 = 1.4. 여백 때문에 정확히 떨어지지 않으므로 폭을 둡니다.
     */
    expect(m.비율, `비율이 ${m.비율.toFixed(2)} 입니다`).toBeGreaterThan(1.25);
    expect(m.비율).toBeLessThan(1.60);
  });

  test('사진이 없는 섹션은 1열로 폭을 다 쓴다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);

    const m = await page.evaluate(() => {
      const split = document.querySelector('[data-section="company"] .split')!;
      const first = split.firstElementChild!.getBoundingClientRect();
      return {
        칸수: split.children.length,
        글폭: first.width,
        칸폭: split.getBoundingClientRect().width,
      };
    });

    expect(m.칸수, '사진이 생겼다면 이 검사를 고치세요').toBe(1);
    expect(
      m.칸폭 - m.글폭,
      `글이 ${Math.round(m.글폭)}px 인데 칸은 ${Math.round(m.칸폭)}px — 오른쪽이 빕니다`,
    ).toBeLessThan(2);
  });

  test('칸 안의 사진은 4:3 이고 카드 반경을 쓴다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    const fig = page.locator('.figure--split img');
    await fig.scrollIntoViewIfNeeded();
    await expect.poll(() => fig.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

    const m = await fig.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { 비: r.width / r.height, 반경: getComputedStyle(el).borderRadius };
    });
    expect(m.비, `비율이 ${m.비.toFixed(2)} 입니다`).toBeCloseTo(4 / 3, 1);
    expect(m.반경, '카드 반경이 아닙니다').toBe('8px');
  });

  test('390px 에서는 글 위 사진 아래로 쌓인다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);

    const m = await page.evaluate(() => {
      const split = document.querySelector('[data-section="the_problem"] .split')!;
      const [text, media] = [...split.children].map((el) => el.getBoundingClientRect());
      return {
        글먼저: text.top < media.top,
        넘침: Math.max(0, Math.round(document.documentElement.scrollWidth - innerWidth)),
      };
    });
    expect(m.글먼저, '사진이 글보다 위에 있습니다').toBe(true);
    expect(m.넘침, '가로로 밀렸습니다').toBe(0);
  });

  test('같은 사진이 페이지에 두 번 나오지 않는다', async ({ page }) => {
    await page.goto('/ko/');
    /*
     * 옮긴 것이지 더한 것이 아닙니다. 원래 자리를 지우지 않으면 같은 사진이
     * 한 페이지에 두 번 서고, 그건 재배치가 아니라 중복입니다.
     */
    const dupes = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const img of document.querySelectorAll('main img')) {
        const src = (img.getAttribute('src') ?? '').split('/').pop()?.split('.')[0] ?? '';
        if (src) seen.set(src, (seen.get(src) ?? 0) + 1);
      }
      return [...seen].filter(([, n]) => n > 1).map(([s, n]) => `${s} ×${n}`);
    });
    expect(dupes, '같은 사진이 두 번 나옵니다').toEqual([]);
  });
});
