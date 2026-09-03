import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/*
 * 하단 바는 **알림 신청을 받는 동안에만** 존재합니다(`!CAN_ORDER`). 팔기
 * 시작하면 알림 신청 자체가 사라지므로 바도 함께 사라집니다. commerce 모드로
 * 도는 실행에서는 가릴 바가 없으니 이 묶음은 건너뜁니다.
 */
const SELLS = process.env.E2E_MODE !== 'launch';

/**
 * 하단 고정 바가 무언가를 영영 가리지 않는가.
 *
 * ── 지시서의 주장과 실측이 갈린 자리다 ─────────────────────
 * 지시서(05-UI수정 2절)는 "본문 하단에 CTA 높이만큼의 여백이 없어 배점표 하단
 * 항목이 가려진다" 며 `main { padding-bottom: 85px }` 을 요구했습니다.
 *
 * 재 보니 그렇지 않았습니다.
 *
 *   · 지시서가 지목한 **배점표는 `/panel` 에 있고, 그 화면에는 바가 없습니다.**
 *   · 홈에서 모든 조작 요소를 하나씩 화면 가운데로 데려와 `elementFromPoint`
 *     로 확인하니, 바가 가로채는 것은 **0개** 였습니다(390·1280 둘 다).
 *   · 페이지 맨 아래에서는 바가 내려가 있습니다 — `StickyNotify.astro` 가
 *     푸터를 억제 대상에 넣어 둔 대로 동작합니다.
 *
 * 고정 바가 스크롤 중에 글자를 잠깐 덮는 것은 결함이 아니라 고정 바의 성질
 * 입니다. 조금 더 굴리면 빠져나옵니다. **영영 못 보는 것이 있을 때만** 결함
 * 입니다. 그래서 여백을 넣지 않았습니다 — 넣으면 잘 도는 설계에 죽은 공간만
 * 생깁니다.
 *
 * 대신 지금 성립하는 것을 여기 못 박습니다. 나중에 누가 바를 키우거나 푸터
 * 억제를 떼면 이 검사가 먼저 말합니다.
 *
 * ⚠️ **스크롤이 멎기를 기다려야 합니다.** 이 사이트는 Lenis 로 스크롤을
 * 부드럽게 만들어, `scrollTo` 한 번으로는 목표에 닿지 않습니다. 처음 쟀을 때
 * 바닥까지 1,356px 을 남기고 멈춘 상태로 "바가 안 내려간다" 는 결론을 낼
 * 뻔했습니다.
 */

/** Lenis 가 스크롤을 lerp 합니다. 값이 멎을 때까지 밀어 둡니다. */
async function settleAt(page: import('@playwright/test').Page, target: number | 'bottom') {
  await page.evaluate(async (t) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 25; i += 1) {
      const y = t === 'bottom' ? document.body.scrollHeight : (t as number);
      window.scrollTo(0, y);
      await sleep(80);
      const prev = window.scrollY;
      await sleep(90);
      if (Math.abs(window.scrollY - prev) < 1) break;
    }
  }, target);
}

test.describe('하단 고정 바', () => {
  test.skip(SELLS, '팔기 시작하면 하단 알림 바가 존재하지 않습니다');

  test('페이지 맨 아래에서는 내려간다', async ({ page }) => {
    await page.goto('/ko/');
    await settleAt(page, 'bottom');

    const state = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>('.stickyCta');
      const footer = document.querySelector('.footer')!.getBoundingClientRect();
      return {
        exists: Boolean(bar),
        shown: bar?.dataset.shown,
        footerVisible: footer.top < window.innerHeight,
        landed: Math.round(window.scrollY),
        max: Math.round(document.body.scrollHeight - window.innerHeight),
      };
    });

    expect(state.exists, '홈에 하단 바가 없습니다').toBe(true);
    // 바닥에 닿았는지부터 확인합니다 — 안 닿았으면 아래 판정이 의미 없습니다.
    expect(state.max - state.landed, '스크롤이 바닥에 닿지 않았습니다').toBeLessThan(4);
    expect(state.footerVisible, '푸터가 화면에 없습니다').toBe(true);
    expect(state.shown, '푸터가 보이는데 바가 떠 있습니다').not.toBe('true');
  });

  test('영영 못 누르는 조작 요소가 없다', async ({ page }) => {
    /*
     * 사용자가 실제로 하는 일을 그대로 합니다 — 누르고 싶은 것을 화면
     * 가운데로 가져온 뒤, 그 자리에서 무엇이 잡히는지 봅니다.
     *
     * ⚠️ **이 검사는 바를 키우는 회귀를 잡지 않습니다.** 대상을 화면 세로
     * 가운데로 데려온 뒤 그 지점을 보므로, 바가 세 배가 되어도 화면 중앙
     * (844px 화면의 y=422)에는 닿지 않습니다. 이 검사의 주장은 "**영영** 못
     * 보는 것이 없다" 이고 그 주장에는 이 방법이 맞지만, 회귀 그물로서의
     * 감도는 낮습니다.
     *
     * ⚠️ 이 검사는 `setViewportSize` 를 하지 않습니다. 두 폭이 확인되는 것은
     * `playwright.config.ts` 의 mobile(iPhone 14)·desktop(1280×900) **두
     * 프로젝트** 덕분입니다. 프로젝트 목록이 한쪽으로 줄면 이 검사도 조용히
     * 한 폭만 보게 됩니다 — 그때 이 주석이 단서가 됩니다.
     */
    await page.goto('/ko/');
    const blocked = await page.evaluate(async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const settle = async (t: number) => {
        for (let i = 0; i < 25; i += 1) {
          window.scrollTo(0, t);
          await sleep(80);
          const prev = window.scrollY;
          await sleep(90);
          if (Math.abs(window.scrollY - prev) < 1) break;
        }
      };
      const bar = document.querySelector('.stickyCta')!;
      const out: string[] = [];
      const targets = [...document.querySelectorAll('a[href],button,input,label')].filter(
        (el) => !bar.contains(el) && el.getBoundingClientRect().height > 0,
      );
      for (const el of targets) {
        const absTop = el.getBoundingClientRect().top + window.scrollY;
        await settle(Math.max(0, absTop - window.innerHeight / 2));
        const q = el.getBoundingClientRect();
        if (q.bottom < 0 || q.top > window.innerHeight) continue;
        const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        if (hit && bar.contains(hit)) {
          out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}"`);
        }
      }
      return [...new Set(out)];
    });

    expect(blocked, `하단 바가 가로채는 조작 요소: ${blocked.join(' / ')}`).toEqual([]);
  });

  test('바가 안전영역을 계산한다', async ({ page }) => {
    /*
     * 노치가 있는 기기에서 버튼 아래가 홈 인디케이터에 겹치지 않도록
     * `env(safe-area-inset-bottom)` 을 더합니다. 시뮬레이터가 없는 곳에서는
     * 그 값이 0 이라 화면으로는 확인되지 않으므로, 선언 자체를 봅니다.
     */
    const css = readFileSync('src/styles/global.css', 'utf8');
    const rule = css.slice(css.indexOf('.stickyCta {'), css.indexOf('.stickyCta[data-shown'));
    expect(rule, '.stickyCta 규칙을 못 찾았습니다').toContain('padding');
    expect(rule, '안전영역 계산이 없습니다').toMatch(/env\(safe-area-inset-bottom\)/);
  });

  test('바가 없는 화면에는 여백도 없다', async ({ page }) => {
    /*
     * `/panel` 에는 하단 바가 없습니다. 지시서는 이 화면의 배점표가 바에
     * 가려진다고 적었지만, 가릴 바가 여기엔 존재하지 않습니다.
     *
     * 그러므로 이 화면에 바를 위한 여백이 생기면 그건 순수한 죽은 공간입니다.
     */
    await page.goto('/ko/panel');
    await expect(page.locator('.stickyCta')).toHaveCount(0);
    const pb = await page
      .locator('main')
      .evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(pb, '바도 없는데 바를 위한 여백이 있습니다').toBe('0px');
  });
});
