import { test, expect } from '@playwright/test';
import { collect, composeDigest, runWeeklyDigest, type DigestStats } from '../../worker/digest';

/**
 * 주간 현황 다이제스트.
 *
 * 크론으로만 도는 코드라 화면에서는 볼 수 없습니다. 그리고 **평소에 조용한
 * 것이 정상** 인 종류라, 망가져도 한동안 아무도 모릅니다 — 알림이 안 오는
 * 것과 신청이 없는 것이 겉으로 같아 보이기 때문입니다.
 * 그래서 지켜야 할 것을 여기 적어 둡니다.
 */

const STATS: DigestStats = {
  from: new Date('2026-08-24T00:00:00Z'),
  to: new Date('2026-08-31T00:00:00Z'),
  notify: { fresh: 12, left: 1, active: 143 },
  panel: {
    fresh: 5,
    total: 28,
    byActivity: [
      { activity: 'running', n: 14 },
      { activity: 'hiking', n: 6 },
      { activity: 'golf', n: 3 },
    ],
  },
};

/** 질의문에 따라 다른 수를 돌려주는 가짜 D1. */
function fakeDb(counts: Record<string, number>): D1Database {
  return {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        first: async () => {
          const key = Object.keys(counts).find((k) => sql.includes(k));
          return { n: key ? counts[key] : 0 };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

test.describe('주간 다이제스트', () => {
  test('신규가 0건인 주에도 문장이 나온다', () => {
    /*
     * 조용히 넘기면 "이번 주는 아무도 안 왔다" 와 "다이제스트가 고장 났다" 가
     * 구분되지 않습니다. 매주 오는 것이 계약이고, 그래야 **안 온 주가 신호**
     * 가 됩니다.
     */
    const empty: DigestStats = {
      ...STATS,
      notify: { fresh: 0, left: 0, active: 0 },
      panel: { fresh: 0, total: 0, byActivity: [] },
    };
    const text = composeDigest(empty, null);
    expect(text.length, '0건인 주에 아무것도 만들지 않았습니다').toBeGreaterThan(0);
    expect(text).toContain('신규 0');
  });

  test('숫자를 지어내지 않고 그대로 싣는다', () => {
    const text = composeDigest(STATS, 'https://avoralabs.co/admin');
    expect(text).toContain('신규 12');
    expect(text).toContain('해지 1');
    expect(text).toContain('수신 중 143');
    expect(text).toContain('누적 28');
    expect(text).toContain('https://avoralabs.co/admin');
  });

  test('종목은 많은 순으로 나온다', () => {
    /*
     * 10월 선정에서 종목별 인원을 맞춰야 하는데, 어느 종목이 모자란지는
     * 누적이 아니라 분포를 봐야 압니다. 순서가 흐트러지면 읽는 값이 줄어듭니다.
     */
    const text = composeDigest(STATS, null);
    const line = text.split('\n').find((l) => l.includes('running'));
    expect(line, '종목 줄이 없습니다').toBeTruthy();
    expect(line!.indexOf('running')).toBeLessThan(line!.indexOf('hiking'));
    expect(line!.indexOf('hiking')).toBeLessThan(line!.indexOf('golf'));
  });

  test('지원이 없으면 빈 종목 줄을 만들지 않는다', () => {
    const text = composeDigest({ ...STATS, panel: { fresh: 0, total: 0, byActivity: [] } }, null);
    expect(text.split('\n').some((l) => l.trim() === ''), '빈 줄이 들어갔습니다').toBe(false);
  });

  test('날짜는 한국 시간으로 적는다', () => {
    /*
     * 보는 사람이 서울에 있습니다. UTC 로 적으면 월요일 아침에 온 알림이
     * 일요일 구간을 말하게 됩니다.
     */
    const text = composeDigest(
      { ...STATS, to: new Date('2026-08-31T15:30:00Z') }, // = 9월 1일 00:30 KST
      null,
    );
    expect(text, `UTC 로 적혀 있습니다: ${text.split('\n')[0]}`).toContain('9.1');
  });

  test('행을 실제로 세어 온다', async () => {
    const stats = await collect(
      fakeDb({
        'FROM launch_notify WHERE created_at': 12,
        'FROM launch_notify WHERE unsubscribed_at >=': 1,
        'FROM launch_notify WHERE unsubscribed_at IS NULL': 143,
        'FROM panel_applications WHERE created_at': 5,
        'FROM panel_applications WHERE unsubscribed_at IS NULL': 28,
        "WHERE activity = ? AND unsubscribed_at IS NULL": 7,
      }),
      new Date('2026-08-31T00:00:00Z'),
    );
    expect(stats.notify.fresh).toBe(12);
    expect(stats.notify.active).toBe(143);
    expect(stats.panel.total).toBe(28);
    // 이레 전부터 셉니다.
    expect(stats.to.getTime() - stats.from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('웹훅이 없으면 아무 데도 보내지 않는다', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response('ok');
    }) as typeof fetch;
    try {
      await runWeeklyDigest({ DB: fakeDb({}) }, null, new Date());
      expect(calls, `설정되지 않았는데 나간 요청: ${calls.join(', ')}`).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('웹훅이 있으면 그 채널로 보낸다', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) });
      return new Response('ok', { status: 200 });
    }) as typeof fetch;
    try {
      await runWeeklyDigest(
        { DB: fakeDb({ 'FROM launch_notify WHERE created_at': 9 }), NOTIFY_WEBHOOK_URL: 'https://hooks.slack.com/services/T/B/X' },
        'https://avoralabs.co/admin',
        new Date(),
      );
      expect(calls, '웹훅이 설정됐는데 나가지 않았습니다').toHaveLength(1);
      expect(calls[0].url).toContain('hooks.slack.com');
      // Slack 은 text, Discord 는 content 를 씁니다.
      expect(String((calls[0].body as { text: string }).text)).toContain('신규 9');
    } finally {
      globalThis.fetch = original;
    }
  });
});
