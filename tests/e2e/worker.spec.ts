import { test, expect } from '@playwright/test';

/**
 * Worker 가 실제로 담당하는 세 가지 — 루트 리다이렉트, 결제 API, 404.
 * 이 셋이 Cloudflare 요청 한도에 계상되는 유일한 경로이기도 합니다.
 */

test.describe('루트 진입 시 언어 판별', () => {
  const cases: Array<{ header: string; expect: string }> = [
    { header: 'ko-KR,ko;q=0.9,en;q=0.8', expect: '/ko/' },
    { header: 'en-US,en;q=0.9', expect: '/en/' },
    { header: 'zh-CN,zh;q=0.9', expect: '/zh/' },
    { header: 'th-TH,th;q=0.9', expect: '/th/' },
    { header: 'vi-VN,vi;q=0.9', expect: '/vi/' },
    // 지원하지 않는 언어는 x-default 인 영어로 보냅니다.
    { header: 'fr-FR,fr;q=0.9', expect: '/en/' },
    // q 값이 높은 쪽이 이깁니다 — 순서가 아니라 가중치를 봐야 합니다.
    { header: 'en;q=0.3,ko;q=0.9', expect: '/ko/' },
  ];

  for (const c of cases) {
    test(`Accept-Language: ${c.header} → ${c.expect}`, async ({ request }) => {
      const res = await request.get('/', {
        headers: { 'Accept-Language': c.header },
        maxRedirects: 0,
      });
      expect(res.status()).toBe(302);
      expect(res.headers()['location']).toContain(c.expect);
    });
  }

  test('Accept-Language 가 없으면 기본 언어로', async ({ request }) => {
    const res = await request.get('/', { headers: { 'Accept-Language': '' }, maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers()['location']).toContain('/en/');
  });
});

test.describe('결제 승인 엔드포인트', () => {
  test('PG 미설정 상태에서는 503 과 이유를 돌려준다', async ({ request }) => {
    const res = await request.post('/api/payments/confirm', {
      data: { paymentKey: 'test_key', orderId: 'AVORA-TEST-1', amount: 32000 },
    });
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('PAYMENT_NOT_CONFIGURED');
  });

  test('GET 은 405', async ({ request }) => {
    const res = await request.get('/api/payments/confirm');
    expect(res.status()).toBe(405);
  });

  test('없는 API 경로는 404 JSON', async ({ request }) => {
    const res = await request.get('/api/nope');
    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toContain('application/json');
  });
});

test.describe('404', () => {
  test('없는 경로는 404 상태와 해당 언어 404 페이지', async ({ request }) => {
    const res = await request.get('/ko/이런페이지없음');
    expect(res.status()).toBe(404);
    const html = await res.text();
    expect(html).toContain('이 길은 아직 없습니다.');
  });

  test('404 페이지는 noindex', async ({ request }) => {
    const res = await request.get('/en/no-such-page');
    const html = await res.text();
    expect(html).toContain('noindex');
  });
});
