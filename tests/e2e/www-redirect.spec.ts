import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ORIGIN } from '../../src/config/site';
import { canonicalHostRedirect } from '../../worker/canonical-host';

/**
 * www 는 정식 주소가 아닙니다.
 *
 * 정식 주소는 `ORIGIN` 하나입니다. www 가 같은 내용을 그대로 서빙하면
 * 검색엔진이 색인을 나눠 갖고, 사람들이 두 가지 주소를 공유하게 됩니다.
 *
 * ── 왜 Worker 가 하는가 ─────────────────────────────────────
 * 원래는 Cloudflare Redirect Rule 이 할 일입니다. 그 규칙은 Worker 보다 먼저
 * 돌아 정적 파일까지 잡습니다. 그것을 쓸 수 없어 Worker 에서 처리하며,
 * 그래서 `wrangler.jsonc` 의 `run_worker_first` 가 페이지 경로 전체를 포함합니다.
 *
 * 그 설정이 되돌려지면 **정적으로 생성된 페이지가 Worker 를 거치지 않게 되어**
 * 리다이렉트가 조용히 사라집니다. 이 파일이 그것을 잡습니다.
 */

/**
 * 로컬 `wrangler dev` 는 Host 를 Worker 에 넘기지 않습니다 — Worker 는
 * 127.0.0.1 을 보고, 응답의 Location 만 프록시가 다시 씁니다. 그래서 HTTP 로는
 * 이 분기를 로컬에서 검증할 수 없습니다.
 *
 * 대신 Worker 의 fetch 를 직접 부릅니다. www 분기는 env 를 건드리기 전에
 * 돌아오므로 빈 env 로 충분하고, 오히려 라우팅에 가려지지 않은 순수한 검사가 됩니다.
 */
function asWww(path: string, protocol = 'https'): Response | null {
  const url = `${protocol}://www.avoralabs.co${path}`;
  return canonicalHostRedirect(new Request(url, { headers: { host: 'www.avoralabs.co' } }));
}

test.describe('www 로 들어오면 정식 주소로 보낸다', () => {
  test('영구 이동(301)이다', () => {
    // 302 로 두면 검색엔진이 www 를 계속 정본 후보로 봅니다.
    const res = asWww('/ko/')!;
    expect(res.status).toBe(301);
  });

  test('경로를 그대로 옮긴다', () => {
    for (const path of ['/ko/', '/en/product', '/ko/support', '/robots.txt', '/sitemap-0.xml']) {
      const res = asWww(path)!;
      expect(res.status, `${path} 상태`).toBe(301);
      expect(res.headers.get('location'), `${path} 이동 주소`).toBe(`${ORIGIN}${path}`);
    }
  });

  test('쿼리 문자열을 잃지 않는다', () => {
    // 공유된 링크에 붙은 유입 경로 표시가 사라지면 어디서 왔는지 알 수 없게 됩니다.
    const res = asWww('/ko/product?utm_source=news&page=2')!;
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/ko/product?utm_source=news&page=2`);
  });

  test('루트도 정식 주소로 보낸다', () => {
    // 언어 판별(302)을 먼저 하면 www 주소로 한 번 더 돌게 됩니다.
    const res = asWww('/')!;
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/`);
  });

  test('한 번에 끝난다 — www 로 다시 보내지 않는다', () => {
    const res = asWww('/ko/')!;
    expect(res.headers.get('location')).not.toContain('www.');
  });

  test('http 로 와도 https 로 보낸다', () => {
    expect(asWww('/ko/', 'http')!.headers.get('location')).toBe(`${ORIGIN}/ko/`);
  });

  test('정식 호스트로 온 요청은 건드리지 않는다', () => {
    // null 을 돌려줘야 뒤의 라우팅이 평소대로 이어집니다.
    const res = canonicalHostRedirect(
      new Request('https://avoralabs.co/ko/', { headers: { host: 'avoralabs.co' } }),
    );
    expect(res).toBeNull();
  });
});

test.describe('apex 는 영향을 받지 않는다', () => {
  test('정식 주소로 온 요청은 그대로 응답한다', async ({ request }) => {
    for (const path of ['/ko/', '/ko/support/', '/robots.txt']) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), `${path}`).toBe(200);
    }
  });

  test('루트의 언어 판별은 그대로 동작한다', async ({ request }) => {
    const res = await request.get('/', {
      headers: { 'Accept-Language': 'ko-KR,ko;q=0.9' },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(302);
    expect(res.headers()['location']).toContain('/ko/');
  });
});

test.describe('페이지가 Worker 를 거치도록 설정돼 있다', () => {
  /**
   * `run_worker_first` 가 페이지 경로를 포함하지 않으면 정적 파일이 Worker 를
   * 거치지 않고 바로 나가고, 위의 리다이렉트가 **조용히 사라집니다.**
   * 화면으로는 아무 문제가 없어 보이는 종류의 회귀입니다.
   */
  const wrangler = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf-8');
  const patterns = (() => {
    const block = wrangler.match(/"run_worker_first"\s*:\s*\[([\s\S]*?)\]/);
    return block ? [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
  })();

  test('페이지 경로 전체가 포함돼 있다', () => {
    expect(patterns, 'run_worker_first 를 찾지 못했습니다').toContain('/*');
  });

  test('해시가 붙은 정적 자산은 제외돼 있다', () => {
    // 제외하지 않으면 이미지·글꼴·CSS 요청까지 Worker 를 거쳐, 리다이렉트 하나
    // 때문에 모든 자산 요청의 비용과 지연이 늘어납니다.
    for (const dir of ['!/_astro/*', '!/fonts/*']) {
      expect(patterns, `${dir} 제외가 없습니다`).toContain(dir);
    }
  });
});
