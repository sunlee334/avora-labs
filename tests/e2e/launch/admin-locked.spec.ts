import { test, expect } from '@playwright/test';

/**
 * 인증이 설정되지 않은 상태의 관리 화면.
 *
 * launch 모드에는 Access 설정도, 개발용 토큰도 넘기지 않습니다.
 * 즉 "아직 아무것도 설정하지 않고 배포한 상태"와 같습니다.
 *
 * 그 상태에서 관리 화면이 열려 있으면 주문의 연락처와 배송지가 인터넷에
 * 그대로 노출됩니다. 설정을 깜빡하는 일은 실제로 일어나므로, 그때
 * 열리는 쪽이 아니라 잠기는 쪽이 기본값이어야 합니다.
 */

test.describe('설정이 없으면 관리 화면은 잠겨 있다', () => {
  test('관리 API 는 403 으로 닫혀 있고 이유를 알려준다', async ({ request }) => {
    const res = await request.get('/api/admin/orders');
    expect(res.status()).toBe(403);

    const body = await res.json();
    expect(body.error).toBe('ACCESS_NOT_CONFIGURED');
    // 무엇을 해야 열리는지가 메시지에 있어야 합니다.
    expect(body.message).toContain('ACCESS_TEAM_DOMAIN');
  });

  test('아무 헤더나 붙여도 열리지 않는다', async ({ request }) => {
    const attempts: Record<string, string>[] = [
      { 'X-Admin-Dev-Token': 'guess' },
      { 'Cf-Access-Jwt-Assertion': 'not.a.jwt' },
    ];
    for (const headers of attempts) {
      const res = await request.get('/api/admin/orders', { headers });
      expect(res.status()).toBe(403);
    }
  });

  test('관리 화면 페이지도 나가지 않는다', async ({ request }) => {
    const res = await request.get('/admin');
    expect(res.status()).toBe(403);

    // 화면 껍데기라도 나가면 어떤 관리 기능이 있는지 드러납니다.
    const html = await res.text();
    expect(html).not.toContain('data-rows');
    expect(res.headers()['x-robots-tag']).toContain('noindex');
  });
});
