import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 홈 FAQ 세 개.
 *
 * 홈에서 "기성 처방" 을 읽은 사람이 그 자리에서 갖는 의문입니다. 제품
 * 페이지까지 가야 답이 있으면 대부분은 가기 전에 나갑니다.
 *
 * ── 접히면 안 되는 이유 ────────────────────────────────────
 * 셋뿐이라 접으면 읽히지 않고, 답변엔진이 접힌 내용을 본문으로 보지 않을 수
 * 있습니다. 그래서 `<details>` 로 감싸지 않았는지 봅니다.
 */

test.describe('홈 FAQ', () => {
  test('세 질문이 5개 언어에서 펼쳐진 채로 있다', async ({ page }) => {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/`);
      const faq = page.locator('[data-section="home_faq"]');
      await expect(faq, `${locale} 에 홈 FAQ 가 없습니다`).toHaveCount(1);

      const questions = faq.locator('dt');
      await expect(questions, `${locale} FAQ 가 3개가 아닙니다`).toHaveCount(3);

      // 접기 요소가 없어야 합니다.
      await expect(faq.locator('details'), `${locale} FAQ 가 접혀 있습니다`).toHaveCount(0);

      // 답이 실제로 보여야 합니다 — 숨겨 두고 dt 만 있는 상태를 막습니다.
      for (const answer of await faq.locator('dd').all()) {
        await expect(answer).toBeVisible();
        expect((await answer.innerText()).length, `${locale} 답이 비었습니다`).toBeGreaterThan(20);
      }
    }
  });

  test('나머지 질문과 검증단으로 가는 길이 있다', async ({ page }) => {
    await page.goto('/ko/');
    const more = page.locator('[data-section="home_faq"] a');
    await expect(more, '링크가 둘이 아닙니다').toHaveCount(2);
    const hrefs = await more.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.some((h) => h?.includes('/panel')), '검증단 링크가 없습니다').toBe(true);
    // 이 사이트의 주소는 끝 슬래시를 붙입니다 — /ko/product/#faq 가 정상입니다.
    expect(
      hrefs.some((h) => h?.includes('/product/') && h.endsWith('#faq')),
      `제품 FAQ 링크가 없습니다: ${hrefs.join(', ')}`,
    ).toBe(true);
  });

  test('제품 FAQ 링크가 실제로 그 자리에 닿는다', async ({ page }) => {
    /* `#faq` 앵커가 없으면 링크는 페이지 맨 위로 떨어집니다. 눌러 봐야 압니다. */
    await page.goto('/ko/product#faq');
    const target = page.locator('#faq');
    await expect(target, '제품 페이지에 #faq 앵커가 없습니다').toHaveCount(1);
    await expect(target).toBeVisible();
  });

  test('기능성 심사를 단정하지 않는다', async ({ page }) => {
    /*
     * 지시서가 못 박은 자리입니다 — "기능성 심사 관련 표현은 확정 전까지
     * 단정하지 말 것". 제품 페이지가 쓰는 표현("시험과 심사를 마친")보다
     * 앞서 나가면 표시광고법 문제가 됩니다.
     */
    await page.goto('/ko/');
    const faq = await page.locator('[data-section="home_faq"]').innerText();
    expect(faq, '홈 FAQ 가 심사 결과를 단정합니다').not.toMatch(
      /기능성\s*(심사|인증)(를|을)?\s*(통과|완료|받았)/,
    );
    expect(faq, '제품 페이지와 같은 표현을 쓰지 않습니다').toContain('시험과 심사를 마친');
  });
});
