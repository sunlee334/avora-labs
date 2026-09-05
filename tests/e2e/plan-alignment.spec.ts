import { test, expect } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };

/**
 * 제품 기획안(PAROS 선크림 제품기획안 v1.0, 2026-08-28)이 사이트에 요구하는 것.
 *
 * 여기 있는 검사는 취향이 아니라 문서에 근거가 있는 항목만 담습니다.
 *
 *   2-2 / 2-2-2 / 2-2-4  차별화의 축을 완성된 제품이 아니라 고르는 과정에 둔다.
 *                        메시지 위계는 1차 헤드라인 → 2차 근거 → 3차 스펙.
 *   2-2-3 말하지 않을 것  눈 시림·백탁은 이미 경쟁 브랜드가 선점한 언어라
 *                        헤드라인에 세우지 않는다. 스펙 구간에서만 담담하게.
 *   4장 각주             처방 선정 전이고 시험 성적서도 없다. 단정하지 않는다.
 */

const LANGS = ['ko', 'en', 'zh', 'th', 'vi'] as const;

test.describe('고르는 과정 — 기획안 2-2 의 근거층', () => {
  test('5개 언어 모두 검증단 자리가 있다', async ({ page }) => {
    // 한 언어만 고치고 나머지 넷을 두면, 그 넷을 보는 사람에게는
    // 사이트가 여전히 스펙 나열입니다.
    for (const lang of LANGS) {
      await page.goto(`/${lang}/`);
      await expect(page.locator('#panel'), lang).toHaveCount(1);
      /*
       * 배점표는 Phase J 에서 `#panel` 밖의 독립 섹션으로 나왔습니다 —
       * 한 섹션은 한 역할만 갖기 위해서입니다. 지키려는 것은 "근거가 홈에
       * 있다" 이지 "그것이 #panel 안에 있다" 가 아니므로, 선택자만 옮깁니다.
       */
      await expect(page.locator('[data-section="criteria"] .criteriaTable'), lang).toHaveCount(1);
    }
  });

  test('평가 항목 여섯 가지에 각각 확인 방법이 붙어 있다', async ({ page }) => {
    // 기획안 4-5 의 평가표가 여섯 항목입니다. 항목만 늘어놓고 어떻게
    // 확인하는지 적지 않으면 "검증했다" 는 말과 다르지 않습니다.
    for (const lang of LANGS) {
      await page.goto(`/${lang}/`);
      const rows = page.locator('[data-section="criteria"] .criteriaTable tbody tr');
      await expect(rows, lang).toHaveCount(6);
      for (let i = 0; i < 6; i += 1) {
        // 항목 이름과 **확인 방법** 이 둘 다 있어야 합니다. 항목만 늘어놓는
        // 것은 "검증했다" 는 말과 다르지 않습니다.
        await expect(rows.nth(i).locator('th[scope="row"]'), `${lang} ${i}`).not.toBeEmpty();
        await expect(rows.nth(i).locator('td').first(), `${lang} ${i}`).not.toBeEmpty();
      }
    }
  });

  test('근거가 스펙보다 위에 온다', async ({ page }) => {
    // 기획안 2-2-4 의 위계입니다. 근거층이 스펙 아래로 내려가면
    // 스펙을 먼저 읽은 사람에게는 뒤늦은 변명처럼 읽힙니다.
    await page.goto('/ko/');
    const pos = await page.evaluate(() => {
      const y = (el: Element | null | undefined) =>
        el ? el.getBoundingClientRect().top + window.scrollY : -1;
      const link = document.querySelector('main a.btn[href$="/product/"]');
      return {
        panel: y(document.querySelector('#panel')),
        spec: y(link?.closest('section')),
      };
    });
    expect(pos.panel).toBeGreaterThan(0);
    expect(pos.spec).toBeGreaterThan(0);
    expect(pos.panel, '근거층이 스펙 섹션보다 위에 있어야 합니다').toBeLessThan(pos.spec);
  });
});

test.describe('확정되지 않은 것을 확정된 것처럼 적지 않는다', () => {
  test('스펙표의 제형은 확정 예정이다', async ({ page }) => {
    // 처방 선정은 2026년 10~11월입니다. 그 전에 제형을 적으면 나중에
    // 사이트가 스스로를 반박하게 됩니다 — 실제로 한동안 홈은 "워터리 젤",
    // 스펙표는 "로션·밀크" 라고 동시에 말하고 있었습니다.
    await page.goto('/ko/product');
    const row = page
      .locator('.spec__row')
      .filter({ hasText: ko.product.spec.labels.texture })
      .first();
    await expect(row).toHaveCount(1);
    await expect(row.locator('.spec__value--pending')).toHaveCount(1);
  });

  test('내수성에 시험 수치를 적지 않는다', async ({ page }) => {
    // "80분" 은 지속내수성 시험 성적서가 정하는 등급 표기입니다.
    // 성적서를 받기 전에 숫자를 적으면 표시·광고 문제가 됩니다.
    await page.goto('/ko/product');
    const value = await page
      .locator('.spec__row')
      .filter({ hasText: ko.product.spec.labels.waterResistant })
      .first()
      .locator('.spec__value')
      .innerText();
    expect(value, `내수성 값에 숫자가 있습니다: ${value}`).not.toMatch(/\d/);
  });

  test('제형을 지어내지 않는다', async ({ page }) => {
    // 재도입 방지 가드입니다. 처방이 확정되면 이 목록을 지우고 실제 제형을
    // 적으세요 — 그때는 이 검사가 아니라 성적서가 근거가 됩니다.
    const banned: Record<string, RegExp> = {
      ko: /워터리\s*젤/,
      en: /watery gel/i,
    };
    for (const [lang, pattern] of Object.entries(banned)) {
      for (const path of [`/${lang}/`, `/${lang}/product`]) {
        await page.goto(path);
        const text = await page.locator('body').innerText();
        expect(text, `${path} 에 확정되지 않은 제형이 적혀 있습니다`).not.toMatch(pattern);
      }
    }
  });
});

test.describe('선점된 언어를 헤드라인에 세우지 않는다 — 기획안 2-2-3', () => {
  // 눈 시림·백탁은 닥터올가와 비레디가 수치까지 붙여 먼저 말한 표현입니다.
  // 같은 말을 크게 하면 뒤늦게 따라 하는 쪽으로 읽힙니다. 지우는 것이
  // 아니라 스펙 구간과 FAQ 로 내리는 것이 기획안의 지시입니다.
  const claims: Record<string, RegExp> = {
    ko: /눈\s*시림|백탁/,
    en: /\bsting|white cast/i,
  };

  test('제품 페이지의 큰 글씨가 앞세우지 않는다', async ({ page }) => {
    for (const [lang, pattern] of Object.entries(claims)) {
      await page.goto(`/${lang}/product`);
      const headline = await page.locator('.standards__lead').innerText();
      expect(headline, `${lang} 기준 섹션 헤드라인`).not.toMatch(pattern);
      const h1 = await page.locator('h1').innerText();
      expect(h1, `${lang} h1`).not.toMatch(pattern);
    }
  });

  test('검색 결과에 나가는 설명도 앞세우지 않는다', async ({ page }) => {
    // meta description 은 검색·답변 엔진이 인용하는 첫 문장이라
    // 사실상 헤드라인입니다.
    for (const [lang, pattern] of Object.entries(claims)) {
      for (const path of [`/${lang}/`, `/${lang}/product`]) {
        await page.goto(path);
        const desc = await page
          .locator('meta[name="description"]')
          .getAttribute('content');
        expect(desc, `${path} 에 description 이 없습니다`).toBeTruthy();
        expect(desc ?? '', `${path} 의 description`).not.toMatch(pattern);
      }
    }
  });

  test('스펙 구간과 FAQ 에는 그대로 남아 있다', async ({ page }) => {
    // 위 두 검사가 "지워라" 로 잘못 읽히지 않도록 반대편을 함께 고정합니다.
    // 기본 요건을 숨기면 그것대로 불친절합니다.
    await page.goto('/ko/product');
    const spec = await page.locator('.spec').innerText();
    expect(spec, '스펙표에 백탁 표기가 남아 있어야 합니다').toMatch(/백탁/);
    const faq = await page.locator('.faq').innerText();
    expect(faq, 'FAQ 에 백탁 질문이 남아 있어야 합니다').toMatch(/백탁/);
  });
});
