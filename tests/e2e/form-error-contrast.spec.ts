import { test, expect } from '@playwright/test';

/**
 * 오류 문구가 실제로 놓인 자리에서 읽히는가.
 *
 * ── 왜 팔레트 값으로 재지 않나 ─────────────────────────────
 * `--color-error`(#A33F13)는 기본 배경에서 6.04:1 이지만 어두운 면(#252B31)
 * 위에서는 **2.24:1** 로 무너집니다. 팔레트를 재는 검사는 그 사실을 못 봅니다 —
 * 값은 하나인데 자리가 여럿이기 때문입니다.
 *
 * `tokens-contrast.spec.ts` 는 팔레트 조합을 재고, 여기서는 **렌더된 자리의
 * 색과 그 뒤에 실제로 깔린 면** 을 잽니다. 폼이 어두운 밴드로 옮겨지는 날
 * 여기서 걸립니다.
 *
 * ── 숨어 있어도 잽니다 ─────────────────────────────────────
 * 오류 자리는 평소 `hidden` 입니다(자리를 미리 만들어 두지 않으면 오류가
 * 뜨는 순간 아래 내용이 밀립니다). `display: none` 이어도 계산된 색은
 * 나오므로, 오류를 실제로 띄우지 않고도 잴 수 있습니다.
 */

/** 두 모드에 모두 있는 화면만 봅니다 — 모드 전용 화면은 각 모드의 검사가 봅니다. */
const PAGES = ['/ko/', '/ko/product', '/ko/support', '/ko/order/lookup', '/ko/panel', '/ko/reviews'];

/** 오류를 말하는 자리들. 색만으로 말하지는 않지만, 색도 읽혀야 합니다. */
const ERROR_MARKS = '.field__error, [data-tone="bad"], .notify__error';

const channels = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

function luminance(color: string): number {
  const [r, g, b] = channels(color).map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test.describe('오류 문구는 놓인 자리에서 읽힌다', () => {
  for (const path of PAGES) {
    test(`${path} — 오류 색이 그 배경에서 4.5:1 이상이다`, async ({ page }) => {
      await page.goto(path);

      const marks = await page.evaluate((selector) => {
        /* 문구 자체는 배경이 투명합니다. 뒤에 실제로 깔린 면을 찾아 올라갑니다. */
        const surfaceOf = (start: Element) => {
          let node: HTMLElement | null = start as HTMLElement;
          while (node) {
            const value = getComputedStyle(node).backgroundColor;
            if (value && !/rgba\(0, 0, 0, 0\)|transparent/.test(value)) return value;
            node = node.parentElement;
          }
          return 'rgb(255, 255, 255)';
        };
        return [...document.querySelectorAll(selector)].map((el) => ({
          이름:
            (el as HTMLElement).id ||
            el.getAttribute('data-error-for') ||
            `${el.tagName.toLowerCase()}.${(el.className || '').split(' ')[0]}`,
          색: getComputedStyle(el).color,
          면: surfaceOf(el),
        }));
      }, ERROR_MARKS);

      /*
       * 이 화면에 오류 자리가 없는 것은 결함이 아닙니다 — 폼이 없거나
       * 모집이 닫혀 있을 수 있습니다. 다만 **전 화면에 하나도 없으면**
       * 이 검사는 아무것도 재지 못하므로, 그건 아래에서 따로 봅니다.
       */
      for (const mark of marks) {
        const ratio = contrast(mark.색, mark.면);
        expect(
          ratio,
          `${path} 의 «${mark.이름}» 이 ${mark.색} / ${mark.면} 에서 ${ratio.toFixed(2)}:1 입니다`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  test('잰 자리가 하나도 없지는 않다', async ({ page }) => {
    /*
     * 위 검사는 오류 자리가 없으면 조용히 통과합니다. 마크업이 바뀌어
     * `.field__error` 가 다른 이름이 되면 **검사가 0건을 재면서 초록** 이
     * 됩니다 — 이 저장소가 여러 번 겪은 실패 모드입니다.
     */
    let total = 0;
    for (const path of PAGES) {
      await page.goto(path);
      total += await page.locator(ERROR_MARKS).count();
    }
    expect(total, '어느 화면에서도 오류 자리를 찾지 못했습니다 — 선택자가 낡았습니다').toBeGreaterThan(0);
  });
});
