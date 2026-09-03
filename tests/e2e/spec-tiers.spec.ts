import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import product from '../../src/data/product.json' with { type: 'json' };

/**
 * 홈 사양 표가 **정해진 것과 요구하는 것을 구분하는가.**
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 * 표의 첫 칸이 `지금 확정된 것` 이었습니다. 그 아래 향·톤·사용 부위가
 * 있었는데, **처방이 아직 선정되지 않았습니다.** 기획안 5장의 사양 표도
 * 확정 결과가 아니라 요구 사양이고, 5-1 이 이를 "기성 처방을 비교 선별할 때의
 * 판단 기준" 이라 설명합니다. 달성한 것이 아니라 요구하는 것입니다.
 *
 * 기능성화장품은 심사·보고가 남아 있어 미확정을 확정으로 적으면 표시·광고
 * 문제가 됩니다.
 *
 * ── 세 덩이로 나눈 이유 ────────────────────────────────────
 * 향·톤은 "이렇게 해 달라" 는 요구이고, 눈 시림·백탁은 **총점과 무관하게
 * 떨어뜨리는 기준** 입니다. 같은 칸에 섞으면 그 차이가 보이지 않습니다.
 */

const TABLE = ko.home.product.table;

test.describe('사양 표 세 덩이', () => {
  test('확정이라고 말하지 않는다', async ({ page }) => {
    await page.goto('/ko/');
    const section = page.locator('[data-section="first_product"]');
    const text = await section.innerText();
    expect(text, '아직 확정이 아닌 것을 확정이라고 적었습니다').not.toContain('지금 확정된 것');
    await expect(section.locator('.compare__head')).toHaveCount(3);
  });

  test('양보하지 않는 조건이 배점표와 같은 값을 쓴다', async ({ page }) => {
    /*
     * 숫자를 홈에 따로 적으면 언젠가 한쪽만 고쳐집니다. 기획안 5-5 가 정한
     * 값이므로 배점표(`panel.criteria.rows`)에서 그대로 와야 합니다.
     */
    await page.goto('/ko/');
    const rows = await page
      .locator('.compare__col')
      .first()
      .locator('.compare__row')
      .evaluateAll((els) =>
        els.map((el) => ({
          item: el.querySelector('dt')!.textContent!.trim(),
          cut: el.querySelector('.compare__cut')!.textContent!.trim(),
        })),
      );

    const withCut = ko.panel.criteria.rows.filter((r) => r.cut && r.cut !== '—');
    expect(rows.length, '커트라인 항목 수가 배점표와 다릅니다').toBe(withCut.length);
    for (const source of withCut) {
      const found = rows.find((r) => r.item === source.item);
      expect(found, `${source.item} 이 표에 없습니다`).toBeTruthy();
      expect(found!.cut, `${source.item} 의 커트라인이 배점표와 다릅니다`).toBe(source.cut);
    }
  });

  test('백탁 없음이 스펙 구간에 남아 있다', async ({ page }) => {
    /*
     * 지시서가 못 박았습니다 — 기획안 4-4 3차(스펙)가 "눈 시림과 백탁은
     * 여기서 다룸" 을 허용합니다. 금지하는 것은 **헤드라인·단독 소구점** 이지
     * 스펙 표기가 아닙니다.
     */
    await page.goto('/ko/');
    await expect(page.locator('[data-section="first_product"]')).toContainText('백탁 없음');
    await page.goto('/ko/product');
    await expect(page.locator('main')).toContainText('백탁');
  });

  test('용기와 용량이 같은 말을 되풀이하지 않는다', async ({ page }) => {
    /*
     * 전에는 둘 다 "용기 발주 후" 였습니다. 용기 행에서 "용기" 를 다시
     * 말하는 것은 동어반복입니다.
     */
    await page.goto('/ko/');
    const waits = await page
      .locator('.compare__col')
      .last()
      .locator('.compare__wait')
      .allInnerTexts();
    const container = TABLE.waits.container;
    expect(container, '용기 값이 여전히 자기 이름을 되풀이합니다').not.toContain(TABLE.container);
    expect(waits.map((w) => w.trim()), '용기 값이 화면에 없습니다').toContain(container);
  });

  for (const width of [375, 390]) {
    test(`${width}px — 세 덩이가 세로로 쌓이고 가로로 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ko/');
      const shape = await page.evaluate(() => {
        const cols = [...document.querySelectorAll('.compare__col')];
        const tops = new Set(cols.map((el) => Math.round(el.getBoundingClientRect().top)));
        return {
          cols: cols.length,
          stacked: tops.size === cols.length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(shape.cols).toBe(3);
      expect(shape.stacked, '세 덩이가 가로로 놓였습니다').toBe(true);
      expect(shape.overflow, '가로로 넘칩니다').toBeLessThanOrEqual(0);
    });
  }

  for (const locale of LOCALES) {
    test(`${locale} — 커트라인이 한 줄로 들어간다`, async ({ page }) => {
      /*
       * `눈 시림 없음  30점 만점 · 18점 미만 탈락` 을 한 줄로 두면 390px 를
       * 넘습니다. 배점과 커트라인을 두 줄로 나눈 이유입니다. 베트남어가 가장
       * 길어 여기서 먼저 깨집니다.
       */
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(`/${locale}/`);
      await page.evaluate(() => document.fonts.ready);

      const lines = await page
        .locator('.compare__col')
        .first()
        .locator('.compare__cut')
        .evaluateAll((els) =>
          els.map((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return [...range.getClientRects()].filter((r) => r.width > 1).length;
          }),
        );
      expect(lines.length, '커트라인 항목이 없습니다').toBeGreaterThan(0);
      for (const n of lines) {
        expect(n, `${locale} 커트라인이 ${n}줄로 갈립니다`).toBeLessThanOrEqual(2);
      }
    });
  }

  test('미확정 값에는 반드시 목표 배지가 붙는다', async ({ page }) => {
    /*
     * ⚠️ 이 검사가 A5 의 안전장치입니다.
     *
     * 한동안 이 칸은 **무엇을 기다리는지만** 적었습니다. 그 탓에 홈 전체에
     * `SPF50+`·`50ml` 이 한 번도 나오지 않았고, 방문자가 이게 무슨 제품인지
     * 알 수 없었습니다.
     *
     * 값을 넣되 **배지 없이 넣으면 안 됩니다.** 기능성 심사 전에 차단지수를
     * 단정한 것이 되고, 표시·광고 문제가 됩니다. 값과 배지는 한 몸입니다.
     */
    await page.goto('/ko/');
    const values = page.locator('.compare__col').last().locator('.compare__target');
    const n = await values.count();
    expect(n, '미확정 칸에 값이 하나도 없습니다').toBeGreaterThan(0);

    for (let i = 0; i < n; i += 1) {
      const row = values.nth(i);
      await expect(row.locator('.spec__target'), '값에 목표 배지가 없습니다').toHaveCount(1);
      await expect(row).toContainText(ko.product.spec.values.target);
    }
    // 홈이 실제로 제품을 말하고 있는가 — 이 셋이 없으면 A5 가 되돌아간 것입니다.
    const section = page.locator('[data-section="first_product"]');
    for (const value of ['SPF50+', 'PA++++', product.spec.volume]) {
      await expect(section, `«${value}» 이 홈에 없습니다`).toContainText(value);
    }
  });

  for (const width of [375, 390]) {
    for (const locale of LOCALES) {
      test(`${width}px ${locale} — 목표 배지가 값과 같은 줄에 있다`, async ({ page }) => {
        /*
         * 지시서가 못 박은 조건입니다. 배지가 값에서 떨어지면 **어느 값의
         * 목표인지 알 수 없는** 모양이 됩니다.
         *
         * 실제로 한 번 그렇게 됐습니다. 키와 값을 `1fr auto` 로 나란히 두니
         * 390px 에서 값에 남는 자리가 173px 이었고, `Chỉ số chống nắng` 처럼
         * 키가 긴 언어에서 배지만 다음 줄로 떨어졌습니다. 좁은 화면에서 값을
         * 키 아래로 내린 이유입니다.
         */
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${locale}/`);
        await page.evaluate(() => document.fonts.ready);

        const rows = await page.locator('.compare__target').evaluateAll((els) =>
          els.map((el) => {
            const badge = el.querySelector('.spec__target')!.getBoundingClientRect();
            const range = document.createRange();
            range.setStart(el, 0);
            range.setEndBefore(el.querySelector('.spec__target')!);
            const rects = [...range.getClientRects()].filter((r) => r.width > 1);
            const last = rects[rects.length - 1];
            return {
              text: el.textContent!.replace(/\s+/g, ' ').trim(),
              lines: rects.length,
              // 값의 마지막 줄과 배지의 세로 중심이 겹치면 같은 줄입니다.
              sameLine: last
                ? Math.abs((last.top + last.bottom) / 2 - (badge.top + badge.bottom) / 2) < 6
                : false,
            };
          }),
        );

        expect(rows.length, '값이 하나도 없습니다').toBeGreaterThan(0);
        for (const row of rows) {
          expect(row.lines, `«${row.text}» 의 값이 ${row.lines}줄로 접힙니다`).toBe(1);
          expect(row.sameLine, `«${row.text}» 의 배지가 값과 다른 줄에 있습니다`).toBe(true);
        }
      });
    }
  }
});
