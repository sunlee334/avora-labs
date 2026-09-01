import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LOCALES } from '../../src/config/site';

/**
 * 홈 평가 기준 표 — 카피가 말하는 숫자가 표에 있는가.
 *
 * ── 왜 이 검사가 있는가 ────────────────────────────────────
 * 홈 The Choice 가 "여섯 가지 항목, 100점 만점. 눈 시림 30점, 백탁 25점" 이라고
 * 문장으로 말합니다. 표에 그 숫자가 없으면 **카피가 근거 없는 주장** 이 됩니다.
 *
 * 그리고 같은 숫자가 `/panel` 에도 있습니다. 두 화면에 따로 적어 두면 언젠가
 * 한쪽만 고쳐지는데, 그때 어느 쪽이 맞는지 손님은 알 수 없습니다. 그래서 홈은
 * `/panel` 과 같은 원본을 읽고, 여기서는 **정말 같은 숫자가 나오는지** 봅니다.
 */

/** 카피가 문장으로 못 박은 숫자. 바뀌면 카피도 함께 고쳐야 합니다. */
const CLAIMED = [
  { term: /눈\s*시림/, score: '30' },
  { term: /백탁/, score: '25' },
];

async function scoreTable(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  return page.locator('.criteriaTable').first().evaluate((table) =>
    [...table.querySelectorAll('tbody tr')].map((tr) => ({
      term: tr.querySelector('th')?.textContent?.trim() ?? '',
      score: tr.querySelector('.criteriaTable__num')?.textContent?.trim() ?? '',
      cut: tr.querySelectorAll('td')[2]?.textContent?.trim() ?? '',
      mono: getComputedStyle(tr.querySelector('.criteriaTable__num')!).fontFamily,
      numeric: getComputedStyle(tr.querySelector('.criteriaTable__num')!).fontVariantNumeric,
    })),
  );
}

test.describe('홈 평가 기준', () => {
  test('홈 표의 숫자가 원본 그대로다', async ({ page }) => {
    /*
     * 두 화면을 서로 비교하면 오늘은 같은 객체에서 렌더되므로 **자기 자신과
     * 비교** 하는 셈입니다. 대신 사전의 원본과 견줍니다 — 홈에 숫자를 손으로
     * 적어 넣는 순간(그것이 이 결합이 막으려는 사고입니다) 실패합니다.
     */
    for (const locale of LOCALES) {
      const source = JSON.parse(readFileSync(`src/i18n/${locale}.json`, 'utf8'))
        .panel.criteria.rows as Array<{ id: string; score: string; cut: string }>;
      const home = await scoreTable(page, `/${locale}/`);
      expect(home.length, `${locale} 홈 표가 비었습니다`).toBe(6);
      expect(
        home.map((r) => `${r.score}/${r.cut}`),
        `${locale} 홈 표가 사전의 배점과 다릅니다`,
      ).toEqual(source.map((r) => `${r.score}/${r.cut}`));
    }
  });

  test('카피가 말하는 숫자가 표에 그대로 있다', async ({ page }) => {
    const rows = await scoreTable(page, '/ko/');
    const choice = await page.goto('/ko/').then(() =>
      page.locator('[data-section="the_choice"]').innerText(),
    );
    for (const { term, score } of CLAIMED) {
      const row = rows.find((r) => term.test(r.term));
      expect(row, `표에 ${term} 항목이 없습니다`).toBeTruthy();
      expect(row!.score, `${term} 배점이 표와 카피에서 다릅니다`).toBe(score);
      expect(choice, `카피가 ${score}점을 말하지 않습니다`).toContain(`${score}점`);
    }
    // 총점 100 이 여섯 항목의 합과 맞는가 — 카피가 "100점 만점" 이라고 말합니다.
    const total = rows.reduce((sum, r) => sum + Number(r.score), 0);
    expect(total, `배점 합이 ${total}점인데 카피는 100점 만점이라고 말합니다`).toBe(100);
  });

  test('배점 숫자가 고정폭으로 정렬된다', async ({ page }) => {
    const rows = await scoreTable(page, '/ko/');
    expect(rows[0].mono, '배점에 모노스페이스가 걸려 있지 않습니다').toMatch(/mono/i);
    expect(rows[0].numeric, '자릿수가 흔들립니다').toContain('tabular-nums');
  });

  test('좁은 화면에서 가로로 넘치지 않는다', async ({ page }) => {
    /* 375px 에서 4열은 들어가지 않습니다. 스크롤 상자로 감싸면 배점·커트라인이
       화면 밖에 남는데 그 둘이 표의 요점이라, 행마다 쌓습니다. */
    test.skip(test.info().project.name !== 'mobile', '좁은 화면 규칙입니다');
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/`);
      const overflow = await page.evaluate(() => {
        const t = document.querySelector('.criteriaTable') as HTMLElement;
        return t.scrollWidth - t.clientWidth;
      });
      expect(overflow, `${locale} 홈 표가 가로로 ${overflow}px 넘칩니다`).toBeLessThanOrEqual(0);
    }
  });
});
