import { test, expect, type Page } from '@playwright/test';
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
 * 못했습니다. 점프는 한 번 뛰고 멈추므로 진행이 따라잡을 틈이 생깁니다.
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
 *
 * ── 기계 장치가 바뀌었다 ───────────────────────────────────
 * 예전에는 스크립트가 `is-in` 을 붙여 나타냈습니다. 지금은 CSS 스크롤
 * 타임라인(`animation-timeline: view()`)이 진행률을 직접 만듭니다. 위 질문은
 * 그대로지만 **새 실패 모드가 하나 생겼고**, 그것을 재는 검사가 아래
 * `모든 등장 요소가 끝내 선명해진다` 입니다.
 */

/** 화면의 이 비율 이상을 차지하면 "화면을 대표하는 요소" 로 봅니다. */
const DOMINANT = 0.25;
/** 이 아래로 내려가면 글자가 읽히지 않습니다. */
const FLOOR = 0.5;

/*
 * 스크롤 타임라인은 Chromium 계열만 지원합니다. 지원하지 않는 브라우저에서는
 * `@supports` 가 통째로 걸러 내므로 `.rise` 가 **처음부터 선명** 합니다 —
 * 연출이 없는 것이지 고장이 아닙니다. 그래서 "흐려야 한다" 를 주장하는
 * 검사만 그쪽에서 건너뜁니다. "흐리면 안 된다" 쪽은 양쪽 다 돌립니다.
 */
const supportsViewTimeline = (page: Page) =>
  page.evaluate(() => CSS.supports('animation-timeline', 'view()'));

async function worstOpacityWhileFlicking(page: Page, path: string) {
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

  for (const path of ['/ko/', '/ko/brand', '/ko/panel', '/ko/product']) {
    test(`${path} — 모든 등장 요소가 끝내 선명해진다`, async ({ page }) => {
      /*
       * ⚠️ 스크롤 타임라인이 새로 들여온 실패 모드입니다.
       *
       * 진행률이 시간이 아니라 **위치** 에 묶입니다. 그래서 범위를 끝까지
       * 지나지 못하는 요소는 중간 진행률에 **영구히** 머뭅니다 — 2초 뒤에
       * 저절로 풀리던 예전과 달리, 기다린다고 풀리지 않습니다.
       *
       * `cover` 기준이 정확히 그렇습니다. `cover 100%` 는 요소가 화면 위로
       * 완전히 빠져나가는 지점이라, 페이지 마지막 요소는 끝까지 스크롤해도
       * 도달하지 못합니다. 그 한 덩어리만 흐린 채로 남고, 나머지가 멀쩡하니
       * 눈에도 잘 띄지 않습니다.
       *
       * 그래서 `entry` 기준을 씁니다(`global.css` 의 `animation-range`).
       * 이 검사는 그 선택이 실제로 통하는지를 **페이지마다** 확인합니다.
       *
       * ── 측정을 rAF 루프로 하지 않습니다 ─────────────────────
       * 처음에는 위 `worstOpacityWhileFlicking` 처럼 매 프레임 굴리며 최댓값을
       * 모았습니다. `figure.figure` 하나가 네 페이지 모두에서 0.65 로 걸렸는데,
       * **CSS 는 멀쩡했습니다** — 바닥까지 내려 2.5초 뒤에 재면 1.0 이었고
       * 타임라인 진행률도 286% 였습니다.
       *
       * 스크롤 타임라인은 컴포지터에서 돕니다. 빠른 rAF 루프 안에서
       * `getComputedStyle` 은 메인 스레드의 낡은 값을 돌려줄 수 있고, 그것이
       * 하필 시작값 0.65 였습니다. 검사가 맞는데 실패하는 것보다 나쁜 것은
       * 이 경우처럼 **없는 결함을 있다고 하는 것** 입니다.
       *
       * 그래서 요소를 하나씩 제자리에 세우고 멈춘 뒤에 읽습니다. 느리지만
       * 재는 것이 분명합니다.
       */
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const rise = page.locator('.rise');
      const total = await rise.count();
      expect(total, '등장 요소가 하나도 없습니다').toBeGreaterThan(0);

      const stuck: string[] = [];
      for (let i = 0; i < total; i += 1) {
        const el = rise.nth(i);
        /*
         * `block: 'center'` 면 화면보다 크든 작든 `entry 45%` 를 반드시
         * 넘깁니다. 페이지 끝이라 가운데까지 못 가는 요소는 갈 수 있는 데까지
         * 갑니다 — 그 자리가 바로 이 검사가 묻는 자리입니다.
         */
        await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(400);

        let opacity = await el.evaluate((node) => Number(getComputedStyle(node).opacity));
        if (opacity < 0.99) {
          // Lenis 의 관성이 아직 남았을 수 있습니다. 한 번 더 기다려 봅니다.
          await page.waitForTimeout(700);
          opacity = await el.evaluate((node) => Number(getComputedStyle(node).opacity));
        }
        if (opacity < 0.99) {
          const name = await el.evaluate(
            (node) => `${node.tagName.toLowerCase()}.${(node.className || '').split(' ')[0]}`,
          );
          stuck.push(`${name}[${i}] = ${opacity.toFixed(2)}`);
        }
      }

      expect(
        stuck,
        `${path} — 제자리에 세워도 선명해지지 않는 요소가 있습니다: ${stuck.join(' / ')}`,
      ).toEqual([]);
    });
  }

  test('연출을 없애지는 않았다', async ({ page }) => {
    /*
     * 지시서가 못 박았습니다 — "스크롤 리빌을 통째로 제거하지 말 것. 초기
     * 상태만 바꾼다." 가장 쉬운 통과 방법은 `.rise` 를 지우는 것이므로,
     * 구조가 남아 있는지 함께 봅니다.
     */
    await page.goto('/ko/');
    expect(await page.locator('.rise').count()).toBeGreaterThan(0);

    /*
     * 범위 기준을 소스에서 못 박습니다. 위 `끝내 선명해진다` 검사가 실제
     * 결과를 보지만, 왜 `cover` 가 아닌지는 그 검사가 실패한 다음에야
     * 드러납니다. 여기서 먼저 막습니다.
     */
    const css = readFileSync('src/styles/global.css', 'utf8');
    const block = css.slice(
      css.indexOf('@supports (animation-timeline: view())'),
      css.indexOf('@keyframes rise-in'),
    );
    expect(block, '스크롤 타임라인 블록을 못 찾았습니다').toContain('animation-timeline: view()');
    expect(
      block,
      'animation-range 에 cover 를 썼습니다 — 페이지 마지막 요소가 영영 선명해지지 않습니다',
    ).not.toMatch(/animation-range:[^;]*\bcover\b/);

    const keyframes = css.slice(css.indexOf('@keyframes rise-in'), css.indexOf('@keyframes mark-draw'));
    expect(keyframes, '시작 불투명도가 토큰에서 오지 않습니다').toContain('--motion-rise-opacity');

    test.skip(
      !(await supportsViewTimeline(page)),
      '이 브라우저는 스크롤 타임라인을 지원하지 않습니다 — 연출 없이 처음부터 선명한 것이 맞습니다',
    );
    const belowFaded = await page.evaluate(
      () =>
        [...document.querySelectorAll('.rise')]
          .filter((el) => el.getBoundingClientRect().top > innerHeight)
          .filter((el) => Number(getComputedStyle(el).opacity) < 0.9).length,
    );
    expect(belowFaded, '화면 아래 섹션이 이미 다 드러났습니다 — 연출이 사라진 것입니다').toBeGreaterThan(0);
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
     * 예전에는 이 검사가 **안전망을 확인** 했습니다. `.js` 표식은 `<head>`
     * 인라인이 붙이고 `is-in` 은 문서 끝의 번들 모듈이 붙였는데 — 서로 다른
     * 실패 단위라 — 모듈만 죽으면 흐린 상태(대비 3.2:1)가 영구히 남았습니다.
     * 그 대가를 2초 타이머로 갚았고, 그 타이머는 다시 이 검사와 경합했습니다.
     *
     * 지금은 감추는 일이 CSS 애니메이션 안에 있어 **모듈과 아무 관계가
     * 없습니다.** 그래서 주장이 바뀝니다 — 안전망이 켜지는지가 아니라,
     * 모듈이 통째로 없어도 연출이 **그대로 동작하는지** 입니다.
     *
     * ⚠️ `route.abort()` 를 쓰지 않습니다. 요청을 끊으면 서버 쪽에
     * `Broken pipe` 가 쌓입니다. CI 로그에서 그 오류가 줄줄이 나온 뒤 세
     * 샤드가 `ECONNREFUSED 8787` 로 무너졌습니다. 원인을 이 검사로 단정할
     * 수는 없지만, 같은 목적을 연결을 끊지 않고 이룰 수 있으면 그쪽이
     * 맞습니다. 빈 스크립트로 **정상 응답** 합니다.
     */
    await page.route('**/_astro/*.js', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
    );

    const worst = await worstOpacityWhileFlicking(page, '/ko/');
    expect(
      worst,
      `모듈이 없을 때 화면을 채운 요소가 opacity ${worst} 까지 흐려졌습니다`,
    ).toBeGreaterThanOrEqual(FLOOR);
  });

  test('모션을 줄이면 즉시 보인다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/ko/');
    const rows = await page.locator('.rise').evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return { o: Number(cs.opacity), t: cs.transform, a: cs.animationName };
      }),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.o, '모션 최소화인데 흐립니다').toBe(1);
      expect(r.t, '모션 최소화인데 밀려 있습니다').toBe('none');
      expect(r.a, '모션 최소화인데 등장 애니메이션이 걸려 있습니다').toBe('none');
    }
  });
});
