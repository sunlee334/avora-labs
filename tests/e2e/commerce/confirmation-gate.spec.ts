import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN_DEV_TOKEN, TEST_HEADERS } from '../../../playwright.config';

/**
 * 같은 사람에게 확인 메일을 두 번 보내지 않기 위한 조건.
 *
 * ── 왜 이것이 중요한가 ──────────────────────────────────────
 * 두 폼 다 로그인 없이 **아무 주소나** 넣을 수 있습니다. 재제출마다 메일을
 * 보내면, 남의 주소를 적어 반복 제출하는 것만으로 그 사람의 편지함을 두들길
 * 수 있습니다. 속도 제한이 1차 방어이고, "처음 낸 것에만 보낸다" 가 2차입니다.
 *
 * ── 왜 메일이 아니라 행을 보는가 ────────────────────────────
 * 발송은 운영 호스트에서만 돌아서(worker/mailer.ts) 검사에서는 한 통도 나가지
 * 않습니다. 대신 **판정의 근거** 를 봅니다 — 두 핸들러는 "행이 새로 생겼는가"
 * 로 갈리고, 그 판정은 `id` 가 그대로냐로 내려집니다. 다시 낸 지원이 새 `id`
 * 를 받게 되는 순간 두 곳 다 조용히 중복 발송으로 바뀝니다.
 *
 * 발송 자체의 모양은 `tests/e2e/mailer.spec.ts` 가 봅니다.
 */

const admin = { ...TEST_HEADERS, 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN };

async function rows<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const res = await request.get(`${path}?limit=100&offset=0`, { headers: admin });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { rows: T[] }).rows;
}

test.describe('다시 낸 것은 새 행이 아니다', () => {
  test('검증단 지원', async ({ request }) => {
    const email = `again-${Date.now()}@example.com`;
    const base = {
      name: '테스트', email, activity: 'running', frequency: 'weekly_2_3',
      locale: 'ko', consent: true,
    };

    const first = await request.post('/api/panel', { data: { ...base, region: 'seoul' } });
    expect(first.status()).toBe(201);

    type Row = { id: string; email: string; region: string };
    const before = (await rows<Row>(request, '/api/admin/panel')).filter((r) => r.email === email);
    expect(before, '첫 지원이 저장되지 않았습니다').toHaveLength(1);

    // 지역을 바꿔 다시 냅니다 — 마음이 바뀌어 다시 내는 실제 흐름입니다.
    const second = await request.post('/api/panel', { data: { ...base, region: 'busan' } });
    expect(second.status()).toBe(201);

    const after = (await rows<Row>(request, '/api/admin/panel')).filter((r) => r.email === email);
    expect(after, '같은 주소로 두 행이 생겼습니다').toHaveLength(1);
    expect(after[0].id, '다시 낸 지원이 새 id 를 받았습니다 — 확인 메일이 두 번 나갑니다')
      .toBe(before[0].id);
    // 내용은 나중 것으로 덮여야 합니다. id 만 그대로인 것이 맞습니다.
    expect(after[0].region, '다시 낸 내용이 반영되지 않았습니다').toBe('busan');
  });

  test('출시 알림 신청', async ({ request }) => {
    const email = `dup-${Date.now()}@example.com`;

    const first = await request.post('/api/launch-notify', {
      data: { email, locale: 'ko', source: 'test' },
    });
    expect(first.status()).toBe(201);

    type Row = { id: string; email: string; createdAt: string };
    const before = (await rows<Row>(request, '/api/admin/launch-notify'))
      .filter((r) => r.email === email);
    expect(before, '첫 신청이 저장되지 않았습니다').toHaveLength(1);

    const second = await request.post('/api/launch-notify', {
      data: { email, locale: 'ko', source: 'test', activities: ['running'] },
    });
    expect(second.status()).toBe(201);

    const after = (await rows<Row>(request, '/api/admin/launch-notify'))
      .filter((r) => r.email === email);
    expect(after, '같은 주소로 두 행이 생겼습니다').toHaveLength(1);
    expect(after[0].id, '다시 신청한 주소가 새 id 를 받았습니다').toBe(before[0].id);
    expect(after[0].createdAt, '가입 시각이 덮였습니다').toBe(before[0].createdAt);
  });
});
