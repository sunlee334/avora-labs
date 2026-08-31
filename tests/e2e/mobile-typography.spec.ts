import { test, expect } from '@playwright/test';

/**
 * 모바일 조판과 접힘.
 *
 * 지시 문서 D2·D3·D4. 새로 만드는 것이 아니라 **기존 코드 점검**이라
 * 검사도 화면에서 실측합니다.
 */

const LANGS = ['ko', 'en', 'zh', 'th', 'vi'] as const;

test.describe('상품정보고시', () => {
  test('접혀 있고, 열면 열한 줄이 다 나온다', async ({ page }) => {
    /*
     * 열한 줄 중 아홉 줄이 "확정 예정" 입니다. 펼쳐 두면 한 화면 가득한
     * "확정 예정" 의 벽이 됩니다. 법적으로는 접근할 수 있으면 됩니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/product/');

    const details = page.locator('details.disclosure');
    await expect(details).toHaveCount(1);
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open), '펼쳐진 채로 시작합니다').toBe(false);

    // 접혀 있어도 표는 문서에 있어야 합니다 — 검색엔진과 스크린리더가 읽습니다.
    await expect(page.locator('.disclosure table tbody tr')).toHaveCount(11);

    await details.locator('summary').click();
    await expect(page.locator('.disclosure table')).toBeVisible();
  });

  test('375px 에서 가로로 밀리지 않는다', async ({ page }) => {
    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/ko/product/');
      await page.locator('details.disclosure summary').click();
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `${width}px 에서 가로 넘침`).toBeLessThanOrEqual(0);
    }
  });

  test('표 마크업을 유지한다', async ({ page }) => {
    // 법적 표시이고 스크린리더가 표로 읽어야 합니다.
    await page.goto('/ko/product/');
    await expect(page.locator('.disclosure table thead th')).toHaveCount(2);
    await expect(page.locator('.disclosure table th[scope="row"]')).toHaveCount(11);
  });
});

test.describe('푸터', () => {
  test('링크 묶음이 2열이다', async ({ page }) => {
    // 넷이 세로로 쌓이면 모바일에서 푸터가 화면 두 개를 넘습니다.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    const cols = await page
      .locator('.footer__cols')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols, '푸터 링크가 한 줄로 쌓여 있습니다').toBe(2);
  });

  test('사업자 정보가 접혀 있고 저작권은 밖에 남는다', async ({ page }) => {
    await page.goto('/ko/');
    const details = page.locator('details.footer__business');
    await expect(details).toHaveCount(1);
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    // 접혀도 화면에 아무것도 없는 순간이 생기면 안 됩니다.
    await expect(page.locator('.footer__copyright')).toBeVisible();
  });

  test('전화번호를 바로 걸 수 있다', async ({ page }) => {
    await page.goto('/ko/');
    await page.locator('details.footer__business summary').click();
    const tel = page.locator('.footer__meta a[href^="tel:"]');
    await expect(tel, '전화번호가 링크가 아닙니다').toHaveCount(1);
    // 하이픈이 섞이면 일부 기기가 걸지 못합니다.
    expect(await tel.getAttribute('href')).toMatch(/^tel:\+?\d+$/);
  });
});

test.describe('언어별 조판', () => {
  test('태국어와 베트남어 행간이 더 넓다', async ({ page }) => {
    /*
     * 태국어는 성조 부호가 위아래로 두세 단 쌓이고, 베트남어는 이중
     * 발음부호가 대문자 위로 올라갑니다. 한글·라틴에 맞춘 행간이면 서로 닿습니다.
     */
    const heights: Record<string, number> = {};
    for (const lang of LANGS) {
      await page.goto(`/${lang}/`);
      heights[lang] = await page.evaluate(() => {
        const el = document.querySelector('p.body') ?? document.body;
        const cs = getComputedStyle(el);
        return parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
      });
    }
    expect(heights.th, `태국어 ${heights.th} · 한국어 ${heights.ko}`).toBeGreaterThan(heights.ko);
    expect(heights.vi, `베트남어 ${heights.vi} · 한국어 ${heights.ko}`).toBeGreaterThan(heights.ko);
  });

  test('밑줄이 글자를 관통하지 않는다', async ({ page }) => {
    // 기본 밑줄은 한글 받침을 가로지르고 성조 부호를 뭉갭니다.
    await page.goto('/ko/');
    const link = page.locator('main a').first();
    const style = await link.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { offset: cs.textUnderlineOffset, skip: cs.textDecorationSkipInk };
    });
    expect(style.offset, '밑줄이 글자에 붙어 있습니다').not.toBe('auto');
    expect(style.skip).toBe('auto');
  });
});

test.describe('공지 배너', () => {
  test('설정이 꺼져 있으면 아무것도 그리지 않는다', async ({ page }) => {
    /*
     * 와디즈 URL 이 나오기 전까지는 비활성입니다. 켜져 있는데 갈 곳이 없는
     * 배너가 뜨는 것이 가장 나쁩니다.
     */
    await page.goto('/ko/');
    await expect(page.locator('.notice')).toHaveCount(0);
  });
});

test.describe('타임라인', () => {
  test('다섯 시점이 순서대로 있고 숫자를 지어내지 않는다', async ({ page }) => {
    await page.goto('/ko/');
    const items = page.locator('.timeline li');
    await expect(items).toHaveCount(5);

    const text = await page.locator('.timeline').innerText();
    // 일정만 적습니다. 집계 결과는 실제 데이터가 나온 뒤에 붙습니다.
    expect(text).toContain('2026.10');
    expect(text).toContain('2027.02');
    expect(text, '아직 없는 집계 수치가 적혀 있습니다').not.toMatch(/\d+점|\d+명/);
  });
});
