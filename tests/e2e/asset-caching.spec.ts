import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * 정적 자산의 브라우저 캐시.
 *
 * Workers static assets 의 기본값은 `max-age=0, must-revalidate` 라, 내용해시가
 * 붙은 파일까지 페이지를 옮길 때마다 조건부 요청을 한 번씩 더 보냈습니다.
 * 정책은 `public/_headers` 에 있고, 이 파일은 **그 정책이 실제로 응답에
 * 붙는지** 를 봅니다 — 파일만 두고 안 걸리는 경우가 조용하기 때문입니다.
 *
 * ⚠️ `_headers` 는 **Worker 가 만든 응답에는 적용되지 않습니다.** 그래서
 * `wrangler.jsonc` 의 `run_worker_first` 제외 목록과 `_headers` 의 경로가
 * 어긋나면 규칙이 아무 데도 안 걸립니다. 그 어긋남이 여기서 드러납니다.
 */

/** 홈 HTML 이 실제로 물고 있는 자산 주소. 해시가 붙어 매 빌드 달라집니다. */
async function assetPaths(request: APIRequestContext) {
  const html = await (await request.get('/ko/')).text();
  const find = (re: RegExp) => html.match(re)?.[1];
  return {
    css: find(/href="(\/_astro\/[^"]+\.css)"/),
    js: find(/src="(\/_astro\/[^"]+\.js)"/),
    font: find(/href="(\/fonts\/[^"]+\.woff2)"/),
  };
}

function maxAge(header: string | undefined): number | null {
  const m = header?.match(/max-age=(\d+)/);
  return m ? Number(m[1]) : null;
}

test.describe('정적 자산 캐시', () => {
  test('내용해시가 붙은 자산은 영구 캐시된다', async ({ request }) => {
    const { css, js } = await assetPaths(request);
    expect(css, '홈이 무는 CSS 를 찾지 못했습니다').toBeTruthy();
    expect(js, '홈이 무는 JS 를 찾지 못했습니다').toBeTruthy();

    for (const path of [css!, js!]) {
      const cc = (await request.get(path)).headers()['cache-control'];
      /*
       * 이름에 내용해시가 있으므로 내용이 바뀌면 주소가 바뀝니다.
       * 낡은 것을 계속 쓸 위험이 없어 `immutable` 이 안전합니다.
       */
      expect(maxAge(cc), `${path} 가 여전히 매번 재검증합니다`).toBeGreaterThan(86400);
      expect(cc, `${path} 에 immutable 이 없습니다`).toContain('immutable');
    }
  });

  test('이름이 고정된 자산은 영구 캐시하지 않는다', async ({ request }) => {
    const { font } = await assetPaths(request);
    expect(font, '홈이 preload 하는 글꼴을 찾지 못했습니다').toBeTruthy();

    const cc = (await request.get(font!)).headers()['cache-control'];
    /*
     * 글꼴은 해시가 없고 문안이 바뀌면 서브셋이 다시 만들어집니다. 오래
     * 잡아 두면 새 글자가 빠진 옛 파일을 계속 쓰게 되고, 그게 `1c2a1fe` 가
     * 고쳤던 "푸터가 다른 서체로 떨어지는" 증상입니다.
     *
     * 그렇다고 매번 재검증할 이유도 없습니다 — 아래·위 두 문턱 사이에 둡니다.
     */
    expect(maxAge(cc), `${font} 가 여전히 매번 재검증합니다`).toBeGreaterThan(0);
    expect(cc, `${font} 를 영구 캐시하면 배포해도 새 글자가 안 갑니다`).not.toContain(
      'immutable',
    );
    expect(maxAge(cc)).toBeLessThanOrEqual(86400);
  });

  test('HTML 은 그대로 매번 확인한다', async ({ request }) => {
    /*
     * 페이지는 Worker 를 지나므로 `_headers` 가 걸리지 않습니다. 그게 맞습니다 —
     * 주소가 고정된 문서라 낡은 것을 쓰면 배포가 사람에게 도달하지 않습니다.
     * 이 검사는 `_headers` 를 넓게 적었다가 HTML 까지 잡아 버리는 사고를 막습니다.
     */
    const cc = (await request.get('/ko/')).headers()['cache-control'];
    /*
     * 헤더가 **있는지부터** 봅니다. 없으면 브라우저가 나름의 추측으로 캐시하는데,
     * 그건 `max-age=0` 보다 나쁘고 눈에도 안 띕니다.
     */
    expect(cc, 'HTML 에 Cache-Control 이 아예 없습니다').toBeTruthy();
    expect(maxAge(cc), 'HTML 이 캐시되면 배포가 사람에게 늦게 갑니다').toBe(0);
  });
});
