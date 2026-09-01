/**
 * 주간 현황 다이제스트 — 매주 월요일 아침에 한 번.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────
 * 명단은 D1 에 쌓이고 관리 화면에서 볼 수 있지만, **보러 가야** 보입니다.
 * 출시까지 남은 기간 동안 이 사이트가 하는 일은 사실상 명단을 모으는 것
 * 하나인데, 그 숫자를 아무도 안 보는 주가 이어지면 신청이 멈춘 것도
 * 모릅니다. 알림은 보러 가지 않아도 옵니다.
 *
 * ── 왜 0건인 주에도 보내는가 ────────────────────────────────
 * 신규가 없을 때 조용히 넘기면 **"이번 주는 아무도 안 왔다" 와 "다이제스트가
 * 고장 났다" 가 구분되지 않습니다.** 매주 오는 것이 계약이고, 그래야 안 온
 * 주가 신호가 됩니다.
 *
 * ── 왜 새 웹훅을 만들지 않는가 ──────────────────────────────
 * `NOTIFY_WEBHOOK_URL` 을 그대로 씁니다. 채널을 나누면 비밀값이 하나 늘고,
 * 늘어난 만큼 "켜는 것을 잊는" 경우가 생깁니다. 지금 이 알림을 볼 사람은
 * 주문 알림을 볼 사람과 같습니다. 나뉘어야 할 이유가 생기면 그때 나눕니다.
 */
import { postWebhook, webhookConfigured } from './notify/webhook';
import { ACTIVITIES } from './launch-notify';
import { reportError, type SentryEnv } from './sentry';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface DigestEnv extends SentryEnv {
  DB?: D1Database;
  NOTIFY_WEBHOOK_URL?: string;
}

export interface DigestStats {
  from: Date;
  to: Date;
  notify: { fresh: number; left: number; active: number };
  panel: { fresh: number; total: number; byActivity: Array<{ activity: string; n: number }> };
}

/** 한국 시간 기준 날짜. 보는 사람이 서울에 있습니다. */
function day(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}.${kst.getUTCDate()}`;
}

async function count(db: D1Database, sql: string, ...args: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...args).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * 지난 이레의 숫자를 읽습니다.
 *
 * **지어내는 값이 없습니다.** 전부 실제 행을 셉니다. 화면의 신청자 수 카운터
 * (`/api/launch-notify/count`)와 같은 규칙입니다.
 */
export async function collect(db: D1Database, now: Date): Promise<DigestStats> {
  const from = new Date(now.getTime() - WEEK_MS);
  const since = from.toISOString();

  const byActivity: Array<{ activity: string; n: number }> = [];
  for (const activity of ACTIVITIES) {
    const n = await count(
      db,
      'SELECT COUNT(*) AS n FROM panel_applications WHERE activity = ? AND unsubscribed_at IS NULL',
      activity,
    );
    if (n > 0) byActivity.push({ activity, n });
  }
  byActivity.sort((a, b) => b.n - a.n);

  return {
    from,
    to: now,
    notify: {
      fresh: await count(db, 'SELECT COUNT(*) AS n FROM launch_notify WHERE created_at >= ?', since),
      left: await count(
        db,
        'SELECT COUNT(*) AS n FROM launch_notify WHERE unsubscribed_at >= ?',
        since,
      ),
      active: await count(
        db,
        'SELECT COUNT(*) AS n FROM launch_notify WHERE unsubscribed_at IS NULL',
      ),
    },
    panel: {
      fresh: await count(
        db,
        'SELECT COUNT(*) AS n FROM panel_applications WHERE created_at >= ?',
        since,
      ),
      total: await count(
        db,
        'SELECT COUNT(*) AS n FROM panel_applications WHERE unsubscribed_at IS NULL',
      ),
      byActivity,
    },
  };
}

/**
 * 사람이 읽을 한 덩어리로 만듭니다.
 *
 * 종목 분포를 넣는 이유: 10월 검증단 선정에서 종목별로 인원을 맞춰야 하는데,
 * 어느 종목이 모자란지는 누적이 아니라 **분포** 를 봐야 압니다.
 */
export function composeDigest(s: DigestStats, adminUrl: string | null): string {
  const spread = s.panel.byActivity.map((a) => `${a.activity} ${a.n}`).join(' · ');

  const lines = [
    `📋 주간 현황 (${day(s.from)}–${day(s.to)})`,
    `출시 알림  신규 ${s.notify.fresh} · 해지 ${s.notify.left} · 수신 중 ${s.notify.active}`,
    `검증단     신규 ${s.panel.fresh} · 누적 ${s.panel.total}`,
  ];
  // 지원이 하나도 없으면 빈 줄을 넣지 않습니다.
  if (spread) lines.push(`           ${spread}`);
  if (adminUrl) lines.push(adminUrl);
  return lines.join('\n');
}

/**
 * 크론이 부르는 자리.
 *
 * **절대 throw 하지 않습니다.** 크론이 실패로 끝나면 Cloudflare 가 재시도하고,
 * 웹훅이 죽어 있는 동안 같은 알림이 여러 번 갑니다. 실패는 Sentry 로 남기고
 * 조용히 끝냅니다 — 다음 주에 다시 옵니다.
 */
export async function runWeeklyDigest(
  env: DigestEnv,
  adminUrl: string | null,
  now: Date,
  ctx?: { waitUntil(p: Promise<unknown>): void },
): Promise<void> {
  // 웹훅 모듈은 워커 전체 env 를 그대로 받도록 만들어져 있습니다
  // (worker/index.ts 의 notifyNewOrder 호출과 같은 형태입니다).
  const webhookEnv = env as unknown as Record<string, unknown>;
  if (!env.DB || !webhookConfigured(webhookEnv)) return;

  try {
    const stats = await collect(env.DB, now);
    const text = composeDigest(stats, adminUrl);
    const result = await postWebhook(() => text, webhookEnv);
    if (!result.ok) throw new Error(`웹훅 실패: ${result.error}`);
  } catch (cause) {
    // ctx 없이 부르면 보고 fetch 가 아무 곳에도 매달리지 않아, 크론이
    // 끝나는 순간 취소됩니다 — 실패했다는 사실만 조용히 사라집니다.
    reportError(env, ctx, cause, undefined, { tags: { job: 'weekly-digest' } });
  }
}
