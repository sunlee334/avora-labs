import { test, expect } from '@playwright/test';

/**
 * 제품 페이지와 구조화 데이터.
 * 확정되지 않은 값이 사실처럼 새어나가지 않는지가 이 파일의 핵심 관심사입니다.
 */

function jsonLdOf(html: string): any[] {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)];
  return blocks.map((m) => JSON.parse(m[1]));
}

test.describe('제품 상세', () => {
  test('Product · FAQPage · BreadcrumbList JSON-LD 가 있다', async ({ request }) => {
    const res = await request.get('/ko/product');
    const schemas = jsonLdOf(await res.text());
    const types = schemas.map((s) => s['@type']);

    expect(types).toContain('Product');
    expect(types).toContain('FAQPage');
    expect(types).toContain('BreadcrumbList');
  });

  test('Product 구조화 데이터의 기본 정보가 맞다', async ({ request }) => {
    const res = await request.get('/ko/product');
    const product = jsonLdOf(await res.text()).find((s) => s['@type'] === 'Product');

    expect(product).toBeTruthy();
    expect(product.name).toBe('Daily Sunscreen');
    expect(product.brand.name).toBe('AVORA');
    // offers 는 가격 유무에 따라 달라지므로 모드별 테스트에서 확인합니다.
    // (launch: offers 없음 / commerce: 화면 가격과 일치)
  });

  test('미확정 스펙은 감추지 않고 "확정 예정" 으로 노출한다', async ({ page }) => {
    await page.goto('/ko/product');

    // 확정된 값
    await expect(page.locator('.spec')).toContainText('SPF50+ / PA++++');
    // 미확정 값 — 제형·내수성·용량 세 항목
    await expect(page.locator('.spec__value--pending')).toHaveCount(3);
  });

  test('FAQ 가 접히지 않고 초기 HTML 에 그대로 있다', async ({ request }) => {
    const res = await request.get('/en/product');
    const html = await res.text();

    // details/summary 로 접으면 답변엔진이 본문으로 보지 않을 수 있습니다.
    expect(html).not.toContain('<details');
    expect(html).toContain('What kind of brand is AVORA?');
    expect(html).toContain('SPF50+ / PA++++');
  });
});

test.describe('사이트 전역 SEO', () => {
  test('robots.txt 가 장바구니·체크아웃을 막고 sitemap 을 가리킨다', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('Disallow: /*/cart');
    expect(body).toContain('Sitemap:');
  });

  test('sitemap 에 5개 언어 홈이 모두 있다', async ({ request }) => {
    const res = await request.get('/sitemap-0.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    for (const locale of ['ko', 'en', 'zh', 'th', 'vi']) {
      expect(xml).toContain(`/${locale}/`);
    }
    // 404 는 사이트맵에서 빠져 있어야 합니다.
    expect(xml).not.toContain('/404');
  });

  test('llms.txt 가 미확정 값을 단정하지 말라고 명시한다', async ({ request }) => {
    const res = await request.get('/llms.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('AVORA');
    expect(body).toContain('Do not state values');
  });

  test('페이지마다 title 과 description 이 다르다', async ({ request }) => {
    const home = await (await request.get('/ko/')).text();
    const product = await (await request.get('/ko/product')).text();

    const titleOf = (h: string) => h.match(/<title>(.*?)<\/title>/s)?.[1];
    const descOf = (h: string) => h.match(/<meta name="description" content="(.*?)"/s)?.[1];

    expect(titleOf(home)).toBeTruthy();
    expect(titleOf(product)).toBeTruthy();
    expect(titleOf(home)).not.toBe(titleOf(product));
    expect(descOf(home)).not.toBe(descOf(product));
  });
});
