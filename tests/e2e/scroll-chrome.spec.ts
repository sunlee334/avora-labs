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
 * ── 스크롤 이벤트로 그리지 않습니다 ──────────────────────
 * 전에는 `scroll` 마다 위치를 계산해 `transform` 을 써 넣었습니다. rAF 로
 * 프레임당 한 번으로 묶어도 그 계산은 **메인 스레드** 에서 돕니다.
 * `animation-timeline: scroll(root block)` 은 같은 값을 컴포지터가 만듭니다.
 *
 * 그래서 아래 검사가 둘 늘었습니다 — 무엇이 그리는지(타임라인의 종류)와,
 * 스크립트가 통째로 없어도 그려지는지.
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

  test('스크롤 이벤트가 아니라 스크롤 타임라인이 그린다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');

    const kind = await page.evaluate(() => {
      const fill = document.querySelector<HTMLElement>('.progress__fill');
      if (!fill) return 'none';
      const anim = fill.getAnimations()[0] as Animation | undefined;
      return anim?.timeline?.constructor?.name ?? 'none';
    });

    expect(
      kind,
      '진행선이 스크롤 타임라인으로 그려지지 않습니다 — 스크롤 이벤트로 되돌아갔을 수 있습니다',
    ).toBe('ScrollTimeline');
  });

  test('스크립트가 통째로 없어도 찬다', async ({ page }) => {
    /*
     * 이것이 CSS 로 옮긴 이유입니다. 전에는 번들 모듈이 오지 않으면 진행선이
     * `scaleY(0)` 그대로 남아, **"맨 위에 있다" 고 계속 말하는** 상태가 됐습니다.
     * 비어 있는 장식이 아니라 틀린 표시입니다.
     *
     * 빈 스크립트로 정상 응답합니다 — 연결을 끊으면 서버에 `Broken pipe` 가
     * 쌓입니다(`scroll-reveal.spec.ts` 의 같은 이유).
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.route('**/_astro/*.js', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
    );
    await page.goto('/ko/');

    /*
     * ⚠️ "맨 아래면 가득" 으로 재지 않습니다.
     *
     * 처음에 그렇게 썼다가 0.83 이 나왔습니다. 진행선은 멀쩡했고, 스크립트를
     * 막으면 사진이 뒤늦게 실려 **바닥으로 간 뒤에 페이지가 더 자란** 것이었습니다.
     * 위 `읽은 만큼 찬다` 가 이미 같은 이유로 실제 위치와 비교합니다.
     */
    const { 실제, 막대 } = await page.evaluate(async () => {
      window.scrollTo(0, 1_000_000);
      await new Promise((r) => setTimeout(r, 700));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const t = getComputedStyle(document.querySelector('.progress__fill')!).transform;
      return {
        실제: max > 0 ? doc.scrollTop / max : 0,
        막대: t === 'none' ? 0 : Number.parseFloat(t.split(',')[3]),
      };
    });

    expect(실제, '스크롤이 되지 않았습니다 — 이 검사가 아무것도 재지 못했습니다').toBeGreaterThan(0.5);
    expect(
      Math.abs(막대 - 실제),
      `스크립트 없이 위치 ${실제.toFixed(3)} 인데 막대는 ${막대.toFixed(3)} 입니다`,
    ).toBeLessThan(0.05);
  });

  test('390px 에서는 그리지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await expect(page.locator('.progress')).toBeHidden();
  });
});
