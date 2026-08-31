import { test, expect } from '@playwright/test';
import { LOCALES, INDEXED_LOCALES, X_DEFAULT_LOCALE, DEFAULT_LOCALE } from '../../src/config/site';
import { sitemapUrls } from '../support/sitemap';

/**
 * 어느 언어를 검색엔진에 내보내는가.
 *
 * 중국·태국·베트남 진출은 2028년입니다. 그 전까지 세 언어판은 갱신되지 않는
 * 얇은 페이지로 남고, 색인되면 사이트 전체 품질 신호를 끌어내립니다.
 *
 * 이 판단이 세 곳에 걸려 있습니다 — robots 메타, 사이트맵, hreflang.
 * 셋이 어긋나면 검색엔진에 서로 다른 말을 하게 되는데, 화면에서는 아무것도
 * 보이지 않습니다.
 */

/*
 * **결정을 여기에 적습니다.** `INDEXED_LOCALES` 를 그대로 기대값으로 쓰면,
 * 그 상수를 바꾸는 순간 기대값도 함께 바뀌어 검사가 실패할 수 없습니다.
 * 처음에 그렇게 썼다가 사보타주가 통과하는 것으로 드러났습니다.
 *
 * 이 목록을 바꾸려면 검사도 함께 고쳐야 하고, 그게 결정을 다시 확인하는
 * 자리입니다. 2028년 진출 때 여기와 site.ts 를 함께 엽니다.
 */
const SHOULD_INDEX = ['ko', 'en'] as const;
const SHOULD_NOT_INDEX = ['zh', 'th', 'vi'] as const;

test.describe('색인 정책', () => {
  test('설정이 정해 둔 결정과 같다', () => {
    expect([...INDEXED_LOCALES].sort()).toEqual([...SHOULD_INDEX].sort());
    // 다섯 언어가 두 목록으로 남김없이 갈려야 합니다.
    expect([...SHOULD_INDEX, ...SHOULD_NOT_INDEX].sort()).toEqual([...LOCALES].sort());
  });

  for (const locale of SHOULD_INDEX) {
    test(`/${locale}/ 는 색인한다`, async ({ request }) => {
      const html = await (await request.get(`/${locale}/`)).text();
      const robots = html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? '';
      expect(robots, `/${locale}/ 에 noindex 가 붙었습니다`).not.toContain('noindex');
    });
  }

  for (const locale of SHOULD_NOT_INDEX) {
    test(`/${locale}/ 는 색인하지 않는다`, async ({ request }) => {
      const html = await (await request.get(`/${locale}/`)).text();
      const robots = html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? '';
      expect(robots, `/${locale}/ 가 색인 대상이 아닌데 noindex 가 없습니다`).toContain('noindex');
      // 링크는 따라가야 합니다 — 이 페이지가 가리키는 한국어판은 발견돼야 합니다.
      expect(robots, 'follow 가 빠졌습니다').toContain('follow');
    });
  }

  test('사이트맵에는 색인하는 언어만 있다', async ({ request }) => {
    /*
     * 사이트맵은 "색인해 달라", 페이지는 "하지 말라" 가 되면 서로 다른 말을
     * 하는 셈입니다.
     */
    const urls = await sitemapUrls(request);
    expect(urls.length, '사이트맵이 비어 있습니다').toBeGreaterThan(0);

    const stray = urls.filter((u) => {
      const m = new URL(u).pathname.match(/^\/(\w+)\//);
      return m && !SHOULD_INDEX.includes(m[1] as never);
    });
    expect(stray, `색인하지 않는 언어가 사이트맵에 있습니다: ${stray.join(' / ')}`).toEqual([]);
  });

  test('색인하지 않는 언어도 hreflang 에는 남는다', async ({ request }) => {
    /*
     * URL 과 hreflang 은 그대로 둡니다. 주소가 사라지면 이미 공유된 링크가
     * 죽고, hreflang 이 빠지면 "다른 언어판" 정보를 잃습니다.
     */
    const html = await (await request.get('/ko/')).text();
    for (const locale of LOCALES) {
      expect(html, `hreflang 에 ${locale} 이 없습니다`).toContain(`href="https://avoralabs.co/${locale}/"`);
    }
  });
});

test.describe('x-default', () => {
  test('대표판은 한국어판이다', async ({ request }) => {
    /*
     * 한국 법인이고 검증단 모집·펀딩·첫 판매가 모두 한국입니다. 크롤러가
     * 대표판으로 보는 것이 한국어여야 브랜드명 검색 신호가 한 곳에 모입니다.
     */
    const html = await (await request.get('/ko/')).text();
    const found = html.match(/hreflang="x-default" href="([^"]*)"/)?.[1];
    // 상수가 아니라 **결정** 을 적습니다 — 상수를 기대값으로 쓰면 상수를
    // 바꾸는 순간 검사도 따라 바뀌어 실패할 수 없습니다.
    expect(found).toBe('https://avoralabs.co/ko/');
    expect(X_DEFAULT_LOCALE, 'site.ts 의 값이 화면과 다릅니다').toBe('ko');
  });

  test('언어를 모를 때의 대체 언어와는 다른 값이다', () => {
    /*
     * 둘은 다른 것을 묻습니다 — "대표판은 무엇인가" 와 "언어를 모르겠는데
     * 무엇을 보여줄까". 프랑스어 접속자는 한국어가 아니라 영어를 받아야
     * 합니다. 한 상수로 합치면 그게 깨집니다.
     */
    expect(X_DEFAULT_LOCALE).not.toBe(DEFAULT_LOCALE);
  });

  test('언어를 모르는 접속자는 대체 언어를 받는다', async ({ request }) => {
    const res = await request.get('/', {
      headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
      maxRedirects: 0,
    });
    expect(res.headers()['location'], '프랑스어 접속자가 엉뚱한 곳으로 갑니다').toContain(
      `/${DEFAULT_LOCALE}/`,
    );
  });
});
