import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LOCALES } from '../../src/config/site';

/**
 * 핵심 카피 — 브랜드가 한 일이 문장 안에 있는가.
 *
 * ── 왜 이 검사가 있는가 ────────────────────────────────────
 * 옛 헤드라인 "만들지 않았습니다. 골랐습니다." 는 **책임 주체가 문장에
 * 없었습니다.** 제품에 문제가 생기면 "검증단이 골랐다" 로 읽힐 여지가 있고,
 * 한국어 "고르다" 는 영어 choose 보다 훨씬 가벼워 물건 고르듯 들립니다.
 *
 * 새 문장은 역할을 나눠 적습니다 — **기준은 저희가, 결정은 점수가.**
 * 이건 문구 취향이 아니라 책임 소재라, 되살아나면 안 됩니다.
 *
 * ── 한 번 더 바뀐 이유 ─────────────────────────────────────
 * 한동안 "점수는 실제로 달리는 사람들이 매깁니다" 였습니다. 그런데 제품
 * 기획안 v09 5-5 의 평가는 **두 사람이 각각 독립적으로 진행** 하는 것이고,
 * 검증단은 기획안 어디에도 없습니다. 책임을 바깥으로 옮기는 문장이라 더더욱
 * 사실이어야 했습니다. 역할 분담은 남기되 주어를 사람에서 점수로 옮겼습니다.
 *
 * ── 왜 사전이 아니라 화면을 보는가 ──────────────────────────
 * 사전만 보면 "키는 고쳤는데 화면이 옛 키를 그린다" 를 놓칩니다.
 */

/** 되살리면 안 되는 표현. `00-공통규칙.md` 이 명시적으로 금지합니다. */
const RETIRED: Record<string, RegExp> = {
  ko: /만들지 않았|골랐습니다|고르지 않|달리는 사람들이 매|검증단/,
  en: /didn't make|we chose|chosen by|people who actually run give/i,
};

/** 역할 분담이 문장에 남아 있는가. 지우면 무책임한 문장으로 되돌아갑니다. */
const ROLES: Record<string, RegExp[]> = {
  ko: [/기준/, /점수/],
  en: [/standard/i, /score/i],
};

test.describe('핵심 카피', () => {
  test('폐기된 표현이 어느 언어에도 남아 있지 않다', async ({ page }) => {
    for (const locale of LOCALES) {
      for (const path of [`/${locale}/`, `/${locale}/product`, `/${locale}/panel/`]) {
        await page.goto(path);
        const text = await page.locator('body').innerText();
        for (const [lang, pattern] of Object.entries(RETIRED)) {
          // 한국어 패턴은 한국어 화면에서만, 영어 패턴은 영어 화면에서만 본다.
          if (locale !== lang) continue;
          expect(text, `${path} 에 폐기된 표현이 있습니다`).not.toMatch(pattern);
        }
        // meta description 은 검색·답변 엔진이 인용하는 첫 문장이라 함께 본다.
        const desc = (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
        const pattern = RETIRED[locale];
        if (pattern) expect(desc, `${path} 의 description`).not.toMatch(pattern);
      }
    }
  });

  test('The Choice 가 누가 무엇을 했는지 말한다', async ({ page }) => {
    for (const [locale, patterns] of Object.entries(ROLES)) {
      await page.goto(`/${locale}/`);
      const choice = await page.locator('[data-section="the_choice"]').innerText();
      for (const pattern of patterns) {
        expect(choice, `${locale} The Choice 에 ${pattern} 가 없습니다`).toMatch(pattern);
      }
    }
  });

  test('히어로 보조 문구와 /panel 헤드라인이 함께 바뀌어 있다', async ({ page }) => {
    /*
     * 셋 중 하나만 바꾸면 화면끼리 다른 말을 합니다. 지시서가 "하나만 바꾸면
     * 어긋난다. 전부를 한 번에 교체할 것" 이라고 못 박은 자리입니다.
     */
    await page.goto('/ko/');
    expect(await page.locator('.hero__promise').innerText()).toContain('기준은 먼저 공개하고');

    await page.goto('/en/');
    expect(await page.locator('.hero__promise').innerText()).toMatch(
      /publish the standard first/i,
    );

    await page.goto('/ko/panel/');
    expect(await page.locator('h1').innerText()).toContain('기준을 먼저');
  });

  test('떨어진 것도 공개한다는 섹션은 그대로 있다', async ({ page }) => {
    /*
     * 새 카피 방향과 정확히 맞는 섹션이라 지시서가 유지를 명시했습니다.
     * 만족도 조사에는 실패가 없고, 탈락 점수 공개가 이 브랜드의 차이입니다.
     */
    for (const locale of LOCALES) {
      /*
       * 어두운 섹션 개수를 세면 안 됩니다 — 이 섹션을 지우고 다른 어두운
       * 섹션을 두면 통과해 버립니다. 사전이 가진 **그 제목과 본문** 이
       * 화면에 있는지를 봅니다.
       */
      const dict = JSON.parse(readFileSync(`src/i18n/${locale}.json`, 'utf8'));
      const { heading, body } = dict.panel.rejected;
      await page.goto(`/${locale}/panel/`);
      /*
       * 제목은 `.kicker` 라 `text-transform: uppercase` 가 걸립니다. 한국어에는
       * 아무 일도 없지만 영어는 전부 대문자로 그려지므로, 비교 전에 눕힙니다.
       */
      const text = (await page.locator('body').innerText()).toLowerCase();
      expect(text, `${locale} 탈락 공개 섹션의 제목이 없습니다`)
        .toContain(heading.toLowerCase());
      // 본문 첫 문장까지 봅니다 — 제목만 남기고 알맹이를 지우는 것도 막습니다.
      expect(text, `${locale} 탈락 공개 섹션의 본문이 비었습니다`)
        .toContain(body.split('\n')[0].toLowerCase());
    }
  });
});
