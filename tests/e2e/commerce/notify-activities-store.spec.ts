import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN_DEV_TOKEN, TEST_HEADERS } from '../../../playwright.config';

/**
 * 활동 선택이 실제로 저장되는가.
 *
 * 폼 자체는 launch 모드에만 있지만 `/api/launch-notify` 는 두 모드 모두에
 * 있습니다. 저장된 값을 확인하려면 관리 API 가 필요하고, 개발용 관리 토큰은
 * commerce 모드에만 넘어옵니다 — launch 모드는 "토큰 없이도 잠겨 있는가" 를
 * 보는 자리라 그쪽에 토큰을 넣으면 그 검사가 무의미해집니다.
 *
 * 화면 쪽은 tests/e2e/launch/notify-activities.spec.ts 가 봅니다.
 */

function freshEmail(tag: string): string {
  return `act-${tag}-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

async function post(request: APIRequestContext, data: Record<string, unknown>) {
  return request.post('/api/launch-notify', { data });
}

/**
 * 관리 명단에서 한 사람을 찾습니다.
 *
 * 신청 API 는 무엇이 저장됐는지 돌려주지 않습니다 — 그래야 남의 주소가
 * 명단에 있는지 알아낼 수 없습니다. 그래서 확인은 이 길뿐입니다.
 */
async function findSignup(request: APIRequestContext, email: string) {
  const res = await request.get('/api/admin/launch-notify?limit=50&offset=0', {
    headers: { ...TEST_HEADERS, 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN },
  });
  expect(res.status(), '관리 명단을 읽지 못했습니다').toBe(200);
  const data = (await res.json()) as { rows: Array<{ email: string; activities: string[] }> };
  return data.rows.find((r) => r.email === email)!;
}

test.describe('활동 선택 — 저장', () => {
  test('고른 것이 관리 명단에 그대로 나온다', async ({ request }) => {
    const email = freshEmail('pick');
    // 누른 순서를 일부러 뒤집어 보냅니다 — 저장은 정해진 순서로 정규화되어야
    // 같은 조합이 두 형태로 남지 않습니다.
    const res = await post(request, {
      email,
      locale: 'ko',
      source: 'home-hero',
      activities: ['gym', 'running'],
    });
    expect(res.status()).toBe(201);

    const row = await findSignup(request, email);
    expect(row, '명단에서 찾지 못했습니다').toBeTruthy();
    expect(row.activities, '고른 것이 저장되지 않았습니다').toEqual(['running', 'gym']);
  });

  test('안 고른 사람은 빈 목록으로 남는다', async ({ request }) => {
    // 빈 문자열을 넣어 두면 split 결과가 [''] 이라 "하나 골랐다" 처럼 보입니다.
    const email = freshEmail('empty');
    expect((await post(request, { email, locale: 'ko', source: 'home-hero' })).status()).toBe(201);
    const row = await findSignup(request, email);
    expect(row.activities).toEqual([]);
  });

  test('아무것도 안 골라도 신청은 성사된다', async ({ request }) => {
    // 여기서 막으면 명단을 한 줄 잃습니다. 1순위는 이메일입니다.
    for (const activities of [[], undefined, null, 'running']) {
      const res = await post(request, {
        email: freshEmail('none'),
        locale: 'ko',
        source: 'home-hero',
        activities,
      });
      expect(res.status(), `activities=${JSON.stringify(activities)}`).toBe(201);
    }
  });

  test('목록에 없는 값은 신청을 막지 않고 버려진다', async ({ request }) => {
    // 이 열은 우리가 명단을 추리는 데만 씁니다. 손님이 보낸 임의의 문자열을
    // 담아 둘 이유가 없고, 그렇다고 400 을 낼 이유도 없습니다.
    const res = await post(request, {
      email: freshEmail('junk'),
      locale: 'ko',
      source: 'home-hero',
      activities: ['running', '<script>', 'not-a-thing'],
    });
    expect(res.status()).toBe(201);
  });

  test('이메일이 없으면 활동만으로는 신청되지 않는다', async ({ request }) => {
    const res = await post(request, { locale: 'ko', activities: ['running'] });
    expect(res.status()).toBe(400);
  });
});
