import { test, expect } from '@playwright/test';

/**
 * 페이지 가장자리의 장치 — 스크롤 진행 표시.
 *
 * ── 진행 표시 ──────────────────────────────────────────────
 * 홈이 화면 열 장이 넘는데 현재 위치를 알 방법이 없었습니다. 오른쪽 세로선
 * 하나로 알려 줍니다. **장식입니다** — 누를 수 없고 읽는 기계에는 숨습니다.
 * 누를 수 있게 만드는 순간 목적지 이름을 다섯 언어로 붙여야 하고 키보드
 * 순서에도 끼어듭니다.
 *
 * 히어로 위 헤더 투명 처리(지시서 TASK 8)는 넣지 않았습니다 — 실제 대비는
 * 넉넉했지만(최악 7.8:1) 배경이 사진이라 검사기가 그것을 알 수 없어, 밝은
 * 글자를 밝은 본문 배경과 비교해 위반으로 읽습니다. 지시서가 "대비 확보가
 * 어려우면 건너뛴다" 고 정해 둔 조건입니다.
 */

test.describe('진행 표시', () => {
  test('장식이고 누를 수 없다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    const bar = page.locator('.progress');
    await expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(await bar.locator('a, button, [tabindex]').count(), '누를 수 있게 만들면 안 됩니다').toBe(0);
  });

  test('읽은 만큼 찬다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);

    /*
     * 목표 위치를 미리 정해 두고 비교하지 않습니다.
     *
     * 이 페이지는 스크롤하는 동안 사진이 뒤늦게 실려 **높이가 자랍니다.** 미리
     * 계산한 목표는 그 사이 낡고, 검사는 진행 바가 고장난 것으로 읽습니다 —
     * 실제로 그렇게 한 번 틀렸습니다.
     *
     * 그래서 잰 순간의 위치와 그때의 막대를 **같이** 읽어 서로 맞는지 봅니다.
     * 그게 이 장치가 지켜야 할 유일한 약속입니다.
     */
    const sample = (y: number) =>
      page.evaluate(async (top) => {
        window.scrollTo(0, top);
        await new Promise((r) => setTimeout(r, 700));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const doc = document.documentElement;
        const max = doc.scrollHeight - doc.clientHeight;
        const t = getComputedStyle(document.querySelector('.progress__fill')!).transform;
        return {
          실제: max > 0 ? doc.scrollTop / max : 0,
          // matrix(a, b, c, d, e, f) 의 d 가 세로 배율입니다.
          막대: t === 'none' ? 0 : Number.parseFloat(t.split(',')[3]),
        };
      }, y);

    for (const y of [0, 3000, 1_000_000]) {
      const { 실제, 막대 } = await sample(y);
      expect(
        Math.abs(막대 - 실제),
        `${y} 로 갔을 때 위치 ${실제.toFixed(3)} 인데 막대는 ${막대.toFixed(3)} 입니다`,
      ).toBeLessThan(0.05);
    }

    // 맨 아래에서는 가득 차야 합니다.
    const 끝 = await sample(1_000_000);
    expect(끝.막대, `맨 아래에서 ${끝.막대}`).toBeGreaterThan(0.95);
  });

  test('390px 에서는 그리지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await expect(page.locator('.progress')).toBeHidden();
  });
});
