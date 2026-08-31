import { test, expect } from '@playwright/test';
import commerce from '../../../src/config/commerce.json' with { type: 'json' };

/**
 * 신청자 수가 화면에 어떻게 나오는가.
 *
 * **launch 폴더에 있는 이유:** 판매가 켜진 빌드에는 홈에 알림 폼이 아예
 * 없습니다(CAN_ORDER 이면 heroNotify 섹션이 빠집니다). 뿌리에 두었더니
 * commerce 모드에서 "요소를 찾을 수 없다" 로 실패했습니다.
 *
 * 서버 쪽 규칙(임계값·유출·캐시)은 모드와 무관하므로 뿌리의
 * `signup-count.spec.ts` 에 남겼습니다.
 */

test.describe('신청자 수 표시', () => {
  test('보여준다면 임계값을 넘은 숫자다', async ({ page }) => {
    /*
     * 특정 숫자를 기대하지 않습니다. 이 스위트는 도는 동안 실제로 신청을
     * 만들어 내므로, 검사 시작 때 읽은 값과 화면에 뜬 값이 다를 수 있습니다.
     * 지킬 규칙은 **숫자가 보인다면 임계값 이상** 하나입니다.
     */
    await page.goto('/ko/');
    await page.waitForLoadState('networkidle');

    const shown = page.locator('.notify__waiting:not([hidden])');
    const n = await shown.count();
    if (n === 0) return; // 임계값 미만 — 아무것도 그리지 않는 것이 맞습니다.

    const text = await shown.first().innerText();
    const digits = text.replace(/[^0-9]/g, '');
    expect(digits, `숫자가 없는 문구가 떴습니다: «${text}»`).not.toBe('');
    expect(Number(digits), `${commerce.signupCounter.minimum}명 미만인데 화면에 떴습니다`)
      .toBeGreaterThanOrEqual(commerce.signupCounter.minimum);
  });

  test('자리를 미리 차지하지 않는다', async ({ page }) => {
    // 빈 줄이 먼저 그려지면 값이 올 때 아래 내용이 밀립니다.
    await page.goto('/ko/');
    const slot = page.locator('.notify__waiting').first();
    await expect(slot, '신청자 수 자리가 없습니다').toHaveCount(1);
    // 비어 있는 동안에는 hidden 이라 높이를 차지하지 않습니다.
    const box = await slot.boundingBox();
    const text = ((await slot.textContent()) ?? '').trim();
    if (text === '') expect(box, '값이 없는데 자리를 차지합니다').toBeNull();
  });
});
