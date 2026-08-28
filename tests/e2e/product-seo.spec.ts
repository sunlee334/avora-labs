import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ORIGIN, BUSINESS } from '../../src/config/site';
import { jsonLdOf, sitemapUrls } from '../support/sitemap';
import en from '../../src/i18n/en.json' with { type: 'json' };

/**
 * 제품 페이지와 구조화 데이터.
 * 확정되지 않은 값이 사실처럼 새어나가지 않는지가 이 파일의 핵심 관심사입니다.
 */

test.describe('제품 상세', () => {
  test('Product · BreadcrumbList JSON-LD 가 있다', async ({ request }) => {
    const res = await request.get('/ko/product');
    const schemas = jsonLdOf(await res.text());
    const types = schemas.map((s) => s['@type']);

    expect(types).toContain('Product');
    expect(types).toContain('BreadcrumbList');

    /*
     * FAQPage 는 **일부러 없습니다.**
     *
     * 질문은 화면에 그대로 있습니다(아래 "FAQ 가 접히지 않고..." 검사가
     * 지킵니다). 구조화 데이터만 고객센터 한 곳으로 모았습니다 —
     * 같은 주제로 두 페이지가 FAQPage 를 내면 검색에서 서로 갉아먹고,
     * 답변엔진은 어느 쪽을 인용할지 모릅니다.
     *
     * 사람은 사던 자리에서 읽고, 검색엔진은 한 곳만 봅니다.
     */
    expect(types, 'FAQPage 는 고객센터 한 곳에만 있어야 합니다').not.toContain('FAQPage');
  });

  test('Product 구조화 데이터의 기본 정보가 맞다', async ({ request }) => {
    const res = await request.get('/ko/product');
    const product = jsonLdOf(await res.text()).find((s) => s['@type'] === 'Product');

    expect(product).toBeTruthy();
    expect(product.name).toBe('Daily Sunscreen');
    // 브랜드명을 여기 베껴 적으면, 브랜드가 바뀔 때 이 검사가 **바뀌었다는
    // 이유로** 깨집니다. 잡아야 할 것(구조화 데이터가 화면과 어긋나는 것)과
    // 구분이 안 됩니다. 설정에서 읽습니다.
    expect(product.brand.name).toBe(BUSINESS.brandName);
    expect(product.manufacturer.name).toBe(BUSINESS.companyName);
    // offers 는 가격 유무에 따라 달라지므로 모드별 테스트에서 확인합니다.
    // (launch: offers 없음 / commerce: 화면 가격과 일치)
  });

  test('아직 확정이 아닌 스펙을 확정처럼 적지 않는다', async ({ page }) => {
    await page.goto('/ko/product');

    await expect(page.locator('.spec')).toContainText('SPF50+ / PA++++');

    /*
     * 제품 기획안이 값을 정해 주면서 "확정 예정" 자리가 줄었습니다. 그렇다고
     * 단정해도 되는 것은 아닙니다 — 공장 처방 선정은 2026년 9~10월이고,
     * 기능성화장품은 심사·보고가 남아 있습니다. 심사 전에 차단지수를 확정
     * 사실로 적으면 표시·광고 문제가 됩니다.
     *
     * 그래서 검사하는 것은 "확정 예정이 몇 개인가" 가 아니라 **미확정인 것이
     * 미확정으로 보이는가** 입니다. 차단지수·제형·내수성 세 줄에는 값이 있되
     * '목표' 꼬리표가 붙어 있어야 합니다.
     */
    await expect(page.locator('.spec .spec__target')).toHaveCount(3);

    // 값이 없는 항목은 여전히 감추지 않고 "확정 예정" 으로 드러냅니다.
    const rows = await page.locator('.spec .spec__row').count();
    expect(rows, '스펙 줄이 사라지지 않았습니다').toBeGreaterThanOrEqual(8);
  });

  test('FAQ 가 접히지 않고 초기 HTML 에 그대로 있다', async ({ request }) => {
    const res = await request.get('/en/product');
    const html = await res.text();

    // details/summary 로 접으면 답변엔진이 본문으로 보지 않을 수 있습니다.
    expect(html).not.toContain('<details');
    // 질문 문구는 번역 파일이 정합니다 — 여기 베껴 적으면 문구를 다듬을
    // 때마다 이 검사가 함께 깨집니다.
    expect(html).toContain(en.product.faq.items[0].q);
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

  test('robots·sitemap·canonical 이 모두 같은 주소를 가리킨다', async ({ page, request }) => {
    // Worker 이름을 바꿨을 때 robots.txt 에 옛 주소가 그대로 남아 있었습니다.
    // 사람 눈에는 보이지 않고 검색엔진에만 보이는 종류의 오류라, 여기서 묶어 둡니다.
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap-index.xml`);

    const sitemap = await (await request.get('/sitemap-0.xml')).text();
    expect(sitemap).toContain(`${ORIGIN}/ko/`);

    await page.goto('/ko/product');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${ORIGIN}/ko/product`,
    );
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
    expect(body).toContain(BUSINESS.brandName);
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

test.describe('배포 설정과 정식 주소가 어긋나지 않는다', () => {
  /**
   * `ORIGIN` 은 canonical·hreflang·sitemap·OG·JSON-LD 가 가리키는 주소이고,
   * `wrangler.jsonc` 의 `routes` 는 **실제로 응답하는** 주소입니다.
   *
   * 둘이 어긋나면 사이트는 멀쩡히 열리는데 검색엔진과 답변엔진만 존재하지
   * 않는 주소를 봅니다. 화면을 아무리 봐도 드러나지 않는 종류의 오류라
   * 여기서 묶어 둡니다.
   */
  const wrangler = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf-8');
  const patterns = [...wrangler.matchAll(/"pattern"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);

  test('ORIGIN 의 호스트가 Worker 라우트에 있다', () => {
    expect(patterns.length, 'wrangler.jsonc 에 routes 가 없습니다').toBeGreaterThan(0);
    expect(patterns).toContain(new URL(ORIGIN).host);
  });

  test('정식 주소는 https 이고 끝에 슬래시가 없다', () => {
    // 슬래시가 붙으면 new URL(path, ORIGIN) 이 만드는 주소가 // 로 겹칩니다.
    expect(ORIGIN).toMatch(/^https:\/\//);
    expect(ORIGIN.endsWith('/'), `${ORIGIN} 끝에 슬래시가 있습니다`).toBe(false);
  });

  test('workers.dev 주소가 정식 주소로 남아 있지 않다', () => {
    // 임시 주소로 되돌아간 채 배포되면 PG 가맹 심사에 등록한 도메인과
    // 실제 서비스 주소가 달라집니다.
    expect(ORIGIN).not.toContain('workers.dev');
  });
});

test.describe('사이트맵과 색인 신호가 서로 어긋나지 않는다', () => {
  /**
   * 사이트맵은 "이 주소를 색인해 달라" 는 제출입니다. 그런데 그 안에
   * noindex 페이지나 robots.txt 가 막은 경로가 들어 있으면, 우리가 서로
   * 반대되는 신호를 동시에 보내는 셈입니다.
   *
   * 실제로 46개 주소 중 26개가 그랬고, **관리 화면 경로(/admin/)까지
   * 공개 사이트맵에 실려 있었습니다.** 화면으로는 드러나지 않고
   * Search Console 에만 오류로 보이는 종류입니다.
   */
  test('사이트맵의 모든 주소가 실제로 색인 가능하다', async ({ request }) => {
    const urls = await sitemapUrls(request);
    expect(urls.length, '사이트맵이 비어 있습니다').toBeGreaterThan(0);

    const blocked: string[] = [];
    for (const url of urls) {
      const path = new URL(url).pathname;
      const res = await request.get(path);
      expect(res.status(), `${path} 가 열리지 않습니다`).toBe(200);
      if (/<meta[^>]+name="robots"[^>]+noindex/i.test(await res.text())) blocked.push(path);
    }
    expect(blocked, `noindex 인데 사이트맵에 있습니다: ${blocked.join(' / ')}`).toEqual([]);
  });

  test('robots.txt 가 막은 경로는 사이트맵에 없다', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)$/gm)].map((m) => m[1]);
    expect(disallowed.length, 'robots.txt 에 Disallow 가 없습니다').toBeGreaterThan(0);

    // robots.txt 의 * 는 정규식이 아니라 "임의 문자열" 입니다.
    const patterns = disallowed.map(
      (rule) => new RegExp('^' + rule.split('*').map(escapeRegExp).join('.*')),
    );

    const conflicts = (await sitemapUrls(request)).filter((url) =>
      patterns.some((re) => re.test(new URL(url).pathname)),
    );
    expect(conflicts, `robots.txt 가 막은 주소가 사이트맵에 있습니다: ${conflicts.join(' / ')}`).toEqual([]);
  });

  test('관리 화면 경로가 사이트맵에 없다', async ({ request }) => {
    // robots.txt 가 /admin 을 막고 있지 않으므로 위 검사에 걸리지 않습니다.
    // 관리 화면 주소를 공개 사이트맵으로 알려 줄 이유는 없습니다.
    const urls = await sitemapUrls(request);
    expect(urls.filter((u) => u.includes('/admin'))).toEqual([]);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
