import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ORIGIN, BUSINESS, INDEXED_LOCALES } from '../../src/config/site';
import { jsonLdOf, sitemapUrls } from '../support/sitemap';
import en from '../../src/i18n/en.json' with { type: 'json' };
import ko from '../../src/i18n/ko.json' with { type: 'json' };

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

  test('구조화 데이터가 가리키는 그림이 전부 살아 있다', async ({ request }) => {
    /*
     * `Product.image` 가 `/og/product.jpg` 를 가리키고 있었습니다. 공유 그림은
     * 언어마다 다르므로(`product.ko.jpg`) 그 이름의 파일은 **없습니다.**
     * 검색엔진은 이미지를 불러오지 못하는 `Product` 를 무효로 처리하고,
     * 답변엔진은 죽은 이미지를 받습니다.
     *
     * 위의 검사가 이것을 놓친 이유는 `name`·`brand`·`manufacturer` 까지만
     * 봤기 때문입니다. **주소가 살아 있는지는 아무도 보지 않았습니다** —
     * 바로 아래 llms.txt 검사가 링크마다 하는 그 일을요.
     *
     * 그래서 제품 페이지 한 장이 아니라 사이트맵 전체를 훑습니다. 다음에
     * 어느 페이지가 그림을 가진 스키마를 내더라도 같은 그물에 걸립니다.
     */
    const seen = new Map<string, string>(); // 그림 주소 → 처음 발견한 페이지

    for (const url of await sitemapUrls(request)) {
      const path = new URL(url).pathname;
      for (const schema of jsonLdOf(await (await request.get(path)).text())) {
        // `image` · `logo` 처럼 그림을 가리키는 값만 모읍니다. 중첩된 노드
        // (`publisher.logo` 등)까지 닿도록 직렬화한 문자열에서 훑습니다.
        for (const [, image] of JSON.stringify(schema).matchAll(
          /"(?:image|logo|contentUrl|thumbnailUrl)":"(https:[^"]+)"/g,
        )) {
          if (!seen.has(image)) seen.set(image, path);
        }
      }
    }

    expect(seen.size, '구조화 데이터에 그림이 하나도 없습니다').toBeGreaterThan(0);

    for (const [image, page] of seen) {
      const res = await request.get(new URL(image).pathname);
      expect(res.status(), `${page} 의 구조화 데이터가 가리키는 ${image}`).toBe(200);
    }
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
     * 미확정으로 보이는가** 입니다. 차단지수·제형·내수성 세 줄이 그 대상입니다.
     *
     * 미확정을 드러내는 방법은 두 가지고, 둘 중 어느 쪽이든 됩니다.
     *   값이 있으면 → '목표' 꼬리표
     *   값이 없으면 → '확정 예정'
     * 처음에는 꼬리표 개수를 3으로 박아 두었는데, 제형이 값을 잃고 '확정
     * 예정' 으로 바뀌자 **더 정직해졌는데도** 검사가 깨졌습니다. 개수가 아니라
     * 줄마다 확인합니다.
     */
    // 라벨을 여기 베껴 적으면 문구를 다듬을 때마다 이 검사가 함께 깨집니다.
    const labels = ko.product.spec.labels;
    for (const label of [labels.protection, labels.texture, labels.waterResistant]) {
      const row = page.locator('.spec .spec__row').filter({ hasText: label }).first();
      await expect(row, `${label} 줄`).toHaveCount(1);
      const marks = await row.locator('.spec__target, .spec__value--pending').count();
      expect(marks, `${label} 이 확정된 것처럼 보입니다`).toBe(1);
    }

    // 값이 없는 항목은 여전히 감추지 않고 "확정 예정" 으로 드러냅니다.
    const rows = await page.locator('.spec .spec__row').count();
    expect(rows, '스펙 줄이 사라지지 않았습니다').toBeGreaterThanOrEqual(8);
  });

  test('FAQ 가 접히지 않고 초기 HTML 에 그대로 있다', async ({ request }) => {
    const res = await request.get('/en/product');
    const html = await res.text();

    /*
     * 답변엔진이 인용하는 것은 질문과 답입니다. 그걸 접어 두면 본문으로 보지
     * 않을 수 있어, **FAQ 만은** 펼친 채로 둡니다.
     *
     * 처음에는 페이지 전체에 `<details` 가 없는지 봤는데, 그건 이 검사가
     * 말하는 것보다 넓었습니다. 상품정보고시는 열한 줄 중 아홉이 "확정 예정"
     * 이라 접어 두고(D2), 대신 아래에서 그 내용이 초기 HTML 에 실려 있는지
     * 따로 확인합니다.
     */
    /*
     * ⚠️ 이 검사는 오랫동안 **아무것도 재지 않았습니다.** FAQ 섹션에 `id="faq"`
     * 가 없어서 `indexOf` 가 -1 을 돌려주고, `slice(-1)` 이 마지막 한 글자만
     * 남겼습니다. 한 글자 안에 `<details` 가 있을 리 없으니 늘 통과했습니다.
     *
     * 앵커가 생기면서 드러났습니다. 이제 앵커가 있는지 먼저 확인하고, 범위를
     * **FAQ 섹션 안** 으로 닫습니다 — 문서 끝까지 열어 두면 뒤따르는
     * 상품정보고시의 `<details>`(D2 에서 일부러 접은 것)를 잡습니다.
     */
    const anchor = html.indexOf('id="faq"');
    expect(anchor, 'FAQ 섹션에 앵커가 없습니다 — 홈에서 이 자리로 링크가 옵니다')
      .toBeGreaterThan(-1);

    // 창을 섹션 여는 태그부터 잡습니다. 앵커(`id="faq"`)부터 자르면 섹션을
    // **감싼** `<details>` 가 창 밖에 남아 접어도 통과합니다.
    const start = html.lastIndexOf('<section', anchor);
    const end = html.indexOf('id="disclosure"', anchor);
    const faq = html.slice(start, end > -1 ? end : undefined);
    expect(faq, 'FAQ 가 접혀 있습니다').not.toContain('<details');

    // 감싸는 경우까지 봅니다 — 여는 태그 바로 앞을 함께 확인합니다.
    expect(
      html.slice(Math.max(0, start - 200), start),
      'FAQ 섹션이 접기 요소로 감싸져 있습니다',
    ).not.toContain('<details');

    // 질문 문구는 번역 파일이 정합니다 — 여기 베껴 적으면 문구를 다듬을
    // 때마다 이 검사가 함께 깨집니다.
    expect(html).toContain(en.product.faq.items[0].q);
    expect(html).toContain('SPF50+ / PA++++');
  });

  test('접어 둔 상품정보고시도 초기 HTML 에 실린다', async ({ request }) => {
    /*
     * 접는 것과 안 싣는 것은 다릅니다. `<details>` 안이라도 서버가 내려준
     * HTML 에 들어 있어야 크롤러와 스크린리더가 읽습니다. 자바스크립트로
     * 열 때 채우는 방식으로 바뀌면 여기서 걸립니다.
     */
    const html = await (await request.get('/ko/product')).text();
    const start = html.indexOf('class="disclosure"');
    expect(start, '고시 접힘을 찾지 못했습니다').toBeGreaterThan(0);

    const block = html.slice(start, html.indexOf('</details>', start));
    for (const label of Object.values(ko.product.disclosure.labels)) {
      expect(block, `«${label}» 이 초기 HTML 에 없습니다`).toContain(label);
    }
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

    /*
     * 사이트맵에 적은 주소와 페이지가 선언한 canonical 이 **같은 문자열** 이어야
     * 합니다. 여기서 문자열로 못 박지 않고 사이트맵에서 읽어 와 대조하는 이유는,
     * 예전에 이 검사가 canonical 을 문자열로 박아 두는 바람에 둘이 어긋난 채로
     * 통과했기 때문입니다.
     *
     * 어긋나면 이렇게 됩니다 — 사이트맵은 `/ko/product/` 를 신고하는데 페이지는
     * `/ko/product` 를 canonical 로 선언하고, 그 주소는 307 로 다시 앞의 주소에
     * 넘어갑니다. 즉 우리가 "이 페이지의 대표 주소" 라고 알린 곳이 리다이렉트
     * 입니다. 화면에는 아무 흔적도 남지 않습니다.
     */
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const target = urls.find((u) => u.endsWith('/ko/product/'));
    expect(target, '사이트맵에 /ko/product/ 가 없습니다').toBeTruthy();

    await page.goto('/ko/product/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', target!);
  });

  test('sitemap 에 색인하는 언어의 홈이 있다', async ({ request }) => {
    /*
     * 전에는 5개 언어를 모두 확인했습니다. ZH/TH/VI 는 진출(2028년)까지
     * 색인하지 않기로 하면서 사이트맵에서도 뺐습니다 — 넣어 두면 사이트맵은
     * "색인해 달라", 페이지는 "하지 말라" 가 됩니다.
     *
     * 어느 언어를 넣을지는 tests/e2e/indexing-policy.spec.ts 가 정하고,
     * 여기서는 그 결정이 사이트맵에 반영됐는지만 봅니다.
     */
    const res = await request.get('/sitemap-0.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    for (const locale of INDEXED_LOCALES) {
      expect(xml, `${locale} 홈이 사이트맵에 없습니다`).toContain(`/${locale}/`);
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

  test('llms.txt 가 가리키는 주소가 전부 살아 있고, 브랜드는 브랜드 페이지를 가리킨다', async ({ request }) => {
    /*
     * 정적 파일이라 화면이 바뀌어도 따라오지 않습니다. 브랜드 서사를
     * `/brand` 로 옮긴 뒤에도 "브랜드" 항목이 홈을 가리킨 채였고, 설명문까지
     * "브랜드 소개" 라고 말했습니다 — 답변 엔진에게는 그 이름표가 붙은 유일한
     * 링크라, 브랜드 이야기가 없는 페이지를 브랜드 페이지로 안내한 셈입니다.
     */
    const body = await (await request.get('/llms.txt')).text();
    const urls = [...body.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((m) => m[1]);
    expect(urls.length, 'llms.txt 에 링크가 없습니다').toBeGreaterThan(4);

    for (const url of urls) {
      const path = new URL(url).pathname;
      const res = await request.get(path);
      expect(res.status(), `llms.txt 가 가리키는 ${path}`).toBe(200);
    }

    const brandLine = body.split('\n').find((l) => l.startsWith('- [브랜드]'));
    expect(brandLine, 'llms.txt 에 브랜드 항목이 없습니다').toBeTruthy();
    expect(brandLine, '브랜드 항목이 브랜드 페이지를 가리키지 않습니다').toContain('/ko/brand/');
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

/**
 * 이 빌드가 자사 결제를 켠 채로 만들어졌는가.
 *
 * `playwright.config.ts` 가 commerce 모드에서만
 * `PUBLIC_CHECKOUT_MODE=internal` 과 가격을 넘깁니다 — 그 둘이 모두 있어야
 * `SELLS_DIRECTLY` 가 참이 됩니다. 여기서 값을 다시 계산하지 않고 같은
 * 신호(모드)를 봅니다.
 */
const SELLS_IN_THIS_BUILD = process.env.E2E_MODE !== 'launch';

test.describe('사이트맵이 아는 것만 말한다', () => {
  test('글에는 lastmod 가 있고, 모르는 주소에는 없다', async ({ request }) => {
    /*
     * Google 은 일관되게 붙은 `lastmod` 를 재크롤 우선순위에 씁니다. 다만
     * **모든 주소에 빌드 시각을 똑같이 박으면** 배포할 때마다 사이트 전체가
     * 바뀌었다고 말하는 셈이고, 그러면 이 값이 신호이기를 그칩니다.
     *
     * 그래서 실제로 날짜를 아는 것 — 프론트매터를 가진 글 — 에만 답니다.
     */
    const xml = await (await request.get('/sitemap-0.xml')).text();
    const entries = [...xml.matchAll(/<url>(.*?)<\/url>/gs)].map((m) => m[1]);
    expect(entries.length, '사이트맵이 비었습니다').toBeGreaterThan(0);

    const withDate = entries.filter((e) => e.includes('<lastmod>'));
    expect(withDate.length, '글에 lastmod 가 없습니다').toBeGreaterThan(0);

    for (const entry of withDate) {
      /*
       * 글은 카테고리에 따라 두 자리 중 하나에 있습니다(`src/lib/posts.ts`).
       * 한쪽만 못 박으면 **첫 저널 글을 공개하는 순간** 이 검사가 빨개집니다 —
       * 그건 이 기능의 목적 그 자체입니다.
       */
      expect(entry, 'lastmod 가 글이 아닌 주소에 붙었습니다').toMatch(
        /\/(journal|support\/notice)\//,
      );
      expect(entry, 'lastmod 가 날짜 형식이 아닙니다').toMatch(/<lastmod>\d{4}-\d{2}-\d{2}/);
    }

    expect(
      withDate.length,
      '모든 주소에 lastmod 가 붙었습니다 — 그러면 신호가 되지 않습니다',
    ).toBeLessThan(entries.length);
  });

  test('후기가 존재할 수 없으면 색인을 요청하지 않는다', async ({ request }) => {
    /*
     * 내비는 이미 같은 판정을 합니다(`nav.ts` 의 `gate: 'checkout'`).
     * 사이트맵만 그것을 하지 않아, 결제가 꺼진 빌드에서도 빈 후기 페이지가
     * "색인해 달라" 고 제출되고 있었습니다.
     *
     * 결제가 켜진 빌드(commerce 모드)에서는 반대로 들어 있어야 합니다 —
     * 그때는 후기가 존재할 수 있습니다.
     */
    const urls = await sitemapUrls(request);
    const reviews = urls.filter((u) => u.includes('/reviews'));

    if (SELLS_IN_THIS_BUILD) {
      expect(reviews.length, '결제가 켜졌는데 후기 페이지가 사이트맵에 없습니다').toBeGreaterThan(0);
    } else {
      expect(reviews, '후기가 없을 수 있는 빌드인데 색인을 요청합니다').toEqual([]);
    }
  });
});
