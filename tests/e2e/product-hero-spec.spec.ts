import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';
import product from '../../src/data/product.json' with { type: 'json' };
import ko from '../../src/i18n/ko.json' with { type: 'json' };

/**
 * 제품 상세 머리 — 사진 대신 목표 사양.
 *
 * ── 사진을 내린 이유 ───────────────────────────────────────
 * 흰 석고 아치와 테라조 바닥 사진이었습니다. 원본에 다른 브랜드 제품이 담겨
 * 있어 그 부분을 잘라내고 질감만 남긴 것이었는데, **남은 것이 하필 흰
 * 아치** 였습니다. 기획안 5-8 이 "그리스풍 장식 · 블루 타일 · 지중해
 * 일러스트" 를 금지합니다. PAROS 가 그리스 섬 이름이라 더 피해야 합니다.
 *
 * ── 대체 사진을 쓰지 않은 이유 ─────────────────────────────
 * **제품이 아직 없습니다.** 없는 제품의 상세 페이지 머리에 대체 사진을 놓는
 * 것보다 자리를 비우고 목표 사양을 보여 주는 편이 정직합니다.
 */

test.describe('제품 히어로 사양 판', () => {
  test('아치 사진이 어느 화면에도 남아 있지 않다', async ({ page }) => {
    await page.goto('/ko/product');
    const srcs = await page
      .locator('img, source')
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute('src') ?? el.getAttribute('srcset') ?? ''),
      );
    for (const src of srcs) {
      expect(src, '내린 아치 사진이 아직 그려집니다').not.toContain('product-daily-sunscreen');
    }
  });

  for (const locale of LOCALES) {
    test(`${locale} — 목표 사양 셋이 배지와 함께 보인다`, async ({ page }) => {
      await page.goto(`/${locale}/product`);
      const panel = page.locator('.product-hero__spec');
      await expect(panel, '사양 판이 없습니다').toBeVisible();

      // 차단지수와 용량은 언어와 무관하게 같은 문자열입니다.
      await expect(panel).toContainText(product.spec.protection);
      await expect(panel).toContainText(product.spec.volume);
      /*
       * ⚠️ 배지가 없으면 미확정 사양을 단정한 것이 됩니다. 기능성 심사와
       * 시험 성적서, 용기 발주가 모두 남아 있습니다.
       */
      await expect(panel.locator('.spec__target'), '목표 배지가 없습니다').toHaveCount(1);
    });
  }

  for (const width of [360, 390, 768, 1280]) {
    test(`${width}px — 값이 통째로 한 줄에 들어가고 가로로 넘치지 않는다`, async ({ page }) => {
      /*
       * 값 하나가 중간에서 끊기면 `SPF50+ /` 처럼 `/` 가 줄 끝에 매달립니다.
       * 그래서 값마다 `nowrap` 입니다.
       *
       * ⚠️ 그런데 구분자(`·`)까지 `nowrap` 을 걸면 줄을 바꿀 자리가 한 곳도
       * 남지 않습니다. WebKit 에서 `50ml` 이 첫 줄 끝에 그대로 붙어 390px
       * 화면을 22px 밀어냈습니다. **Chromium 은 접었습니다** — 한쪽만 보면
       * 놓치는 결함이라 두 엔진에서 함께 잽니다.
       */
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ko/product');
      await page.evaluate(() => document.fonts.ready);

      const shape = await page.evaluate(() => {
        const spans = [
          ...document.querySelectorAll('.product-hero__spec-values span:not([aria-hidden])'),
        ];
        return {
          lines: spans.map((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return [...range.getClientRects()].filter((r) => r.width > 1).length;
          }),
          overflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      expect(shape.lines.length, '값이 없습니다').toBe(2);
      for (const n of shape.lines) {
        expect(n, `값 하나가 ${n}줄로 갈립니다`).toBe(1);
      }
      expect(shape.overflow, '가로로 넘칩니다').toBeLessThanOrEqual(0);
    });
  }

  test('같은 값을 히어로에서 두 번 말하지 않는다', async ({ page }) => {
    /*
     * 전에는 키커에도 `SPF50+ / PA++++` 가 있었습니다. 사양 판이 같은 값을
     * 크게 보여 주므로 한 화면에서 두 번이 됩니다.
     */
    await page.goto('/ko/product');
    const hero = await page.locator('.product-hero').innerText();
    const count = hero.split(product.spec.protection).length - 1;
    expect(count, `«${product.spec.protection}» 이 히어로에 ${count}번 나옵니다`).toBe(1);
  });

  test('공유 카드와 장바구니 썸네일이 승인된 사진을 쓴다', async ({ page }) => {
    /*
     * 사진을 내리면 공유 카드와 장바구니 썸네일도 함께 갈 곳을 잃습니다.
     * 둘 다 WATER 축의 물방울 사진으로 옮겼습니다 — 제품 상세 하단에서 이미
     * 쓰고 있어 화면과 카드가 어긋나지 않습니다.
     */
    expect(product.images.source, '썸네일 원본이 내린 사진을 가리킵니다').not.toContain(
      'product-daily-sunscreen',
    );
    const res = await page.request.get('/product/thumb.jpg');
    expect(res.status(), '장바구니 썸네일이 없습니다').toBe(200);
    const og = await page.request.get(`/og/product.${'ko'}.jpg`);
    expect(og.status(), '공유 카드가 없습니다').toBe(200);
    expect(ko.product.hero.headline.length, '공유 카드 문구가 비었습니다').toBeGreaterThan(0);
  });
});
