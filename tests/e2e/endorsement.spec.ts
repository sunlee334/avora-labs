import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 보증 표기 — 회사가 브랜드보다 커 보이지 않는가.
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 * 지시서가 방향을 뒤집었습니다. 예전에는 AVORA LABS 노출을 줄이라고 했고,
 * 지금은 **보증 표기로 넣으라**고 합니다. 둘은 다릅니다.
 *
 *   전면   회사가 헤드라인의 주어가 되는 것    (이건 계속 금지)
 *   보증   브랜드가 주인공이고 회사는 서명     (이건 도입)
 *
 * 그 경계를 지키는 것이 **크기** 입니다. `BY AVORA LABS` 가 `PAROS` 만큼
 * 커지는 순간 보증이 아니라 공동 브랜딩이 되고, 지시서가 금지한 "회사가
 * 전면에 나서는 것" 으로 넘어갑니다.
 *
 * ── 이 검사가 재는 것 ──────────────────────────────────────
 * 문구가 있는지가 아니라 **비율** 입니다. 존재만 보면 누군가 글자 크기를
 * 키워도 통과합니다. 실제 렌더 크기를 재서 55~60% 대에 있는지 봅니다.
 *
 * 헤더 높이는 `header-shape.spec.ts` 가 이미 지킵니다(390px 에서 72px
 * 이하). 여기서 다시 세지 않습니다.
 */

const px = (value: string) => Number.parseFloat(value);

/*
 * 대비는 여기서 직접 셉니다.
 *
 * `tokens-contrast.spec.ts` 에도 같은 함수가 있지만 spec 파일에서 가져오면
 * 그 파일의 검사가 이 파일에도 등록됩니다. 팔레트 값이 아니라 실제 렌더된
 * `rgb()` 문자열을 받는다는 점도 다릅니다.
 */
const channels = (color: string) =>
  (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

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

test.describe('보증 표기', () => {
  test('회사는 브랜드의 55~60% 크기다', async ({ page }) => {
    await page.goto('/ko/');

    const size = await page.evaluate(() => {
      const brand = document.querySelector('.nav__wordmarkBrand');
      const by = document.querySelector('.nav__wordmarkBy');
      if (!brand || !by) return null;
      return {
        brand: getComputedStyle(brand).fontSize,
        by: getComputedStyle(by).fontSize,
      };
    });

    expect(size, '헤더에 로고 락업이 없습니다').not.toBeNull();
    const ratio = px(size!.by) / px(size!.brand);
    expect(
      ratio,
      `BY AVORA LABS 가 PAROS 의 ${Math.round(ratio * 100)}% 입니다 — 보증 표기의 상한을 넘었습니다`,
    ).toBeLessThanOrEqual(0.62);
    expect(ratio, '너무 작아 읽히지 않습니다').toBeGreaterThanOrEqual(0.5);
  });

  test('회사명은 본문색이 아니라 보조색이다', async ({ page }) => {
    await page.goto('/ko/');

    const colors = await page.evaluate(() => {
      const brand = document.querySelector('.nav__wordmarkBrand')!;
      const by = document.querySelector('.nav__wordmarkBy')!;
      return {
        brand: getComputedStyle(brand).color,
        by: getComputedStyle(by).color,
        // 헤더 배경은 본문색 97% 라 반투명입니다. 뒤에 깔리는 실제 면을 씁니다.
        bg: getComputedStyle(document.body).backgroundColor,
      };
    });

    expect(colors.by, '회사명이 브랜드와 같은 색입니다 — 서명이 아니라 병기로 읽힙니다').not.toBe(
      colors.brand,
    );
    // 작은 글자라 대비를 특히 봅니다.
    expect(contrast(colors.by, colors.bg)).toBeGreaterThanOrEqual(4.5);
  });

  for (const lang of LOCALES) {
    test(`/${lang}/ — 회사명은 번역하지 않는다`, async ({ page }) => {
      await page.goto(`/${lang}/`);

      // 회사명이라 다섯 언어 모두 영문 그대로여야 합니다.
      await expect(page.locator('.nav__wordmarkBy')).toHaveText('by AVORA LABS');

      // 락업 전체가 홈으로 갑니다. `BY AVORA LABS` 는 따로 링크가 아닙니다.
      await expect(page.locator('.nav__wordmarkBy a')).toHaveCount(0);
    });
  }

  test('푸터에 운영사 표기가 있고, 회사명이 두 번 나오지 않는다', async ({ page }) => {
    await page.goto('/ko/');

    await expect(page.locator('.footer__operatorName')).toHaveText('AVORA LABS');
    await expect(page.locator('.footer__operatorNote')).not.toBeEmpty();

    /*
     * 푸터 로고를 PAROS 단독으로 둔 판단을 여기서 지킵니다.
     *
     * 76px 워드마크 바로 아래에 락업까지 넣으면 AVORA LABS 가 푸터에 두 번
     * 나옵니다. 보증이 아니라 중복으로 읽힙니다. 저작권 줄의 표기는 법적
     * 고지라 세지 않습니다.
     */
    const shown = await page.evaluate(() => {
      const clone = document.querySelector('.footer')!.cloneNode(true) as HTMLElement;
      clone.querySelector('.footer__copyright')?.remove();
      return (clone.textContent ?? '').split('AVORA LABS').length - 1;
    });
    expect(shown, `푸터에 AVORA LABS 가 ${shown}번 나옵니다`).toBe(1);
  });

  test('헤드라인의 주어는 여전히 회사가 아니다', async ({ page }) => {
    await page.goto('/ko/');

    /*
     * 보증 표기를 넣었다고 해서 회사가 본문의 주어가 되어도 되는 것은
     * 아닙니다. 구역 라벨과 제목에 회사명이 없어야 합니다.
     */
    const offenders = await page.evaluate(() =>
      [...document.querySelectorAll('main h1, main h2, main h3, main .kicker')]
        .map((el) => el.textContent?.trim() ?? '')
        .filter((text) => text.includes('AVORA')),
    );
    expect(offenders, '회사명이 본문 제목·라벨에 들어갔습니다').toEqual([]);
  });
});
