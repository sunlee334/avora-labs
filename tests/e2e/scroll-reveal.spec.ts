import { test, expect } from '@playwright/test';

/**
 * 빠르게 스크롤해도 화면이 백지가 되지 않는가.
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 * `.rise` 가 `opacity: 0` 으로 시작했습니다. 섹션 하나가 화면보다 큰데 통째로
 * 0 으로 대기하니, 그 구간에 들어가면 **볼 것이 아무것도 없었습니다.**
 * 방문자에게는 사이트가 고장 난 것으로 보입니다.
 *
 * ── 재현이 까다롭다 — 그래서 방법을 여기 박아 둔다 ─────────
 * 처음에는 `scrollTo` 로 페이지 곳곳에 **점프해서** 쟀고, 아무 문제도 찾지
 * 못했습니다. 점프는 한 번 뛰고 멈추므로 관찰자가 따라잡을 틈이 생깁니다.
 *
 * 사람은 그렇게 스크롤하지 않습니다. **매 프레임 조금씩 계속** 움직여야
 * 재현됩니다. 그때 화면의 4분의 1 이상을 차지한 요소의 불투명도가
 * **0 까지** 떨어졌습니다.
 *
 * 스크롤을 페이지 안에서 굴립니다. `mouse.wheel` 은 모바일 WebKit 에 없어
 * 스위트의 절반이 그 자리에서 멈춥니다 — 그리고 이 결함이 더 심한 쪽이
 * 하필 모바일입니다.
 *
 * ── 무엇을 재는가 ──────────────────────────────────────────
 * "화면이 몇 % 칠해졌나" 를 재려다 한 번 헛짚었습니다. 그림 브레이크처럼
 * `[data-section]` 이 아닌 요소가 빈 자리로 계산돼, 멀쩡한 화면도 52% 로
 * 나왔습니다. 질문 그대로 재는 편이 낫습니다 — **화면의 큰 부분을 차지하는
 * 요소가 흐린 채로 있는 순간이 있는가.**
 */

/** 화면의 이 비율 이상을 차지하면 "화면을 대표하는 요소" 로 봅니다. */
const DOMINANT = 0.25;
/** 이 아래로 내려가면 글자가 읽히지 않습니다. */
const FLOOR = 0.5;

async function worstOpacityWhileFlicking(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');

  const frames = await page.evaluate(
    ({ dominant }) =>
      new Promise<number[]>((resolve) => {
        const worstPerFrame: number[] = [];
        // 관성 스크롤과 비슷한 속도로 매 프레임 조금씩 밉니다.
        const STEP = Math.round(innerHeight * 0.55);
        /*
         * ⚠️ 프레임 수로 끊습니다. "바닥에 닿으면 멈춤" 만으로 두었더니 영영
         * 끝나지 않았습니다 — 이 사이트는 Lenis 로 스크롤을 부드럽게 만들고,
         * 그 라이브러리가 `scrollBy` 를 가로채 `scrollY` 가 곧바로 따라오지
         * 않습니다. 바닥 조건은 남겨 두되 상한을 함께 둡니다.
         */
        const MAX_FRAMES = 150;

        const tick = () => {
          let worst = 1;
          for (const el of document.querySelectorAll('.rise')) {
            const b = el.getBoundingClientRect();
            const visible = Math.min(b.bottom, innerHeight) - Math.max(b.top, 0);
            if (visible < innerHeight * dominant) continue;
            worst = Math.min(worst, Number(getComputedStyle(el).opacity));
          }
          worstPerFrame.push(worst);

          const atBottom = scrollY + innerHeight >= document.body.scrollHeight - 2;
          if (atBottom || worstPerFrame.length >= MAX_FRAMES) {
            resolve(worstPerFrame);
            return;
          }
          scrollBy(0, STEP);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { dominant: DOMINANT },
  );
  expect(frames.length, '프레임을 하나도 못 쟀습니다').toBeGreaterThan(20);
  return Math.min(...frames);
}

test.describe('빠르게 스크롤해도 읽을 것이 남는다', () => {
  for (const path of ['/ko/', '/ko/brand', '/ko/panel', '/ko/product']) {
    test(`${path} — 화면을 채운 요소가 흐린 채로 남지 않는다`, async ({ page }) => {
      const worst = await worstOpacityWhileFlicking(page, path);
      expect(
        worst,
        `${path} 에서 화면의 ${DOMINANT * 100}% 이상을 차지한 요소가 opacity ${worst} 까지 흐려졌습니다`,
      ).toBeGreaterThanOrEqual(FLOOR);
    });
  }

  test('연출을 없애지는 않았다', async ({ page }) => {
    /*
     * 지시서가 못 박았습니다 — "스크롤 리빌을 통째로 제거하지 말 것. 초기
     * 상태만 바꾼다." 가장 쉬운 통과 방법은 `.rise` 를 지우는 것이므로,
     * 구조가 남아 있는지 함께 봅니다.
     */
    await page.goto('/ko/');
    await expect(page.locator('.rise').first()).toHaveCount(1);

    const state = await page.evaluate(() => {
      const el = document.querySelector('.rise')!;
      const before = getComputedStyle(el);
      return {
        hasTransition: before.transitionProperty.includes('opacity'),
        jsClass: document.documentElement.classList.contains('js'),
      };
    });
    expect(state.hasTransition, '전환이 사라졌습니다 — 연출을 지운 것입니다').toBe(true);
    expect(state.jsClass, '.js 표식이 없습니다').toBe(true);
  });

  test('첫 화면은 리빌 대상이 아니다', async ({ page }) => {
    /*
     * 히어로가 흐리게 시작하면 LCP 가 흐린 그림이 됩니다. 지시서도 "첫 화면에
     * 보이는 요소는 리빌 대상에서 제외할 것" 이라고 적었습니다.
     */
    await page.goto('/ko/');
    await expect(page.locator('.hero.rise')).toHaveCount(0);
    const heroOpacity = await page
      .locator('.hero')
      .evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(heroOpacity).toBe(1);
  });

  test('모션을 줄이면 즉시 보인다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/ko/');
    const rows = await page.locator('.rise').evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return { o: Number(cs.opacity), t: cs.transform, tr: cs.transitionDuration };
      }),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.o, '모션 최소화인데 흐립니다').toBe(1);
      expect(r.t, '모션 최소화인데 밀려 있습니다').toBe('none');
      expect(r.tr, '모션 최소화인데 전환이 남아 있습니다').toBe('0s');
    }
  });
});
