import { test, expect } from '@playwright/test';
// `with { type: 'json' }` 는 생략할 수 없습니다 — Playwright 의 로더가 거부합니다.
import commerce from '../../src/config/commerce.json' with { type: 'json' };

/**
 * 신청자 수 공개.
 *
 * 설정한 인원을 넘기 전까지는 숫자를 내보내지 않습니다 — "12명이
 * 신청했습니다" 는 아무도 관심이 없다는 뜻으로 읽히기 때문입니다.
 *
 * 이 검사가 없으면 임계값을 지워도 아무도 모릅니다. 숫자가 적은 초기에
 * 그대로 노출되는 것이 이 기능의 유일한 실패 방식입니다.
 */

test.describe('신청자 수', () => {
  test('임계값보다 적으면 숫자를 주지 않는다', async ({ request }) => {
    const res = await request.get('/api/launch-notify/count');
    expect(res.status()).toBe(200);

    const { count } = (await res.json()) as { count: number | null };
    const minimum = commerce.signupCounter.minimum;

    /*
     * 명단이 몇 명인지는 환경마다 다릅니다. 확인하는 것은 하나 —
     * **숫자가 왔다면 반드시 임계값 이상** 이라는 것.
     */
    if (count !== null) {
      expect(typeof count, `숫자가 아닌 값이 왔습니다: ${JSON.stringify(count)}`).toBe('number');
      expect(count, `${minimum}명 미만인데 숫자를 내보냈습니다`).toBeGreaterThanOrEqual(minimum);
    }
  });

  test('명단 자체는 공개하지 않는다', async ({ request }) => {
    /*
     * 세는 것과 보여주는 것은 다릅니다. 이 경로가 언젠가 행을 통째로
     * 돌려주게 되면 이메일 명단이 그대로 공개됩니다.
     */
    const body = await (await request.get('/api/launch-notify/count')).text();
    expect(body, '응답에 @ 가 들어 있습니다 — 이메일이 새고 있는지 확인하세요').not.toContain('@');
    expect(Object.keys(JSON.parse(body))).toEqual(['count']);
  });

  test('잠깐 캐시하되 오래 붙들지 않는다', async ({ request }) => {
    // 매 요청마다 세면 D1 을 헛되이 두드리고, 오래 캐시하면 숫자가 멈춥니다.
    const res = await request.get('/api/launch-notify/count');
    const cache = res.headers()['cache-control'] ?? '';
    expect(cache, `Cache-Control 이 «${cache}» 입니다`).toMatch(/max-age=(\d+)/);
    const age = Number(cache.match(/max-age=(\d+)/)![1]);
    expect(age).toBeGreaterThan(0);
    expect(age, '10분을 넘으면 화면 숫자가 너무 오래 멈춥니다').toBeLessThanOrEqual(600);
  });
});
