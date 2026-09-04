import { test, expect } from '@playwright/test';
import { LOCALES } from '../../../src/config/site';
import ko from '../../../src/i18n/ko.json' with { type: 'json' };

/**
 * 신청 폼의 개인정보 안내가 **접혀 있고, 접힌 줄 안다.**
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 * 폼의 안내문이 114단어였고 그중 33단어가 개인정보 문단이었습니다. 390px 에서
 * 폼 하나가 665px 를 차지했고 이 블록만 121px 입니다. 이메일 한 칸을 적으러
 * 온 사람에게 처음부터 보여 줄 분량이 아닙니다.
 *
 * ── 지우지 않은 이유 ───────────────────────────────────────
 * 무엇을 받아 어디에 쓰고 얼마나 두는지를 폼 옆에서 말하는 것이 요점입니다.
 * 처리방침 링크만 두면 "읽어 보라" 는 말이지 알린 것이 아닙니다.
 *
 * ── 왜 `launch/` 아래인가 ──────────────────────────────────
 * 이 폼은 **launch 모드에만 있습니다.** 자사 결제가 켜지면 홈에서 사라지고
 * 구매 흐름이 그 자리를 대신합니다. `tests/e2e/` 에 두었더니 commerce 모드
 * CI 가 없는 요소를 30초 동안 기다리다 죽었습니다.
 *
 * ── 모바일이 급소다 ────────────────────────────────────────
 * 호버가 없어 **접혔다는 시각 신호가 없으면 그냥 제목인 줄 압니다.** 그리고
 * 12px 글씨 한 줄은 높이가 20px 남짓이라 손가락으로 정확히 누를 수 없습니다.
 */

const TERMS = '.notify__terms';

test.describe('개인정보 안내 접기', () => {
  test('처음에는 접혀 있고 본문이 화면에 없다', async ({ page }) => {
    await page.goto('/ko/');
    const terms = page.locator(`#notify ${TERMS}`);
    expect(await terms.evaluate((el: HTMLDetailsElement) => el.open), '처음부터 펼쳐져 있습니다').toBe(
      false,
    );
    await expect(
      terms.locator('.notify__privacy').first(),
      '접혔는데 본문이 보입니다',
    ).toBeHidden();
    // 제목은 보여야 합니다 — 무엇이 접혀 있는지 알 수 없으면 접은 의미가 없습니다.
    await expect(terms.locator('summary')).toContainText(ko.notify.privacy.heading);
  });

  test('눌러서 펼치면 항목·목적·보유가 모두 나온다', async ({ page }) => {
    /*
     * 접는 것과 감추는 것은 다릅니다. 펼쳤을 때 세 가지가 다 있어야 고지입니다.
     */
    await page.goto('/ko/');
    const terms = page.locator(`#notify ${TERMS}`);
    await terms.locator('summary').click();
    await expect(terms.locator('.notify__privacy').first()).toBeVisible();
    await expect(terms).toContainText(ko.notify.privacy.summary);
    await expect(terms.locator('a')).toHaveAttribute('href', /privacy/);
  });

  test('자바스크립트 없이도 열린다', async ({ browser }) => {
    /*
     * `<details>` 를 쓴 이유입니다. 스크립트가 죽어도 고지는 열려야 합니다.
     */
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/ko/');
    const terms = page.locator(`#notify ${TERMS}`);
    await terms.locator('summary').click();
    await expect(terms.locator('.notify__privacy').first()).toBeVisible();
    await context.close();
  });

  for (const locale of LOCALES) {
    test(`390px ${locale} — 탭 영역 44px 이상, 접힘 표시가 보인다`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${locale}/`);
      await page.evaluate(() => document.fonts.ready);

      const shape = await page.evaluate(() => {
        const terms = document.querySelector('#notify .notify__terms') as HTMLDetailsElement;
        const summary = terms.querySelector('summary')!;
        const mark = terms.querySelector('.notify__terms-mark')!;
        const bar = getComputedStyle(mark, '::before');
        const stem = getComputedStyle(mark, '::after');
        const box = mark.getBoundingClientRect();
        return {
          tap: summary.getBoundingClientRect().height,
          // 기본 삼각형이 남아 있으면 우리 표시와 겹쳐 두 개가 됩니다.
          defaultMarker: getComputedStyle(summary).listStyleType,
          markW: box.width,
          markH: box.height,
          // `+` 의 두 획이 실제로 그려지는가 — 하나라도 없으면 신호가 아닙니다.
          barDrawn: bar.content !== 'none' && bar.backgroundColor !== 'rgba(0, 0, 0, 0)',
          stemDrawn: stem.content !== 'none' && stem.opacity !== '0',
        };
      });

      expect(shape.tap, `탭 영역이 ${shape.tap}px 입니다`).toBeGreaterThanOrEqual(44);
      expect(shape.defaultMarker, '기본 삼각형이 남아 있습니다').toBe('none');
      expect(shape.markW, '접힘 표시에 폭이 없습니다').toBeGreaterThan(6);
      expect(shape.markH, '접힘 표시에 높이가 없습니다').toBeGreaterThan(6);
      expect(shape.barDrawn, '접힘 표시의 가로획이 없습니다').toBe(true);
      expect(shape.stemDrawn, '접힌 상태인데 세로획이 없습니다 — `+` 로 보이지 않습니다').toBe(
        true,
      );
    });
  }

  test('펼치면 표시가 `+` 에서 `−` 로 바뀐다', async ({ page }) => {
    /*
     * 눌러도 표시가 그대로면 눌린 줄 모릅니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    const terms = page.locator(`#notify ${TERMS}`);
    const stem = () =>
      terms
        .locator('.notify__terms-mark')
        .evaluate((el) => getComputedStyle(el, '::after').opacity);

    expect(await stem(), '접힌 상태에서 세로획이 없습니다').not.toBe('0');
    await terms.locator('summary').click();
    await expect
      .poll(stem, { message: '펼쳤는데 세로획이 남아 있습니다' })
      .toBe('0');
  });

  test('폼이 실제로 짧아졌다', async ({ page }) => {
    /*
     * 접기의 목적은 높이입니다. 측정값을 기록해 두지 않으면 다음에 문단이
     * 늘어나도 아무도 모릅니다. 접기 전 665px, 접은 뒤 589px 였습니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);
    const height = await page
      .locator('#notify form')
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(height, `폼이 ${Math.round(height)}px 입니다 — 접기 전 수준으로 돌아갔습니다`).toBeLessThan(
      640,
    );
  });
});
