import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LOCALES } from '../../src/config/site';
import { PANEL_APPLICATIONS_OPEN } from '../../src/config/panel';

/**
 * **점수를 누가 매기는지** 를 사이트가 사실대로 말하는가.
 *
 * ── 무엇이 틀렸었나 ────────────────────────────────────────
 * 사이트는 러닝 크루·클라이밍짐에서 검증단을 모으고 그분들이 점수를 매긴다고
 * 말했습니다. 그런데 제품 기획안 v09 와 사업 기획서 v04 어디에도
 * **「검증단」·「블라인드」·「집계」가 한 번도 나오지 않습니다.**
 *
 * 기획안 5-5 가 적은 실제 방법은 이렇습니다.
 *
 *   평가는 2명이 각각 독립적으로 진행하고 이후 결과를 비교함.
 *   가능하면 제조사명을 가린 상태로 평가함.
 *
 * ── 무엇은 사실이었나 ──────────────────────────────────────
 * 기준·배점·커트라인을 먼저 정해 공개하는 것, 제조사를 가리는 것, 커트라인
 * 미달을 총점과 무관하게 떨어뜨리는 것, 탈락 점수를 공개하는 것 — 전부
 * 기획안에 그대로 있습니다. **사실이 아닌 것은 「누가」 뿐이었습니다.**
 *
 * 그래서 이 검사는 지우는 것이 아니라 **바꿔야 할 것과 지켜야 할 것을 함께**
 * 못 박습니다. 한쪽만 지키면 다른 쪽이 무너집니다.
 */

/** 언어마다 다른 「검증단」. 사전을 훑어 되살아나는 것을 잡습니다. */
const PANEL_WORDS: Record<string, RegExp> = {
  ko: /검증단|집계 결과|달리는 사람들이 매/,
  en: /test panel|panel results|people who actually run give/i,
  zh: /验证团|测评团/,
  th: /ทีมทดสอบ|คณะทดสอบ/,
  vi: /nhóm kiểm chứng|nhóm thử nghiệm/i,
};

/** 바꾸면 안 되는 사실. 기획안 5-5 가 그대로 적고 있습니다. */
const KEPT: Record<string, RegExp[]> = {
  ko: [/제조사 이름을 가린/, /커트라인/, /탈락한 처방과 그 이유/],
  en: [/manufacturer hidden|manufacturer’s name hidden|unbranded/i, /cut-off/i, /rejected/i],
};

test.describe('고르는 기준', () => {
  for (const locale of LOCALES) {
    test(`${locale} — 화면 어디에도 검증단이 없다`, async ({ page }) => {
      const pattern = PANEL_WORDS[locale];
      for (const path of [`/${locale}/`, `/${locale}/product`, `/${locale}/panel/`]) {
        await page.goto(path);
        const body = await page.locator('body').innerText();
        expect(body, `${path} 에 기획안에 없는 검증단이 남아 있습니다`).not.toMatch(pattern);

        // 메타 설명도 봅니다 — 화면에 없어도 검색 결과에 그대로 나갑니다.
        const desc =
          (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
        expect(desc, `${path} 의 메타 설명에 검증단이 남아 있습니다`).not.toMatch(pattern);
      }
    });
  }

  test('두 사람이 각각 따로 매긴다는 것이 적혀 있다', async ({ page }) => {
    /*
     * 「누가」를 지우기만 하면 아무도 안 매기는 것처럼 읽힙니다. 기획안이 적은
     * 방법을 그대로 말해야 빈자리가 생기지 않습니다.
     */
    await page.goto('/ko/panel/');
    const body = await page.locator('body').innerText();
    expect(body, '누가 어떻게 매기는지가 없습니다').toMatch(/두 사람이 각각 따로/);
    expect(body, '함께 보지 않는 이유가 없습니다').toMatch(/맞춰 봅니다/);
  });

  for (const locale of ['ko', 'en'] as const) {
    test(`${locale} — 사실인 것은 그대로 남아 있다`, async ({ page }) => {
      await page.goto(`/${locale}/panel/`);
      const body = await page.locator('body').innerText();
      for (const pattern of KEPT[locale]) {
        expect(body, `${locale}: ${pattern} 가 사라졌습니다 — 기획안 5-5 에 있는 사실입니다`)
          .toMatch(pattern);
      }
    });
  }

  test('배점과 커트라인이 기획안 5-5 의 값 그대로다', async ({ page }) => {
    /*
     * 서사를 바꾸면서 표까지 손대면 안 됩니다. 이 숫자들은 기획안이 정한
     * 값이고, 사이트가 그것을 그대로 옮긴 것입니다.
     */
    await page.goto('/ko/panel/');
    const rows = await page.locator('.criteriaTable tbody tr').evaluateAll((els) =>
      els.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()),
    );
    const table = rows.join(' | ');
    for (const value of ['30', '18점 미만', '25', '15점 미만', '15', '10', '5']) {
      expect(table, `배점표에서 «${value}» 가 사라졌습니다`).toContain(value);
    }
  });

  test('모집을 닫았으면 폼도 API 도 함께 닫혀 있다', async ({ page, request }) => {
    /*
     * 화면에서 폼만 지우면 주소를 아는 사람은 그대로 보낼 수 있고, 그러면
     * **처리방침에 적지 않은 항목을 받게 됩니다.** 고지와 수집과 화면이 한
     * 스위치에 묶여 있어야 합니다.
     */
    test.skip(PANEL_APPLICATIONS_OPEN, '지금은 모집이 열려 있습니다');

    await page.goto('/ko/panel/');
    await expect(page.locator('[data-panel-form]'), '모집을 닫았는데 폼이 있습니다').toHaveCount(0);

    const res = await request.post('/api/panel', {
      data: { name: 'x', email: 'x@example.com', activity: 'running' },
    });
    expect(res.status(), '모집을 닫았는데 접수가 됩니다').toBe(404);

    await page.goto('/ko/legal/privacy');
    const body = await page.locator('body').innerText();
    expect(body, '받지 않는 항목이 처리방침에 남아 있습니다').not.toMatch(/지원 시 \(필수\)/);
  });

  test('설정 한 줄이 다섯 곳을 함께 여닫는다', () => {
    /*
     * 스위치가 실제로 그 다섯 곳에 걸려 있는지 소스에서 봅니다. 하나라도
     * 빠지면 "화면에는 없는데 API 는 살아 있는" 상태가 생깁니다.
     */
    const read = (path: string) => readFileSync(path, 'utf8');
    const wired = [
      ['src/pages/[lang]/panel.astro', '지원 폼'],
      ['src/pages/[lang]/legal/privacy.astro', '처리방침 수집 항목'],
      ['worker/index.ts', '접수 API'],
      ['tests/e2e/panel.spec.ts', '폼 검사'],
      ['tests/e2e/spam-guard.spec.ts', '덫 검사'],
    ] as const;
    for (const [path, what] of wired) {
      expect(read(path), `${what}(${path})가 스위치를 읽지 않습니다`).toContain(
        'PANEL_APPLICATIONS_OPEN',
      );
    }
  });
});
