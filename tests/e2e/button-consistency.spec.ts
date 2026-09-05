import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 같은 역할의 버튼이 같게 그려지는가.
 *
 * ── 무엇이 어긋났나 ────────────────────────────────────────
 * 버튼처럼 보이는 스타일이 일곱이었습니다. 같은 라벨("출시 알림 받기")이
 * 자리에 따라 15px 과 14px 로 달랐고, 여백은 24px 과 28px 이 섞였습니다.
 *
 * 가장 잡기 어려운 것은 **1px** 이었습니다. `<button>` 의 브라우저 기본
 * 여백이 위아래 1px 남아, 같은 클래스인데 `<a>` 는 0px, `<button>` 은 1px 이
 * 됩니다. 나란히 놓으면 눈에 보입니다.
 *
 * ── 하나로 합쳤습니다 ──────────────────────────────────────
 * `.cta` 25곳을 `.btn--primary` 로 옮기고 정의를 지웠습니다. 채움색이 잉크에서
 * 캠페인 오렌지로 바뀌는 결정이 함께 있었습니다.
 */

const TEXT_BUTTON = '.btn:not(.btn--tertiary)';
const ICON_BUTTON = '.lang__toggle, .journey__arrow';

test.describe('버튼 일관성', () => {
  test('텍스트 버튼이 14px · 여백 24px · 반경 8px 이다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const seen: string[] = [];
    for (const path of ['/ko/', '/ko/product/', '/ko/brand/']) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const rows = await page.evaluate((sel) => {
        return [...document.querySelectorAll(sel)].map((el) => {
          const c = getComputedStyle(el);
          return `${c.fontSize}|${c.paddingLeft}|${c.borderTopLeftRadius}`;
        });
      }, TEXT_BUTTON);
      seen.push(...rows);
    }
    const unique = [...new Set(seen)];
    expect(unique.length, `텍스트 버튼 스타일이 ${unique.join(' / ')} 입니다`).toBe(1);
    expect(unique[0]).toBe('14px|24px|8px');
  });

  test('<button> 과 <a> 의 높이가 정확히 같다', async ({ page }) => {
    /*
     * 제품 페이지에 둘이 함께 있습니다. `padding-block: 0` 과
     * `box-sizing: border-box` 가 없으면 여기서 1px 이 벌어집니다.
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/product/');
    await page.evaluate(() => document.fonts.ready);

    const h = await page.evaluate(() => {
      const pick = (tag: string) => {
        const el = [...document.querySelectorAll(`${tag}.btn`)][0];
        return el ? +el.getBoundingClientRect().height.toFixed(2) : null;
      };
      return { a: pick('a'), button: pick('button') };
    });
    expect(h.a, '<a>.btn 이 없습니다').not.toBeNull();
    expect(h.button, '<button>.btn 이 없습니다').not.toBeNull();
    expect(h.button, `<a> ${h.a}px vs <button> ${h.button}px`).toBe(h.a);
  });

  test('아이콘 버튼 둘이 같은 여백을 쓴다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);
    const pads = await page.evaluate((sel) => {
      const out = new Set<string>();
      for (const el of document.querySelectorAll(sel)) {
        const c = getComputedStyle(el);
        out.add(`${c.paddingTop}|${c.paddingLeft}`);
      }
      return [...out];
    }, ICON_BUTTON);
    expect(pads.length, `아이콘 버튼 여백이 ${pads.join(' / ')} 입니다`).toBe(1);
    expect(pads[0], '브라우저 기본 여백 1px 이 남아 있습니다').toBe('0px|12px');
  });

  test('텍스트 버튼에 알약형을 쓰지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const bad: string[] = [];
    for (const path of ['/ko/', '/ko/product/', '/ko/brand/']) {
      await page.goto(path);
      const rows = await page.evaluate((sel) => {
        const out: string[] = [];
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius);
          // 알약은 높이의 절반 이상으로 둥급니다.
          if (r.height > 0 && radius >= r.height / 2) out.push(`${(el.textContent ?? '').trim().slice(0, 14)} r=${radius}`);
        }
        return out;
      }, TEXT_BUTTON);
      bad.push(...rows);
    }
    expect(bad, `알약형 텍스트 버튼: ${bad.join(', ')}`).toEqual([]);
  });

  test('한 화면에 오렌지가 둘 서지 않는다', async ({ page }) => {
    /*
     * `Button.astro` 가 처음부터 적어 둔 규칙입니다.
     *
     *   "primary — 캠페인 오렌지 채움. **한 화면에 하나만.**
     *    오렌지가 흩어지면 브랜드 시그널이 아니라 배경색이 됩니다"
     *
     * 그런데 지켜 주는 것이 없었습니다. `.cta` 25곳을 `.btn--primary` 로 옮기자
     * 홈에서 `고르는 기준 보기`(이동)와 `출시 알림 받기`(제출)가 130px 안에
     * 나란히 섰습니다. 배포한 화면을 눈으로 보고서야 드러났습니다.
     *
     * ⚠️ **문서 전체의 개수를 세지 않습니다.**
     * 홈에는 알림 폼이 셋입니다(첫 화면 · 검증단 섹션 · 하단 시트). 규칙이 말하는
     * 것은 **한 화면** 이므로 화면을 훑으며 그 순간 함께 보이는 것만 셉니다.
     *
     * ⚠️ **같은 라벨은 하나로 셉니다.**
     * 390px 에서는 페이지가 길어져 그 알림 폼 중 둘이 한 화면에 들어옵니다.
     * 둘 다 `출시 알림 받기` 로 **같은 행동** 이고, 규칙이 막는 것은 서로 다른
     * 행동이 같은 무게로 경쟁하는 것입니다. 같은 요청을 긴 페이지에서 되묻는
     * 것은 경쟁이 아닙니다 — CI 의 mobile 샤드가 이것을 잡아 주었습니다.
     */
    for (const path of ['/ko/', '/ko/product/', '/ko/brand/', '/ko/cart/']) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);

      const worst = await page.evaluate(async () => {
        const seen: { n: number; labels: string[]; y: number } = { n: 0, labels: [], y: 0 };
        const step = Math.round(innerHeight * 0.6);
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
          const here = [...document.querySelectorAll('.btn--primary')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
          });
          // 같은 라벨은 같은 행동입니다. 서로 다른 것이 몇 가지인지만 봅니다.
          const labels = [...new Set(here.map((el) => (el.textContent ?? '').trim()))];
          if (labels.length > seen.n) {
            seen.n = labels.length;
            seen.labels = labels.map((t) => t.slice(0, 18));
            seen.y = y;
          }
        }
        return seen;
      });

      expect(
        worst.n,
        `${path} 의 ${worst.y}px 지점에 서로 다른 오렌지가 ${worst.n}개 함께 보입니다: ${worst.labels.join(' / ')}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test('지워진 클래스가 어디에도 남아 있지 않다', async ({ page }) => {
    /*
     * ⚠️ **마크업만 훑으면 놓칩니다.**
     *
     * `.cta` 를 `.btn` 으로 옮길 때 `class="..."` 속성 25곳은 바꿨는데,
     * 스크립트가 `className = 'cta'` 로 만드는 버튼 하나를 놓쳤습니다.
     * 정의는 이미 지운 뒤라 그 버튼만 44px 을 잃고 28px 이 됐습니다 —
     * 로그인해야 보이는 화면이라 눈에도 잘 안 띕니다.
     *
     * 그래서 **그려진 문서** 를 봅니다.
     */
    for (const path of ['/ko/', '/ko/product/', '/ko/brand/', '/ko/support/']) {
      await page.goto(path);
      const left = await page.evaluate(() =>
        [...document.querySelectorAll('[class*="cta"]')]
          .map((el) => (el.className || '').toString())
          .filter((c) => /\bcta\b/.test(c)),
      );
      expect(left, `${path} 에 남아 있습니다: ${left.join(', ')}`).toEqual([]);
    }
  });

  for (const lang of LOCALES) {
    test(`/${lang}/ — 버튼 라벨이 잘리지 않는다`, async ({ page }) => {
      /*
       * 베트남어가 가장 깁니다. 여백을 24px 로 통일했으므로 그만큼 좁아진
       * 자리에서 라벨이 넘치는지 봅니다.
       */
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${lang}/`);
      await page.evaluate(() => document.fonts.ready);
      const clipped = await page.evaluate((sel) => {
        const out: string[] = [];
        for (const el of document.querySelectorAll(sel)) {
          if (el.scrollWidth > el.clientWidth + 1) {
            out.push(`${(el.textContent ?? '').trim().slice(0, 18)} ${el.scrollWidth}>${el.clientWidth}`);
          }
        }
        return out;
      }, TEXT_BUTTON);
      expect(clipped, `잘린 라벨: ${clipped.join(', ')}`).toEqual([]);
    });
  }
});
