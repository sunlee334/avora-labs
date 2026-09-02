import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';
import { FOUNDER_STORY } from '../../src/config/company';
import ko from '../../src/i18n/ko.json' with { type: 'json' };

/**
 * 브랜드 페이지에 **사실** 을 넣는다.
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 * 여덟 섹션이 전부 선언이었습니다. "강하지만 거칠지 않고, 활동적이지만 무겁지
 * 않고" — 아름답지만 확인할 수 없습니다. 방문자가 확인하거나 반박할 수 있는
 * 진술이 필요합니다.
 *
 * ── 기존 글을 지우지 않았다 ────────────────────────────────
 * 지시서가 못 박았습니다 — "기존 섹션을 지우지 말 것. 글이 좋다. 사실을 담은
 * 섹션을 **사이에** 넣는다." 그래서 이 파일은 새 섹션이 생겼는지와 함께
 * **옛 섹션이 그대로 있는지** 도 봅니다.
 */

test.describe('사실 섹션이 들어왔다', () => {
  test('세 섹션이 제자리에 있다', async ({ page }) => {
    await page.goto('/ko/brand');
    /*
     * `.kicker` 는 `text-transform: uppercase` 라, 화면에 보이는 글자는
     * 사전의 값과 다릅니다("The Question" → "THE QUESTION"). 한글은 바뀌지
     * 않아 처음에는 눈치채지 못했습니다. 양쪽을 올려 비교합니다.
     *
     * `Origin` 은 `<p class="kicker">` 입니다 — 그 섹션의 제목은 h1 이라
     * 머리말이 문단으로 남아 있습니다. 그래서 `h2` 만 보면 빠집니다.
     */
    const headings = await page.locator('.kicker').allInnerTexts();
    const trimmed = headings.map((s) => s.trim().toUpperCase());

    const order = [
      ko.brand.question.kicker,
      ko.brand.maker.kicker, // C1 — The Question 뒤
      ko.brand.island.kicker,
      ko.brand.naming.kicker, // C3 — The Name 뒤
      ko.brand.elements.kicker,
      ko.brand.how.kicker, // C2 — Brand Codes 뒤
    ].map((h) => h.toUpperCase());

    // 순서까지 봅니다 — 자리가 곧 맥락입니다.
    const positions = order.map((h) => trimmed.indexOf(h));
    expect(positions, `못 찾은 제목이 있습니다: ${JSON.stringify(trimmed)}`).not.toContain(-1);
    expect(positions, '섹션 순서가 다릅니다').toEqual([...positions].sort((a, b) => a - b));
  });

  test('기존 섹션을 하나도 지우지 않았다', async ({ page }) => {
    /*
     * 새 섹션을 끼워 넣다가 옛 것을 밀어내면 지시서의 첫 번째 금지를 어깁니다.
     * 여덟 개가 전부 남아 있어야 합니다.
     */
    await page.goto('/ko/brand');
    const text = await page.locator('main').innerText();
    for (const key of ['origin', 'question', 'island', 'elements', 'audience',
                       'philosophy', 'company', 'message'] as const) {
      const kicker = (ko.brand[key] as { kicker: string }).kicker;
      // 화면은 대문자로 그립니다(.kicker 의 text-transform).
      expect(text.toUpperCase(), `«${kicker}» 섹션이 사라졌습니다`).toContain(kicker.toUpperCase());
    }
  });
});

test.describe('어떻게 만드는가', () => {
  test('명제를 말하고 배점표로 잇는다', async ({ page }) => {
    /*
     * 이 섹션의 값어치는 "성분이 아니라 선별" 이라는 문장과, 그것을 확인하러
     * 갈 수 있다는 데 있습니다. 링크가 없으면 선언으로만 남습니다.
     */
    await page.goto('/ko/brand');
    const section = page.locator('section').filter({ hasText: ko.brand.how.kicker }).last();
    await expect(section).toContainText('선별');
    await expect(section.locator('a[href="/ko/panel/"]')).toHaveCount(1);
  });

  test('떨어진 처방의 점수도 공개한다고 적혀 있다', async ({ page }) => {
    /*
     * 경쟁사의 만족도 조사에는 실패가 없습니다. 이 브랜드의 차이가 여기라,
     * 이 문장이 빠지면 섹션이 "우리도 고릅니다" 로 읽힙니다.
     */
    await page.goto('/ko/brand');
    await expect(page.locator('main')).toContainText('떨어진 처방의 점수');
  });
});

test.describe('표기', () => {
  test('그리스 섬과 혼동되지 않게 말한다', async ({ page }) => {
    /*
     * `src/lib/jsonld.ts` 가 `@id` 로 기계에게 하는 말을 여기서는 사람 말로
     * 합니다. 둘 중 하나만 있으면 한쪽 독자만 설득됩니다.
     */
    await page.goto('/ko/brand');
    const section = page.locator('section').filter({ hasText: ko.brand.naming.kicker }).last();
    await expect(section).toContainText('PAROS');
    await expect(section).toContainText('파로스');
    await expect(section, '섬과의 관계를 말하지 않습니다').toContainText('섬');
    await expect(section, '어디서 만드는지 말하지 않습니다').toContainText('서울');
  });

  for (const lang of LOCALES) {
    test(`${lang} 에서도 브랜드명 병기가 나온다`, async ({ page }) => {
      // 답변엔진이 어느 언어로 물어도 같은 사실에 닿아야 합니다.
      await page.goto(`/${lang}/brand`);
      await expect(page.locator('main')).toContainText('PAROS');
      await expect(page.locator('main')).toContainText('파로스');
    });
  }
});

test.describe('만든 사람', () => {
  test('원고가 없으면 기다린다고 적는다 — 지어내지 않는다', async ({ page }) => {
    test.skip(Boolean(FOUNDER_STORY.ko), '원고가 들어오면 이 검사는 의미가 없습니다');

    await page.goto('/ko/brand');
    const section = page.locator('section').filter({ hasText: ko.brand.maker.kicker }).last();
    await expect(section.locator('.blocks__awaiting')).toHaveCount(1);
    await expect(section).toContainText(ko.home.company.awaiting);
  });

  test('창업 배경을 지어내지 않았다', async ({ page }) => {
    await page.goto('/ko/brand');
    const text = await page.locator('main').innerText();
    // 지시서 초안 문구가 확인 전에 화면에 나가면 안 됩니다.
    expect(text, '설립 연도가 확인 전에 나갔습니다').not.toMatch(/2026년\s*서울/);
    expect(text, '팀 규모가 확인 전에 나갔습니다').not.toContain('두 사람이 시작');
  });
});

test.describe('Philosophy 는 손대지 않았다', () => {
  test('축소는 보고 후에 한다 — 지금은 그대로다', async ({ page }) => {
    /*
     * 지시서 C4 가 중복을 지적하면서도 "판단이 필요하면 지우지 말고 보고할 것.
     * 브랜드 카피는 담당자 승인 영역" 이라고 못 박았습니다. 확인 항목에도
     * 올라 있습니다.
     */
    await page.goto('/ko/brand');
    const text = await page.locator('main').innerText();
    expect(text, 'Philosophy 본문이 사라졌습니다').toContain(ko.brand.philosophy.body);
    expect(text).toContain(ko.brand.philosophy.beauty);
  });
});
