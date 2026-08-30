import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN_DEV_TOKEN, TEST_HEADERS } from '../../../playwright.config';
import { HONEYPOT_FIELD, MIN_FILL_MS } from '../../../worker/spam';

/**
 * 봇이 낸 것이 **정말로 버려지는가.**
 *
 * ── 왜 별도 파일인가 ────────────────────────────────────────
 * 응답 코드만 보면 아무것도 증명하지 못합니다. 버린 요청도 201 이고 저장된
 * 요청도 201 이기 때문입니다 — 봇에게 무엇에 걸렸는지 알려 주지 않으려고
 * 일부러 그렇게 했습니다.
 *
 * 그래서 **저장된 목록을 직접 봅니다.** 그 목록은 관리자 인증을 지나야 하고,
 * launch 모드에는 개발용 토큰을 넘기지 않으므로 여기(commerce)에 둡니다.
 *
 * 실제로 처음 만든 검사는 이걸 못 봤습니다. 봇 판별을 통째로 지워도
 * 통과했습니다.
 */

const admin = { ...TEST_HEADERS, 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN };

async function notifyEmails(request: APIRequestContext): Promise<string[]> {
  const res = await request.get('/api/admin/launch-notify?limit=100&offset=0', { headers: admin });
  expect(res.status(), await res.text()).toBe(200);
  const data = (await res.json()) as { rows: Array<{ email: string }> };
  return data.rows.map((r) => r.email);
}

async function panelEmails(request: APIRequestContext): Promise<string[]> {
  const res = await request.get('/api/admin/panel?limit=100&offset=0', { headers: admin });
  expect(res.status(), await res.text()).toBe(200);
  const data = (await res.json()) as { rows: Array<{ email: string }> };
  return data.rows.map((r) => r.email);
}

test.describe('덫에 걸린 것은 저장되지 않는다', () => {
  test('알림 신청', async ({ request }) => {
    const trapped = `trap-${Date.now()}@example.com`;
    const clean = `clean-${Date.now()}@example.com`;

    await request.post('/api/launch-notify', {
      data: { email: trapped, locale: 'ko', source: 'test', [HONEYPOT_FIELD]: 'http://spam' },
    });
    await request.post('/api/launch-notify', {
      data: { email: clean, locale: 'ko', source: 'test' },
    });

    const emails = await notifyEmails(request);
    expect(emails, '덫에 걸린 주소가 명단에 들어갔습니다').not.toContain(trapped);
    expect(emails, '정상 신청이 버려졌습니다').toContain(clean);
  });

  test('검증단 지원', async ({ request }) => {
    const base = {
      name: '테스트', activity: 'running', frequency: 'weekly_2_3',
      region: 'seoul', locale: 'ko', consent: true,
    };
    const trapped = `ptrap-${Date.now()}@example.com`;
    const clean = `pclean-${Date.now()}@example.com`;

    await request.post('/api/panel', {
      data: { ...base, email: trapped, [HONEYPOT_FIELD]: 'http://spam' },
    });
    await request.post('/api/panel', { data: { ...base, email: clean } });

    const emails = await panelEmails(request);
    expect(emails, '덫에 걸린 지원서가 저장됐습니다').not.toContain(trapped);
    expect(emails, '정상 지원이 버려졌습니다').toContain(clean);
  });
});

test.describe('너무 빨리 낸 것은 저장되지 않는다', () => {
  test('알림 신청', async ({ request }) => {
    const fast = `fast-${Date.now()}@example.com`;
    const slow = `slow-${Date.now()}@example.com`;

    await request.post('/api/launch-notify', {
      data: { email: fast, locale: 'ko', source: 'test', elapsedMs: 300 },
    });
    await request.post('/api/launch-notify', {
      data: { email: slow, locale: 'ko', source: 'test', elapsedMs: MIN_FILL_MS + 1000 },
    });

    const emails = await notifyEmails(request);
    expect(emails, '2초 안에 낸 것이 저장됐습니다').not.toContain(fast);
    expect(emails, '충분히 기다린 사람이 막혔습니다').toContain(slow);
  });

  test('검증단 지원', async ({ request }) => {
    /*
     * 이 짝이 빠져 있었습니다. `/api/panel` 의 시간 문턱은 응답만 보는 검사가
     * 있었을 뿐 저장 여부를 보는 짝이 없어, 판별을 통째로 지워도 통과했습니다.
     */
    const base = {
      name: '테스트', activity: 'running', frequency: 'weekly_2_3',
      region: 'seoul', locale: 'ko', consent: true,
    };
    const fast = `pfast-${Date.now()}@example.com`;
    const slow = `pslow-${Date.now()}@example.com`;

    await request.post('/api/panel', { data: { ...base, email: fast, elapsedMs: 300 } });
    await request.post('/api/panel', { data: { ...base, email: slow, elapsedMs: MIN_FILL_MS + 1000 } });

    const emails = await panelEmails(request);
    expect(emails, '2초 안에 낸 것이 저장됐습니다').not.toContain(fast);
    expect(emails, '충분히 기다린 사람이 막혔습니다').toContain(slow);
  });
});
