import { test, expect } from '@playwright/test';

/**
 * 알림 신청 폼이 무엇을 받는지 밝히는가 — 팔 수 없을 때.
 *
 * 폼 자체가 `CAN_ORDER` 가 거짓일 때만 나오므로 launch 모드 전용입니다.
 * commerce 모드에서 돌리면 "폼이 없다" 로 실패하는데, 그건 잡아야 할 것이
 * 아니라 **그 모드에서는 원래 없는 것** 입니다.
 */

const LANGS = ['ko', 'en', 'zh', 'th', 'vi'] as const;

test.describe('알림 신청 폼이 무엇을 받는지 밝힌다', () => {
  test('수집 항목 안내와 처리방침 링크가 폼 안에 있다', async ({ page }) => {
    // 링크만 두면 "읽어 보라" 는 말이지 알린 것이 아닙니다. 이메일 한 칸짜리
    // 폼에서 방침 전문을 여는 사람은 거의 없습니다.
    for (const lang of LANGS) {
      await page.goto(`/${lang}/`);
      const form = page.locator('[data-launch-notify]').first();
      // 요약과 링크는 두 줄입니다 — 링크를 문장 끝에 붙이면 44×44 과녁이
      // 나오지 않아 따로 뗐습니다.
      await expect(form.locator('.notify__privacy'), lang).toHaveCount(2);
      await expect(
        form.locator(`.notify__privacy a[href="/${lang}/legal/privacy"]`),
        lang,
      ).toHaveCount(1);
    }
  });

  test('안내가 항목·목적·보유를 모두 말한다', async ({ page }) => {
    // 셋 중 하나만 빠져도 "무엇을 내는지" 가 흐려집니다.
    await page.goto('/ko/');
    const text = await page.locator('.notify__privacy').first().innerText();
    expect(text, '수집 항목').toMatch(/이메일/);
    expect(text, '이용 목적').toMatch(/펀딩|출시/);
    expect(text, '보유·해지').toMatch(/수신 거부|보관/);
  });
});
