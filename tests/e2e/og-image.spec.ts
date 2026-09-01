import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
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
     * ⚠️ 여기서 그림 자체는 보지 않습니다. "문구를 고치고 `npm run og` 를
     * 잊었다" 는 **빌드가** 잡습니다 — 원본 폰트가 없는 곳(CI)에서 prebuild 의
     * `npm run og` 가 커버리지를 확인하고 모자라면 멈춥니다(build-og.mjs 의
     * checkSubsets). 여기서 지키는 것은 "화면과 그림이 같은 곳에서 나온다" 와
     * **언어마다 다른 문구를 쓴다** 입니다 — 한 언어를 복사해 다섯에 붙이는
     * 사고가 이 둘 사이로 빠져나갑니다.
     */
    /*
     * 문구를 **사전에서 읽어** 옵니다. 예전에는 여기에 문장을 그대로 적어
     * 두었는데, 카피가 바뀌자 이 검사만 옛말을 붙들고 실패했습니다.
     * 지키려는 것은 특정 문장이 아니라 "화면과 그림이 같은 곳에서 나온다" 입니다.
     */
    const seen = new Set<string>();
    for (const locale of LOCALES) {
      const dict = JSON.parse(readFileSync(`src/i18n/${locale}.json`, 'utf8'));
      const promise: string = dict.home.hero.promise;
      expect(promise.length, `${locale} 히어로 보조 문구가 비었습니다`).toBeGreaterThan(0);
      const html = await (await request.get(`/${locale}/`)).text();
      expect(html, `${locale} 화면이 그림과 다른 문구를 그립니다`).toContain(promise);
      seen.add(promise);
    }
    expect(seen.size, `언어마다 다른 문구여야 하는데 ${seen.size}종뿐입니다`).toBe(LOCALES.length);
  });
});
