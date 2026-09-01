import { test, expect } from '@playwright/test';

/**
 * 넓은 화면의 첫 화면.
 *
 * ── 이 검사가 없어서 무슨 일이 있었나 ──────────────────────
 * 2026-09-01, 운영의 1680px 이상에서 히어로 헤드라인이 **한 글자씩 세로로**
 * 쌓여 있었다. "For every movement." 가 17줄이 되고 히어로가 뷰포트의 2.4배
 * (2644px)로 늘어나, 데스크톱 첫 화면이 사실상 백지였다.
 *
 * 그동안 검사 1,960건이 전부 통과하고 있었다. 이 저장소가 재는 가장 넓은
 * 폭이 **1280px** 이고, 결함은 1548px 부터 시작하기 때문이다. 재지 않는 곳은
 * 통과한 것이 아니라 본 적이 없는 것이다.
 *
 * ── 원인과 불변식 ──────────────────────────────────────────
 * `.hero__copy` 한 요소가 두 가지 일을 했다 — 컨테이너 기준선에 맞추는 좌우
 * 여백(`--pad-container`, 화면과 함께 자람)과 한 줄을 60자로 묶는 상한(고정).
 * `box-sizing: border-box` 라 자라는 여백이 고정된 상한 안쪽을 먹었다.
 *
 * 그래서 여기서 지키는 것은 **"화면이 넓어질 때 글 칸이 좁아지지 않는다"** 다.
 * 줄 수만 세면 문구가 짧아졌을 때 통과해 버린다.
 *
 * ── 왜 setViewportSize 를 쓰지 않는가 ──────────────────────
 * 크기를 바꾸면 재계산이 일어나 결함이 가려진다. 실사용자는 언제나 그 크기로
 * **처음 여는** 사람이다. 그래서 폭마다 컨텍스트를 새로 만든다 —
 * `svh` 가 원래 창 기준으로 풀리는 문제도 함께 피한다.
 */

const WIDTHS = [1280, 1440, 1680, 1920, 2560];

test.describe('넓은 화면 히어로', () => {
  test('화면이 넓어져도 글 칸이 좁아지지 않는다', async ({ browser }) => {
    // 폭마다 창을 새로 여므로 프로젝트의 뷰포트와 무관합니다. 두 번 돌 이유가 없습니다.
    test.skip(test.info().project.name !== 'desktop', '한 번만 돌립니다');

    const seen: Array<{ width: number; copy: number; lines: number; heroRatio: number }> = [];

    for (const width of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width, height: Math.round(width * 0.5625) },
      });
      const page = await ctx.newPage();
      await page.goto('/ko/');

      seen.push({
        width,
        ...(await page.evaluate(() => {
          const h1 = document.querySelector('.hero__thin') as HTMLElement;
          const copy = document.querySelector('.hero__copy') as HTMLElement;
          const hero = document.querySelector('.hero') as HTMLElement;
          const cs = getComputedStyle(copy);
          return {
            // 여백을 뺀 **글이 설 자리**. 이것이 이 결함의 핵심 값이다.
            copy:
              copy.getBoundingClientRect().width -
              parseFloat(cs.paddingLeft) -
              parseFloat(cs.paddingRight),
            lines: Math.round(
              h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight),
            ),
            heroRatio: hero.getBoundingClientRect().height / window.innerHeight,
          };
        })),
      });
      await ctx.close();
    }

    const table = seen
      .map((s) => `${s.width}px → 글칸 ${Math.round(s.copy)}px · ${s.lines}줄 · 히어로 ${s.heroRatio.toFixed(2)}배`)
      .join('\n');

    for (const [i, s] of seen.entries()) {
      // 한 줄짜리 문구가 글자 단위로 접히지 않는다.
      expect(s.lines, `${s.width}px 에서 헤드라인이 ${s.lines}줄\n${table}`).toBeLessThanOrEqual(2);
      // 첫 화면이 첫 화면으로 남는다.
      expect(s.heroRatio, `${s.width}px 에서 히어로가 뷰포트의 ${s.heroRatio.toFixed(1)}배\n${table}`)
        .toBeLessThan(1.2);
      // ★ 넓어질수록 좁아지지 않는다 — 여백이 상한을 먹으면 여기서 걸린다.
      if (i > 0) {
        expect(
          s.copy,
          `${seen[i - 1].width}px 보다 ${s.width}px 에서 글 칸이 좁아졌습니다\n${table}`,
        ).toBeGreaterThanOrEqual(seen[i - 1].copy - 1);
      }
    }
  });
});
