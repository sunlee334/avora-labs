import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 홈의 섹션 구성.
 *
 * ── 무엇을 지키는가 ────────────────────────────────────────
 * 1. **순서** — 각 섹션이 하나의 역할만 갖고, 그 역할이 앞뒤와 이어집니다.
 *    "왜 필요한가(문제) → 어떻게(방법) → 근거(배점) → 누가(검증단)" 의 순서가
 *    무너지면 배점표가 모집 공고의 부속물처럼 읽힙니다.
 * 2. **배경 리듬** — 같은 배경이 셋 이어지면 그 구간이 한 덩어리로 보입니다.
 *    Phase I 이 세운 규칙이고, 섹션을 더할 때 가장 먼저 깨지는 것입니다.
 */

/** J2 가 정한 열한 자리. 순서가 곧 이야기의 순서입니다. */
const ORDER = [
  'hero',
  'the_problem',
  'the_choice',
  'criteria',
  'test_panel',
  'timeline',
  'first_product',
  'the_journey',
  'company',
  'home_faq',
  'limits',
  'brand_bridge',
];

/** 히어로에 붙어 있는 폼. 역할 열두 가지에는 들어가지 않습니다. */
const ATTACHED = new Set(['hero_notify']);

/*
 * 배경은 **클래스가 아니라 실제로 칠해진 색** 으로 읽습니다.
 *
 * 클래스 이름으로 가르면 `.section--attach` 처럼 여백만 주고 배경을 칠하지
 * 않는 클래스를 다른 밴드로 세게 됩니다. 그러면 실제로는 같은 지반이 셋
 * 이어지는데도 검사가 통과합니다. 눈에 보이는 것이 규칙의 대상입니다.
 */
async function sections(page: import('@playwright/test').Page) {
  return page.locator('section[data-section]').evaluateAll((nodes) => {
    const ground = getComputedStyle(document.body).backgroundColor;
    return nodes.map((el) => {
      const box = el.getBoundingClientRect();
      /*
       * 사진이 덮은 섹션은 지반이 아니라 **사진** 입니다. 히어로가 그렇습니다 —
       * CSS 배경색은 투명이지만 보이는 것은 사진이라, 색으로 세면 뒤따르는
       * 지반 섹션들과 한 덩어리로 잘못 묶입니다.
       * 클래스 이름으로 가르지 않고, 섹션을 실제로 덮는 이미지가 있는지 봅니다.
       */
      const covered = [...el.querySelectorAll('img')].some((img) => {
        const r = img.getBoundingClientRect();
        return r.width * r.height >= box.width * box.height * 0.9;
      });
      if (covered) return { name: el.getAttribute('data-section') ?? '', band: 'photo' };

      const own = getComputedStyle(el).backgroundColor;
      // 투명하면 뒤의 지반이 그대로 보입니다 — 그것이 이 섹션의 배경입니다.
      const painted = own === 'rgba(0, 0, 0, 0)' || own === 'transparent' ? ground : own;
      return { name: el.getAttribute('data-section') ?? '', band: painted };
    });
  });
}

test.describe('홈 섹션', () => {
  test('열두 자리가 정해진 순서대로 선다', async ({ page }) => {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/`);
      const found = (await sections(page)).map((s) => s.name).filter((n) => !ATTACHED.has(n));
      expect(found, `${locale} 홈 섹션 구성이 다릅니다`).toEqual(ORDER);
    }
  });

  test('같은 배경이 셋 이어지지 않는다', async ({ page }) => {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/`);
      const bands = (await sections(page)).map((s) => s.band);
      let run = 1;
      for (let i = 1; i < bands.length; i++) {
        run = bands[i] === bands[i - 1] ? run + 1 : 1;
        expect(
          run,
          `${locale} 에서 ${bands[i]} 배경이 ${run}연속입니다 — ${bands.join(' · ')}`,
        ).toBeLessThan(3);
      }
    }
  });

  test('새 섹션을 넣어도 가로로 넘치지 않는다', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', '좁은 화면 규칙입니다');
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${locale} 홈이 가로로 ${overflow}px 넘칩니다`).toBeLessThanOrEqual(0);
    }
  });
});
