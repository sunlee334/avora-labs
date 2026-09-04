import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * **없는 것을 없다고 먼저 말하는가.**
 *
 * ── 왜 이 문장이 필요한가 ──────────────────────────────────
 * 제품 기획안 4-5 가 이 전략의 약점을 스스로 적었습니다.
 *
 *   실사용 근거의 부재: 기준을 세워 고르는 방식은 내부 판단의 밀도를
 *   높이지만, 소비자에게는 여전히 브랜드의 주장임. 출시 전 실사용 데이터가
 *   없다는 점이 이 전략의 약점임.
 *
 * 사이트는 "기준을 먼저 정해 고른다" 를 길게 말합니다. 그 이야기가 설득력을
 * 가질수록, 실제로 써 본 사람이 없다는 사실이 더 크게 빠집니다. 후기를 찾으러
 * 온 사람이 **빈 페이지를 만나기 전에** 먼저 말합니다.
 *
 * ── 왜 살 수 있게 되면 사라지는가 ──────────────────────────
 * 그때는 후기가 쌓이기 시작하고, 없다고 말할 이유가 없어집니다. 남겨 두면
 * 후기가 있는데도 없다고 말하는 문장이 됩니다.
 */

/*
 * 우리가 직접 파는가(`SELLS_DIRECTLY`). 후기는 우리 주문에 매달려 있어
 * **`CAN_ORDER` 가 아니라 이 값** 을 따라갑니다.
 *
 * 빌드 시점 값이라 검사 프로세스에서 그대로 import 할 수 없습니다. 대신
 * 모드로 읽습니다 — launch 빌드는 `PUBLIC_CHECKOUT_MODE=external` 이라
 * `SELLS_DIRECTLY` 가 거짓입니다(`sticky-cta-clearance.spec.ts` 와 같은 관용구).
 */
const SELLS = process.env.E2E_MODE !== 'launch';

test.describe('출시 전 후기 부재', () => {
  for (const locale of LOCALES) {
    test(`${locale} — 후기 링크 앞에서 먼저 밝힌다`, async ({ page }) => {
      test.skip(SELLS, '우리가 팔기 시작하면 이 문장은 사라집니다');
      await page.goto(`/${locale}/product/`);

      const note = page.locator('.product__reviewsNote');
      await expect(note, '없다는 사실을 말하지 않습니다').toHaveCount(1);
      await expect(note).toBeVisible();
      expect((await note.innerText()).trim().length, '문장이 비었습니다').toBeGreaterThan(10);

      /*
       * 순서가 요점입니다. 링크를 누른 뒤 빈 페이지에서 알게 되는 것과,
       * 누르기 전에 아는 것은 다릅니다.
       */
      const order = await page.evaluate(() => {
        const note = document.querySelector('.product__reviewsNote');
        const link = document.querySelector('main a[href$="/reviews/"]');
        // 못 찾으면 그 사실을 돌려줍니다. `!` 로 단정하면 evaluate 안에서
        // TypeError 가 나고, 화면에는 "스크립트가 죽었다" 만 남습니다.
        if (!note) return 'note-missing';
        if (!link) return 'link-missing';
        return note.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING
          ? 'before'
          : 'after';
      });
      expect(order, '후기 링크보다 뒤에 있습니다 — 누른 다음에야 알게 됩니다').toBe('before');
    });
  }

  test('살 수 있으면 이 문장은 없다', async ({ page }) => {
    test.skip(!SELLS, 'launch 모드에서는 우리가 팔지 않습니다');
    await page.goto('/ko/product/');
    await expect(
      page.locator('.product__reviewsNote'),
      '후기가 쌓이기 시작하는데 없다고 말하고 있습니다',
    ).toHaveCount(0);
  });
});
