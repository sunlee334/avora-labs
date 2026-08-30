import { test, expect } from '@playwright/test';
import { SITE_VERIFICATION } from '../../src/config/site';
import { sitemapUrls } from '../support/sitemap';

/**
 * 검색엔진 사이트 소유권 확인 태그.
 *
 * 이 파일이 잡으려는 것은 **설정과 실제 출력이 어긋나는 것** 입니다.
 * 값을 넣었는데 태그가 안 나가거나, 값을 지웠는데 빈 태그가 남는 상태.
 * 둘 다 화면으로는 전혀 드러나지 않고, 알게 되는 시점은 소유권이 풀린
 * 뒤입니다.
 *
 * 구글은 여기 없습니다 — 도메인 속성을 DNS TXT 로 확인하므로 사이트가
 * 내보내는 것이 아니라 Cloudflare DNS 쪽 설정입니다.
 */

const TAG = 'meta[name="naver-site-verification"]';

test.describe('네이버 소유권 확인', () => {
  test('설정과 실제 태그가 일치한다', async ({ page }) => {
    await page.goto('/ko/');
    const tag = page.locator(TAG);

    if (!SITE_VERIFICATION.naver) {
      // 빈 content 는 확인에 실패할 뿐 아니라 "뭔가 하려다 만 상태" 라는
      // 신호가 됩니다. 값이 없으면 태그 자체가 없어야 합니다.
      await expect(tag, '값이 없는데 태그가 나갔습니다').toHaveCount(0);
      return;
    }

    await expect(tag, '값이 있는데 태그가 없습니다').toHaveCount(1);
    await expect(tag).toHaveAttribute('content', SITE_VERIFICATION.naver);
  });

  test('공개된 모든 주소에 실린다', async ({ request }) => {
    /*
     * 네이버는 확인 시점에 어느 주소를 볼지 우리가 정하지 않고, 확인이 끝난
     * 뒤에도 주기적으로 다시 봅니다. 홈에만 있으면 그 재확인이 다른 주소에
     * 닿았을 때 소유권이 풀립니다.
     *
     * "공개된 주소" 의 기준은 사이트맵입니다 — 우리가 색인해 달라고 제출한
     * 목록이 곧 네이버가 볼 수 있는 범위입니다. 관리 화면은 여기 없고,
     * 있어서도 안 됩니다(product-seo 가 그것을 지킵니다).
     */
    test.skip(!SITE_VERIFICATION.naver, '값이 아직 없습니다');

    const urls = await sitemapUrls(request);
    expect(urls.length, '사이트맵이 비어 있습니다').toBeGreaterThan(0);

    const missing: string[] = [];
    for (const url of urls) {
      const html = await (await request.get(new URL(url).pathname)).text();
      if (!html.includes('naver-site-verification')) missing.push(new URL(url).pathname);
    }
    expect(missing, `태그가 빠진 주소: ${missing.join(', ')}`).toEqual([]);
  });

  test('태그가 하나뿐이다', async ({ page }) => {
    // 같은 이름의 메타태그가 둘이면 네이버가 어느 쪽을 읽을지 알 수 없습니다.
    // 레이아웃과 개별 페이지 양쪽에 넣는 실수를 막습니다.
    test.skip(!SITE_VERIFICATION.naver, '값이 아직 없습니다');
    for (const path of ['/ko/', '/ko/product', '/en/', '/th/support']) {
      await page.goto(path);
      await expect(page.locator(TAG), path).toHaveCount(1);
    }
  });

  test('태그 전체를 붙여넣은 값이 아니다', async () => {
    /*
     * 네이버 화면은 `<meta name="naver-site-verification" content="..." />`
     * 를 통째로 줍니다. 그것을 그대로 넣으면 따옴표가 이중으로 들어가
     * 마크업이 깨지는데, 빌드는 통과하고 화면도 멀쩡해 보입니다.
     */
    expect(SITE_VERIFICATION.naver, '태그가 아니라 content 값만 넣으세요').not.toMatch(/[<>"]/);
  });
});
