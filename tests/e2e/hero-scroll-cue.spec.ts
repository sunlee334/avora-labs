import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 히어로 아래에 더 있다는 표시.
 *
 * ── 이 검사가 지키는 것 ────────────────────────────────────
 * 표시가 **보이는가**, 그리고 **아무것도 가리지 않는가** 입니다. 화면 아래
 * 69px 짜리 고정 CTA 바와 겹치면 둘 다 못 읽습니다. 히어로 CTA 버튼에 붙으면
 * 버튼의 일부처럼 보입니다.
 *
 * ── 지시서가 못 박은 조건 ──────────────────────────────────
 *   · 하단 고정 CTA(69px)와 겹치지 않는다
 *   · `env(safe-area-inset-bottom)` 을 고려한다
 *   · `prefers-reduced-motion: reduce` 에서 애니메이션 없이 **표시된다**
 *
 * 마지막 조건이 핵심입니다. 움직임을 끄면서 표시까지 지우면 요구가 사라집니다.
 */

const CUE = '.hero__cue';

/*
 * 하단 고정 바는 **알림 신청을 받는 동안에만** 존재합니다(`!CAN_ORDER`).
 * 팔기 시작하면 바가 사라지므로 겹칠 대상도 없습니다.
 * `sticky-cta-clearance.spec.ts` 와 같은 관용구입니다.
 */
const SELLS = process.env.E2E_MODE !== 'launch';

/** 두 사각형이 실제로 겹치는가. */
const overlaps = `(a, b) =>
  !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)`;

test.describe('히어로 스크롤 큐', () => {
  for (const locale of LOCALES) {
    test(`${locale} — 큐가 그려진다`, async ({ page }) => {
      await page.goto(`/${locale}/`);
      const cue = page.locator(CUE);
      await expect(cue, '큐가 없습니다').toHaveCount(1);
      await expect(cue).toBeVisible();

      const box = await cue.boundingBox();
      expect(box, '큐에 크기가 없습니다').not.toBeNull();
      expect(box!.height, '큐가 너무 낮아 보이지 않습니다').toBeGreaterThan(20);

      // 문구를 넣지 않았는가 — 히어로에는 이미 네 요소가 있습니다.
      expect((await cue.innerText()).trim(), '큐에 글자가 들어갔습니다').toBe('');
      // 읽어 줄 정보가 없으므로 접근성 트리에서 빠져야 합니다.
      await expect(cue).toHaveAttribute('aria-hidden', 'true');
    });
  }

  for (const width of [360, 390, 1280]) {
    test(`${width}px — 하단 고정 CTA 바에 겹치지 않는다`, async ({ page }) => {
      test.skip(SELLS, '팔기 시작하면 하단 알림 바가 존재하지 않습니다');
      await page.setViewportSize({ width, height: width < 400 ? 844 : 900 });
      await page.goto('/ko/');
      await page.evaluate(() => document.fonts.ready);

      const hit = await page.evaluate(
        ([sel, fnSource]) => {
          const hits = new Function(`return ${fnSource}`)() as (a: DOMRect, b: DOMRect) => boolean;
          const cue = document.querySelector(sel)!.getBoundingClientRect();
          const sticky = document.querySelector('.stickyCta') as HTMLElement;
          /*
           * 바는 평소 화면 밖에 있습니다. 숨어 있을 때 재면 "안 겹친다" 는
           * 당연한 결과가 나와 검사가 아무것도 지키지 못합니다. 강제로
           * 띄워 놓고 잽니다.
           *
           * ⚠️ `transition` 을 먼저 꺼야 합니다. 바는 0.24s 에 걸쳐 올라오는데
           * 속성만 켜고 바로 재면 **아직 화면 밖인 위치** 를 읽습니다. 이걸
           * 빠뜨려 검사가 헛돌았습니다 — 큐를 화면 바닥에 고정해 놓고도
           * "겹치지 않는다" 로 통과했습니다.
           */
          sticky.style.transition = 'none';
          sticky.dataset.shown = 'true';
          void sticky.offsetHeight; // 강제 리플로우
          const bar = sticky.getBoundingClientRect();
          return {
            sticky: hits(cue, bar),
            barHeight: Math.round(bar.height),
            barTop: Math.round(bar.top),
            viewport: window.innerHeight,
            gap: Math.round(bar.top - cue.bottom),
          };
        },
        [CUE, overlaps] as const,
      );

      expect(hit.barHeight, '고정 바가 뜨지 않았습니다 — 겹침을 잰 적이 없습니다').toBeGreaterThan(
        40,
      );
      // 바가 정말 화면 안으로 올라왔는가. 밖에 있으면 아래 단언이 공짜로 통과합니다.
      expect(hit.barTop, '고정 바가 아직 화면 밖입니다 — 겹침을 잰 적이 없습니다').toBeLessThan(
        hit.viewport,
      );
      expect(hit.sticky, '큐가 하단 고정 CTA 바에 겹칩니다').toBe(false);
      expect(hit.gap, `큐와 바 사이가 ${hit.gap}px 입니다`).toBeGreaterThan(0);
    });
  }

  for (const width of [360, 390, 1280]) {
    test(`${width}px — 큐가 히어로 글자와 버튼을 비켜 선다`, async ({ page }) => {
      /*
       * 위 검사는 하단 고정 바가 있는 모드에서만 돕니다. 이 검사는 **두
       * 모드에서 모두** 돌아야 합니다 — 그러지 않으면 자사 결제가 켜진
       * 상태에서는 큐 위치를 아무도 확인하지 않습니다.
       *
       * ⚠️ 그래서 히어로 **버튼** 을 기준으로 삼으면 안 됩니다. 그 버튼은
       * `{!CAN_ORDER && …}` 안이라 commerce 모드에는 없습니다. 처음에 그렇게
       * 썼다가 `getBoundingClientRect of null` 로 죽었습니다.
       *
       * 대신 히어로 카피의 **모든 자식** 을 봅니다. launch 에서는 버튼이 그
       * 안에 있고, commerce 에서는 태그라인·부제·2차 메시지가 남습니다.
       * 어느 쪽이든 큐가 글자 위에 얹히면 안 된다는 요구는 같습니다.
       */
      await page.setViewportSize({ width, height: width < 400 ? 844 : 900 });
      await page.goto('/ko/');
      await page.evaluate(() => document.fonts.ready);

      const overlapping = await page.evaluate(
        ([sel, fnSource]) => {
          const hits = new Function(`return ${fnSource}`)() as (a: DOMRect, b: DOMRect) => boolean;
          const cue = document.querySelector(sel)!.getBoundingClientRect();
          const parts = [...document.querySelectorAll('.hero__copy > *')].filter(
            (el) => el.getBoundingClientRect().height > 0,
          );
          return {
            count: parts.length,
            hit: parts
              .filter((el) => hits(cue, el.getBoundingClientRect()))
              .map((el) => `${el.className || el.tagName}`),
          };
        },
        [CUE, overlaps] as const,
      );

      // 볼 것이 없으면 이 검사는 아무것도 지키지 못합니다.
      expect(overlapping.count, '히어로 카피에 요소가 없습니다').toBeGreaterThan(0);
      expect(
        overlapping.hit,
        `큐가 «${overlapping.hit.join(', ')}» 위에 얹혔습니다`,
      ).toEqual([]);
    });
  }

  test('홈 인디케이터 자리를 비켜 둔다', async ({ page }) => {
    /*
     * `env(safe-area-inset-bottom)` 은 데스크톱 브라우저에서 0 이라 값으로는
     * 확인할 수 없습니다. 대신 **식에 들어 있는지** 를 소스에서 봅니다 —
     * 빠지면 노치 있는 기기에서 홈 인디케이터에 걸립니다.
     */
    await page.goto('/ko/');
    const css = await page.evaluate(async () => {
      const href = [...document.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet]')].map(
        (l) => l.href,
      );
      const all = await Promise.all(href.map((h) => fetch(h).then((r) => r.text())));
      return all.join('\n');
    });
    const rule = css.match(/\.hero__cue\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule, '.hero__cue 규칙을 찾지 못했습니다').not.toBe('');
    expect(rule, 'safe-area-inset-bottom 이 빠졌습니다').toContain('safe-area-inset-bottom');
  });

  test.describe('움직임을 줄인 환경', () => {
    test('애니메이션은 멈추되 표시는 남는다', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/ko/');
      const cue = page.locator(CUE);
      await expect(cue, '움직임을 껐더니 표시까지 사라졌습니다').toBeVisible();

      const state = await page.locator('.hero__cue-dot').evaluate((el) => {
        const s = getComputedStyle(el);
        return { anim: s.animationName, opacity: s.opacity, top: s.top };
      });
      expect(state.anim, '애니메이션이 계속 돕니다').toBe('none');
      expect(Number(state.opacity), '점이 투명해 보이지 않습니다').toBeGreaterThan(0.5);
      // 점이 선 아래 끝에 서 있어야 방향을 가리킵니다.
      expect(parseFloat(state.top), '점이 위쪽에 멈춰 아래를 가리키지 않습니다').toBeGreaterThan(20);
    });
  });
});
