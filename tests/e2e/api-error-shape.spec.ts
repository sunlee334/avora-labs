import { test, expect } from '@playwright/test';
import { jsonOnError } from '../../worker/errors';

/*
 * 처리 중 예외가 났을 때 API 가 무엇을 돌려주는가.
 *
 * 이전에는 Cloudflare 의 기본 HTML 오류 화면이 나갔습니다. 프런트는 모두
 * `res.json()` 으로 읽으므로, 거기서 파싱이 다시 터지고 손님은 "요청에
 * 실패했습니다" 대신 아무 말도 없는 화면을 봅니다.
 *
 * 예외 자체는 아래 `jsonOnError` 를 직접 불러 검사합니다 — 운영 코드에
 * 일부러 터지는 길을 내지 않고도 그 자리를 정확히 두드릴 수 있습니다.
 * 그 아래는 "잘못된 입력에도 JSON 으로 답한다" 는 별개의 성질입니다.
 */
test.describe('예외가 났을 때', () => {
  const boom = () => Promise.reject(new Error('D1_ERROR: no such table: orders'));

  test('API 경로면 JSON 500 이다', async () => {
    const res = await jsonOnError(new Request('https://example.com/api/orders'), boom);

    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({
      error: 'INTERNAL_ERROR',
      message: '잠시 후 다시 시도해 주세요.',
    });
  });

  test('오류 문구에 테이블 이름을 흘리지 않는다', async () => {
    const res = await jsonOnError(new Request('https://example.com/api/orders'), boom);
    expect(await res.text()).not.toContain('orders');
  });

  test('페이지 경로면 그대로 던진다', async () => {
    // 브라우저는 HTML 을 기다리고 있습니다. 여기서 JSON 을 주면 그게 더 이상합니다.
    await expect(jsonOnError(new Request('https://example.com/ko/'), boom)).rejects.toThrow(
      'D1_ERROR',
    );
  });

  test('안 터지면 답을 그대로 통과시킨다', async () => {
    const ok = new Response('통과', { status: 200 });
    const res = await jsonOnError(new Request('https://example.com/api/orders'), async () => ok);
    expect(res).toBe(ok);
  });
});
const MALFORMED: Array<[string, string, unknown]> = [
  ['출시 알림 · 본문 없음', '/api/launch-notify', undefined],
  ['출시 알림 · 타입이 다름', '/api/launch-notify', { email: 12345, consent: 'yes' }],
  ['문의 · 빈 객체', '/api/inquiries', {}],
  ['후기 · 배열을 보냄', '/api/reviews', [1, 2, 3]],
  ['주문 조회 · 없는 번호', '/api/orders/lookup', { orderId: 'AVORA-없는번호', email: 'x@example.com' }],
];

for (const [name, path, body] of MALFORMED) {
  test(`${name} → JSON 으로 답한다`, async ({ request }) => {
    const res = await request.post(path, {
      headers: { 'Content-Type': 'application/json' },
      data: body === undefined ? '' : (body as object),
    });

    expect(res.headers()['content-type'], `${path} 가 JSON 이 아닙니다`).toContain(
      'application/json',
    );
    // 무엇이 오든 파싱은 되어야 합니다.
    await expect(res.json()).resolves.toBeDefined();
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
}

test('없는 API 경로도 JSON 404 다', async ({ request }) => {
  const res = await request.get('/api/이런건없다');
  expect(res.status()).toBe(404);
  expect(res.headers()['content-type']).toContain('application/json');
});
