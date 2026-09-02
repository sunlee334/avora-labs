import { test, expect } from '@playwright/test';
import { LOCALES, INDEXED_LOCALES } from '../../src/config/site';
import { visibleTop, type NavFlags } from '../../src/config/nav';
import commerce from '../../src/config/commerce.json' with { type: 'json' };
import ko from '../../src/i18n/ko.json' with { type: 'json' };

/*
 * ⚠️ `nav-gates.ts` 를 import 하면 안 됩니다.
 *
 * 그쪽은 `runtime.ts` 를 물고, `runtime.ts` 는 `payment-config.json` 을
 * `with { type: 'json' }` 로 읽습니다 — Playwright 러너가 그 형태를 로드하지
 * 못해 스위트 전체가 시작도 못 합니다. `nav.ts` 가 순수한 이유가 그것이고,
 * 그 파일 머리주석이 "이 파일의 import 문은 import type 하나뿐" 이라고
 * 못 박아 두었습니다. 플래그는 여기서 만듭니다 —
 * `nav-reviews-gate.spec.ts` 가 쓰는 방법과 같습니다.
 */
const MODE = process.env.E2E_MODE === 'launch' ? 'launch' : 'commerce';
const FLAGS: NavFlags = {
  checkout: MODE === 'commerce',
  accounts: MODE === 'commerce' ? true : commerce.accounts.enabled,
};
const TOP_VISIBLE = visibleTop(FLAGS);

/**
 * 공지와 읽을거리가 갈렸는가, 그리고 갈리면서 아무것도 잃지 않았는가.
 *
 * ── 왜 갈랐나 ──────────────────────────────────────────────
 * 브랜드명 검색만으로는 유입이 없습니다. 읽을거리는 사이트에서 유일하게
 * **정보성 검색으로 새 사람을 데려올 수 있는** 자리인데, 고객센터 하위에
 * 있으면 검색에도 사람에게도 "고객지원 문서" 로 읽힙니다.
 *
 *   /support/posts  →  /journal          읽을거리. 최상위
 *                      /support/notice   운영 공지. 고객센터 안
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────
 * 나누는 일에서 가장 흔한 사고는 **밖에 공유된 링크가 죽는 것** 입니다.
 * 그래서 리다이렉트를 성격이 아니라 동작으로 확인합니다.
 */

test.describe('주소가 성격대로 갈린다', () => {
  for (const lang of LOCALES) {
    test(`/${lang}/journal/ 과 /${lang}/support/notice/ 가 둘 다 있다`, async ({ request }) => {
      expect((await request.get(`/${lang}/journal/`)).status()).toBe(200);
      expect((await request.get(`/${lang}/support/notice/`)).status()).toBe(200);
    });
  }

  test('저널은 읽을거리만, 공지는 공지만 보여준다', async ({ page }) => {
    /*
     * 지금 있는 글은 배송 안내(공지) 하나입니다. 저널에 그것이 나오면
     * 카테고리로 가르는 일이 일어나지 않은 것입니다.
     */
    await page.goto('/ko/support/notice/');
    await expect(page.locator('.postList__item')).toHaveCount(1);
    await expect(page.locator('.postList__item')).toContainText('배송');

    await page.goto('/ko/journal/');
    // 저널은 아직 비어 있습니다 — 초안 두 편은 내보내지 않습니다.
    await expect(page.locator('.postList__empty')).toBeVisible();
  });
});

test.describe('옛 주소가 죽지 않는다', () => {
  /*
   * 밖에 공유된 링크는 우리가 회수할 수 없습니다. 목록은 저널로 보냅니다 —
   * 공유되는 것은 대개 읽을거리이고, 공지를 찾던 사람은 고객센터에서 한 칸이면
   * 닿습니다.
   */
  test('목록 주소가 저널로 301 한다', async ({ request }) => {
    const res = await request.get('/ko/support/posts', { maxRedirects: 0 });
    expect(res.status(), '영구 이동이 아닙니다').toBe(301);
    expect(res.headers()['location']).toContain('/ko/journal/');
  });

  test('글 주소가 그 글이 실제로 있는 곳으로 301 한다', async ({ request }) => {
    /*
     * 워커는 마크다운을 읽지 않아 카테고리를 모릅니다. 두 자리를 실제로
     * 두드려 보고 있는 쪽으로 보냅니다 — 표를 만들어 심으면 글을 옮길 때
     * 표와 실물이 갈라질 수 있습니다.
     */
    const res = await request.get('/ko/support/posts/shipping-notice', { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()['location']).toContain('/ko/support/notice/shipping-notice/');
  });

  test('없는 글은 저널 목록으로 보낸다 — 404 로 떨어뜨리지 않는다', async ({ request }) => {
    const res = await request.get('/ko/support/posts/없는글', { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()['location']).toContain('/ko/journal/');
  });

  test('따라가면 실제로 200 이다', async ({ request }) => {
    // 리다이렉트가 또 다른 리다이렉트로 가거나 404 로 끝나면 소용이 없습니다.
    expect((await request.get('/ko/support/posts/shipping-notice')).status()).toBe(200);
    expect((await request.get('/ko/support/posts')).status()).toBe(200);
  });
});

test.describe('헤더에 저널이 있다', () => {
  test('최상위 메뉴가 다섯이다', () => {
    const ids = TOP_VISIBLE.map((t) => t.id);
    expect(ids, '저널이 최상위에 없습니다').toContain('journal');
    expect(ids).toEqual(['product', 'brand', 'panel', 'journal', 'support']);
  });

  test('화면에서 저널로 갈 수 있다', async ({ page }) => {
    /*
     * 좁은 화면에서는 최상위 목록이 시트 안에 있습니다. 여기서 보려는 것은
     * "메뉴가 그 자리를 가리키는가" 이므로 넓은 화면에서 확인합니다 —
     * 좁은 화면의 시트는 `mobile-menu.spec.ts` 가 따로 봅니다.
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    const link = page.locator('.nav').getByRole('link', { name: ko.nav.journal, exact: true });
    await expect(link.first()).toHaveAttribute('href', '/ko/journal/');
  });

  test('375px 에서 헤더가 가로 스크롤을 만들지 않는다', async ({ page }) => {
    /*
     * 메뉴가 다섯이 되면서 좁은 화면이 걱정입니다. **햄버거로 되돌리지
     * 않는다** 는 것이 지시서의 제약이라, 넘치는지를 여기서 봅니다.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/ko/');
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow, '375px 에서 가로로 넘칩니다').toBeLessThanOrEqual(0);
  });
});

test.describe('색인 신호가 새 주소를 가리킨다', () => {
  test('사이트맵에 옛 주소가 없다', async ({ request }) => {
    const xml = await (await request.get('/sitemap-0.xml')).text();
    expect(xml, '사이트맵이 아직 옛 주소를 말합니다').not.toContain('/support/posts');
    for (const locale of INDEXED_LOCALES) {
      expect(xml).toContain(`/${locale}/journal/`);
      expect(xml).toContain(`/${locale}/support/notice/`);
    }
  });

  test('canonical 이 자기 주소를 가리킨다', async ({ request }) => {
    for (const path of ['/ko/journal/', '/ko/support/notice/', '/ko/support/notice/shipping-notice/']) {
      const html = await (await request.get(path)).text();
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      expect(new URL(canonical!).pathname, `${path} 의 canonical`).toBe(path);
    }
  });
});
