import { test, expect } from '@playwright/test';
import { BUSINESS } from '../../src/config/site';

/**
 * 사업자 정보 표시.
 *
 * 전자상거래법 제10조는 상호·대표자 성명·주소·전화번호·전자우편주소·
 * 사업자등록번호·통신판매업 신고번호를 표시하도록 요구합니다.
 *
 * 이 파일이 지키는 두 가지:
 *   1. 확정된 값은 **실제로 화면에 나온다** — 설정에만 있고 안 보이면 소용없습니다.
 *   2. 확정되지 않은 값은 **지어내지 않는다** — 없는 신고번호를 적는 것은
 *      없는 것보다 나쁩니다.
 */

test.describe('푸터의 사업자 정보', () => {
  test('설정된 값이 모두 화면에 나온다', async ({ page }) => {
    await page.goto('/ko/');
    const footer = page.locator('footer');

    for (const [key, value] of Object.entries(BUSINESS)) {
      if (typeof value !== 'string' || !value) continue;
      if (key === 'brandName') continue; // 워드마크로 나오므로 글자로 찾지 않습니다
      await expect(footer, `${key} 가 푸터에 없습니다`).toContainText(value);
    }
  });

  test('사업자등록번호가 증명서와 같다', async ({ page }) => {
    await page.goto('/ko/');
    await expect(page.locator('footer')).toContainText('392-32-01888');
  });

  test('아직 없는 값은 빈 줄로 남지 않는다', async ({ page }) => {
    await page.goto('/ko/');
    const text = await page.locator('.footer__meta').innerText();

    // 통신판매업 신고번호는 사업자등록만으로는 생기지 않습니다.
    // 아직 없으면 라벨만 덩그러니 남아서는 안 됩니다.
    if (!BUSINESS.mailOrderNumber) {
      expect(text).not.toContain('통신판매업신고번호');
    }
    if (!BUSINESS.phone) expect(text).not.toContain('전화');
    if (!BUSINESS.email) expect(text).not.toContain('이메일');
  });

  test('주민등록번호처럼 보이는 값이 어디에도 없다', async ({ page }) => {
    // 사업자등록증명 원본에는 대표자 주민등록번호가 들어 있습니다.
    // 그 값이 실수로 설정에 들어오면 사이트에 그대로 노출됩니다.
    for (const path of ['/ko/', '/ko/legal/terms', '/ko/legal/privacy']) {
      await page.goto(path);
      const html = await page.content();
      expect(html, `${path} 에 주민등록번호 형식이 있습니다`).not.toMatch(
        /\b\d{6}-[1-4]\d{6}\b/,
      );
    }
  });

  test('모든 언어에서 같은 사업자 정보가 나온다', async ({ page }) => {
    // 법정 표시 사항은 언어와 무관하게 같은 사업자를 가리켜야 합니다.
    for (const lang of ['ko', 'en', 'zh', 'th', 'vi']) {
      await page.goto(`/${lang}/`);
      await expect(page.locator('footer'), lang).toContainText(BUSINESS.registrationNumber);
    }
  });
});
