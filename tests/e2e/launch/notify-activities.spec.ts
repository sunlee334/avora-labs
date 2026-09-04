import { test, expect } from '@playwright/test';
import ko from '../../../src/i18n/ko.json' with { type: 'json' };

/**
 * 알림 신청의 활동 선택 — 화면.
 *
 * 기획안 2-2-2 의 검증단 모집이 이 명단에서 출발합니다. 2026년 10월에 러너
 * 30~50명을 모실 때 "달리는 사람" 을 골라내지 못하면 명단 전체에 메일을
 * 뿌려야 하고, 관심 없는 사람에게 보낸 만큼 수신 거부가 늘어납니다.
 *
 * 여기는 **화면** 만 봅니다. 실제로 저장되는지는 관리 API 로 확인해야 하는데,
 * launch 모드에는 개발용 관리 토큰을 넘기지 않습니다 — 그 모드의 관리 화면은
 * "설정을 깜빡한 상태에서도 잠겨 있는가" 를 보는 자리이기 때문입니다.
 * 저장 쪽은 tests/e2e/commerce/notify-activities-store.spec.ts 가 봅니다.
 */

const LANGS = ['ko', 'en', 'zh', 'th', 'vi'] as const;

test.describe('활동 선택 — 화면', () => {
  test('5개 언어 모두 여섯 가지가 있고 아무것도 필수가 아니다', async ({ page }) => {
    for (const lang of LANGS) {
      await page.goto(`/${lang}/`);
      const boxes = page.locator('[data-launch-notify]').first().locator('input[name="activities"]');
      await expect(boxes, lang).toHaveCount(6);
      // 하나라도 required 면 "선택" 이라고 적어 둔 것이 거짓말이 됩니다.
      await expect(boxes.locator('[required]'), lang).toHaveCount(0);
    }
  });

  test('저장되는 값은 언어와 무관한 슬러그다', async ({ page }) => {
    /*
     * 화면 문구는 언어마다 다르지만 값은 같아야 합니다. 태국어 화면에서
     * 신청한 사람과 한국어 화면에서 신청한 사람을 같은 조건으로 뽑을 수
     * 없으면 검증단 모집이 성립하지 않습니다.
     */
    const expected = ko.notify.activities.options.map((o) => o.value);
    for (const lang of LANGS) {
      await page.goto(`/${lang}/`);
      const values = await page
        .locator('[data-launch-notify]')
        .first()
        .locator('input[name="activities"]')
        .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
      expect(values, lang).toEqual(expected);
    }
  });

  test('왜 묻는지 화면에 적혀 있다', async ({ page }) => {
    /*
     * 이유 없이 칸만 늘리면 그냥 귀찮은 질문입니다.
     *
     * 전에는 "검증단을 모실 때 먼저 알려드리려고" 였습니다. 기획안 v09 에
     * 검증단이 없어 그 이유가 사라졌고, 지금은 **활동마다 다른 소식** 을
     * 보내기 위해서입니다(기획안 8-1 의 커뮤니티 접점).
     */
    await page.goto('/ko/');
    const why = await page.locator('.notify__acts-why').first().innerText();
    expect(why, '왜 묻는지가 적혀 있지 않습니다').toMatch(/활동/);
    expect(why, '없는 검증단을 이유로 들고 있습니다').not.toMatch(/검증단/);
  });

  test('탭 영역이 44px 이상이다', async ({ page }) => {
    await page.goto('/ko/');
    const boxes = page.locator('[data-launch-notify]').first().locator('.notify__act');
    const n = await boxes.count();
    for (let i = 0; i < n; i += 1) {
      const box = await boxes.nth(i).boundingBox();
      expect(box?.height ?? 0, `${i}번째 항목`).toBeGreaterThanOrEqual(44);
    }
  });
});
