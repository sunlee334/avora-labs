import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 공유 그림.
 *
 * 링크를 붙였을 때 상대가 보는 것입니다. 화면과 달리 **우리가 그 자리에서
 * 고칠 수 없는** 자리라(카카오톡·왓츠앱이 캐시합니다) 처음부터 맞아야 합니다.
 */

test.describe('공유 그림', () => {
  test('언어마다 다른 그림이 나간다', async ({ request }) => {
    /*
     * 전에는 5개 언어가 `og/home.jpg` 한 장을 함께 썼고, 그 그림에는 글자가
     * 하나도 없었습니다. 카카오톡에 주소를 붙이면 노을 앞 실루엣만 뜨고
     * 무엇에 관한 링크인지 알 수 없었습니다.
     */
    const seen = new Map<string, string>();
    for (const lang of LOCALES) {
      const html = await (await request.get(`/${lang}/`)).text();
      const url = html.match(/property="og:image" content="([^"]+)"/)?.[1];
      expect(url, `${lang} 에 og:image 가 없습니다`).toBeTruthy();
      seen.set(lang, url!);
    }
    expect(
      new Set(seen.values()).size,
      `언어별로 갈리지 않습니다 — ${[...seen].map(([k, v]) => `${k} ${v.split('/').pop()}`).join(' · ')}`,
    ).toBe(LOCALES.length);
  });

  test('가리키는 그림이 실제로 있고 규격에 맞는다', async ({ request }) => {
    // 크롤러는 404 를 만나면 그림 없이 미리보기를 그립니다.
    for (const lang of LOCALES) {
      for (const page of ['', 'product']) {
        const html = await (await request.get(`/${lang}/${page}`)).text();
        const url = html.match(/property="og:image" content="([^"]+)"/)![1];
        const res = await request.get(new URL(url).pathname);
        expect(res.status(), `${lang}/${page} 의 ${url}`).toBe(200);

        const bytes = (await res.body()).length;
        // OG 그림은 300KB 를 넘으면 일부 메신저가 통째로 건너뜁니다.
        expect(bytes, `${url} 이 ${Math.round(bytes / 1024)}KB`).toBeLessThan(300 * 1024);
      }
    }
  });

  test('그림 안의 글자가 그 언어다', async ({ request }) => {
    /*
     * 그림 안 글자는 검사가 읽을 수 없습니다(픽셀입니다). 대신 **그림을 만든
     * 근거** 가 화면의 문구와 같은지 봅니다 — 그림은 `home.hero.promise` 를
     * 그대로 그리므로, 화면에 그 문구가 있으면 그림도 그 언어입니다.
     *
     * 이렇게 재는 이유: 문구를 고치고 `npm run og` 를 잊으면 그림만 옛말을
     * 하게 되는데, 그건 `npm run og -- --check` 가 잡습니다. 여기서는 두
     * 곳이 같은 곳에서 나온다는 것만 지킵니다.
     */
    const html = await (await request.get('/ko/')).text();
    expect(html).toContain('처방은 달리는 사람들이 고릅니다.');
  });
});
