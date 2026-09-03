import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

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

  test('스크립트가 죽어도 흐린 채로 남지 않는다', async ({ page }) => {
    /*
     * ⚠️ 이 결함은 **시작값을 올리면서 새로 생겼습니다.**
     *
     * `.js` 표식은 `<head>` 인라인이 붙이고 `is-in` 은 문서 끝의 번들 모듈이
     * 붙입니다 — 서로 다른 실패 단위입니다. 모듈이 죽으면 `.js .rise` 의 흐린
     * 상태(대비 3.2:1)가 **영구히** 남습니다. 눈에 띄는 고장 없이 글자만 계속
     * 흐립니다.
     *
     * 전에는 같은 고장이 `opacity: 0` 이라 백지로 즉시 드러났습니다. 결함은
     * 고쳤지만 실패 모드는 더 조용해졌고, 그 대가를 `<head>` 의 2초 안전망이
     * 갚습니다.
     *
     * 안전망을 모듈 안에 두면 소용이 없습니다 — 모듈이 죽을 때 함께 죽습니다.
     * 그래서 `.js` 를 붙이는 **같은 단위** 에 있어야 합니다.
     */
    /*
     * ⚠️ "처음에는 흐리다" 를 **살아 있는 값으로 확인하지 않습니다.**
     *
     * 처음에는 `domcontentloaded` 직후 `opacity` 를 읽어 흐린지 봤는데, 그
     * 확인이 **자기 2초 타이머와 경합** 했습니다. 스위트가 부하를 받으면
     * 로드가 2초를 넘고, 그때는 안전망이 이미 켜져 있어 "흐린 것이 없다" 가
     * 됩니다 — 검사가 맞는데 실패합니다.
     *
     * 흐리게 시작한다는 것은 **CSS 선언** 의 사실이므로 규칙에서 읽습니다.
     * 시점과 무관합니다.
     */
    /*
     * 규칙을 **소스에서** 읽습니다.
     *
     * 브라우저에서 `link[rel=stylesheet]` 를 fetch 하려다 세 번 헛돌았습니다 —
     * `goto` 전에 평가해 `about:blank` 를 보고, 순서를 고쳐도 이 저장소의
     * 스타일 전달 방식 때문에 그 링크로는 못 읽었습니다. `sticky-cta-clearance`
     * 가 이미 같은 이유로 파일 읽기를 쓰고 있으니 그쪽에 맞춥니다.
     */
    const css = readFileSync('src/styles/global.css', 'utf8');
    const rule = css.slice(css.indexOf('.js .rise {'), css.indexOf('.js .rise.is-in'));
    expect(rule, '.js .rise 규칙을 못 찾았습니다').toContain('opacity');
    expect(rule, '시작 불투명도가 토큰에서 오지 않습니다').toContain('--motion-rise-opacity');

    /*
     * ⚠️ `route.abort()` 를 쓰지 않습니다.
     *
     * 요청을 끊으면 서버 쪽에 `Broken pipe` 가 쌓입니다. CI 로그에서 그
     * 오류가 줄줄이 나온 뒤 세 샤드가 `ECONNREFUSED 8787` 로 무너졌습니다.
     * 원인을 이 검사로 단정할 수는 없지만, 같은 목적을 연결을 끊지 않고
     * 이룰 수 있으면 그쪽이 맞습니다.
     *
     * 빈 스크립트로 **정상 응답** 합니다 — 모듈이 오지 않은 것과 화면에서는
     * 같고, 서버는 요청이 끝난 것으로 봅니다.
     */
    await page.route('**/_astro/*.js', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
    );
    await page.goto('/ko/', { waitUntil: 'domcontentloaded' });

    // 모듈이 오지 않으면 안전망이 켜져야 합니다 — 이것이 이 검사의 주장입니다.
    await page.waitForFunction(
      () => document.documentElement.classList.contains('rise-fallback'),
      undefined,
      { timeout: 8000 },
    );

    const faded = await page.evaluate(
      () =>
        [...document.querySelectorAll('.rise')].filter(
          (el) => Number(getComputedStyle(el).opacity) < 0.9,
        ).length,
    );
    expect(faded, '안전망이 켜졌는데 아직 흐립니다').toBe(0);
  });

  test('정상 경로에서는 안전망이 연출을 지우지 않는다', async ({ page }) => {
    /*
     * 안전망을 모듈 안에 `setTimeout(revealAll, 2000)` 으로 두었을 때, 2초
     * 뒤 **아직 스크롤하지 않은 섹션까지 전부 켜졌습니다.** 지시서가 금지한
     * "리빌 통째 제거" 에 사실상 해당합니다.
     *
     * 지금은 모듈이 살아 있으면 스스로 타이머를 지웁니다.
     */
    await page.goto('/ko/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2600);

    const state = await page.evaluate(() => {
      const rise = [...document.querySelectorAll('.rise')];
      const below = rise.filter((el) => el.getBoundingClientRect().top > window.innerHeight);
      return {
        fallback: document.documentElement.classList.contains('rise-fallback'),
        belowFold: below.length,
        stillFaded: below.filter((el) => Number(getComputedStyle(el).opacity) < 0.9).length,
      };
    });

    expect(state.fallback, '정상인데 안전망이 켜졌습니다').toBe(false);
    if (state.belowFold > 0) {
      expect(
        state.stillFaded,
        '화면 아래 섹션이 미리 드러났습니다 — 연출이 사라진 것입니다',
      ).toBeGreaterThan(0);
    }
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
