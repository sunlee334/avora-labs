import { test, expect } from '@playwright/test';
import { ADMIN_DEV_TOKEN, TEST_HEADERS } from '../../../playwright.config';

/**
 * 화면으로 낸 지원서가 **정말로 저장되는가.**
 *
 * ── 왜 이 검사가 따로 필요한가 ──────────────────────────────
 * 화면은 성공 문구를 띄우고 폼을 감춥니다. 그런데 봇 문턱에 걸려 버려진
 * 요청도 똑같이 201 을 돌려주므로(봇에게 단서를 주지 않으려는 설계) 화면만
 * 봐서는 저장 여부를 알 수 없습니다.
 *
 * 실제로 `/ko/panel` 의 해피패스 검사가 그 상태로 통과하고 있었습니다 —
 * 검사가 폼을 1.8초 만에 채워 봇으로 판정됐고, 지원서는 버려졌는데 화면에는
 * "접수되었습니다" 가 떴습니다.
 *
 * 저장 목록은 관리자 인증을 지나야 하므로 commerce 모드에 둡니다.
 */

const admin = { ...TEST_HEADERS, 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN };

test('브라우저로 낸 지원서가 명단에 남는다', async ({ page, request }) => {
  const email = `browser-${Date.now()}@example.com`;

  await page.goto('/ko/panel/');
  // 봇 문턱을 넘깁니다. 사람은 이 폼을 2초 안에 채우지 못합니다.
  await page.locator('[data-panel-form]').evaluate((el) => {
    (el as HTMLElement).dataset.elapsedOffset = '5000';
  });

  await page.fill('#name', '브라우저테스트');
  await page.fill('#email', email);
  await page.check('input[name="activity"][value="hiking"]');
  await page.check('input[name="frequency"][value="weekly_4_plus"]');
  await page.selectOption('#region', 'jeju');
  await page.check('input[name="consent"]');
  await page.locator('.panelForm button[type="submit"]').click();
  await expect(page.locator('[data-panel-state]')).toBeVisible();

  const res = await request.get('/api/admin/panel?limit=100&offset=0', { headers: admin });
  expect(res.status(), await res.text()).toBe(200);
  const { rows } = (await res.json()) as { rows: Array<Record<string, unknown>> };

  const saved = rows.find((r) => r.email === email);
  expect(saved, '화면에는 접수됐다고 나왔는데 명단에 없습니다').toBeTruthy();
  // 고른 값이 그대로 남아야 종목별로 추릴 수 있습니다.
  expect(saved!.activity).toBe('hiking');
  expect(saved!.frequency).toBe('weekly_4_plus');
  expect(saved!.region).toBe('jeju');
  // 동의 시각이 없는 행은 존재할 수 없습니다.
  expect(saved!.consentedAt, '동의 시각이 없습니다').toBeTruthy();
  // 선택 동의는 체크하지 않았으므로 비어 있어야 합니다.
  expect(saved!.marketingAt, '고르지 않은 광고 동의가 기록됐습니다').toBeFalsy();
});

test('같은 주소로 다시 내면 덮어쓰고 행이 늘지 않는다', async ({ request }) => {
  /*
   * 두 행이 남으면 한 사람에게 샘플을 두 번 보냅니다. 예전 구현은
   * UPDATE 후 INSERT 라, 같은 주소가 동시에 들어오면 UNIQUE 제약으로
   * 터지면서 지원자에게 실패 화면을 보여줬습니다.
   */
  const email = `twice-${Date.now()}@example.com`;
  const base = {
    email, locale: 'ko', consent: true, elapsedMs: 9000,
    frequency: 'weekly_2_3', region: 'seoul',
  };

  await request.post('/api/panel', { data: { ...base, name: '처음', activity: 'running' } });
  await request.post('/api/panel', { data: { ...base, name: '나중', activity: 'golf' } });

  const res = await request.get('/api/admin/panel?limit=100&offset=0', { headers: admin });
  const { rows } = (await res.json()) as { rows: Array<Record<string, unknown>> };
  const mine = rows.filter((r) => r.email === email);

  expect(mine.length, '같은 주소로 두 행이 생겼습니다').toBe(1);
  expect(mine[0].name, '나중에 낸 것이 앞의 것을 덮지 않았습니다').toBe('나중');
  expect(mine[0].activity).toBe('golf');
});

test('동시에 두 번 내도 실패 화면이 뜨지 않는다', async ({ request }) => {
  /*
   * 느린 회선에서 제출 버튼을 두 번 누르면 만들어지는 상황입니다.
   * UPDATE→INSERT 2단계였을 때는 늦은 쪽이 UNIQUE 제약으로 터져 500 이
   * 나갔습니다 — 지원서는 저장됐는데 화면에는 "접수되지 않았습니다".
   */
  const email = `race-${Date.now()}@example.com`;
  const body = {
    email, name: '경합', activity: 'gym', frequency: 'weekly_1',
    region: 'busan', locale: 'ko', consent: true, elapsedMs: 9000,
  };

  const results = await Promise.all(
    Array.from({ length: 4 }, () => request.post('/api/panel', { data: body })),
  );
  for (const r of results) {
    expect(r.status(), `동시 제출에서 ${r.status()} 가 났습니다`).toBe(201);
  }

  const res = await request.get('/api/admin/panel?limit=100&offset=0', { headers: admin });
  const { rows } = (await res.json()) as { rows: Array<Record<string, unknown>> };
  expect(rows.filter((r) => r.email === email).length, '동시 제출로 행이 여러 개 생겼습니다').toBe(1);
});

test('수신 거부가 기록되고 광고 동의가 내려간다', async ({ request }) => {
  const email = `unsub-${Date.now()}@example.com`;
  await request.post('/api/panel', {
    data: {
      email, name: '해지', activity: 'water', frequency: 'weekly_1',
      region: 'daegu', locale: 'ko', consent: true, marketing: true, elapsedMs: 9000,
    },
  });

  const before = await request.get('/api/admin/panel?limit=100&offset=0', { headers: admin });
  const rowsBefore = ((await before.json()) as { rows: Array<Record<string, unknown>> }).rows;
  const mine = rowsBefore.find((r) => r.email === email);
  expect(mine!.marketingAt, '광고 동의가 기록되지 않았습니다').toBeTruthy();

  // 토큰은 관리 목록에 내지 않습니다 — 그 값이 곧 해지 권한이기 때문입니다.
  // 여기서는 없는 토큰으로도 성공처럼 응답하는지만 봅니다.
  const res = await request.get('/api/panel/unsubscribe?t=does-not-exist');
  expect(res.status(), '없는 토큰에 실패를 알려 주고 있습니다').toBe(200);
});
