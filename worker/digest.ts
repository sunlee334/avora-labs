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
  /**
   * 사람이 봐야 하는 주문 — 승인을 시도했는데 결과가 확정되지 않은 것.
   *
   * ── 왜 세는가 ─────────────────────────────────────────────
   * 결과를 단정할 수 없는 승인 실패는 주문을 `pending` 으로 두고
   * `notePaymentAttempt` 가 표식을 남깁니다. 그 행은 `sweepAbandoned` 에서
   * **영구 면제** 됩니다 — 돈이 나갔을 수도 있어 자동으로 닫을 수 없기
   * 때문입니다.
   *
   * 그런데 그렇게 두기만 하면 **아무도 보지 않습니다.** 알릴 통로가 Sentry
   * 하나뿐이고, 그것도 `SENTRY_DSN` 이 있고 운영 호스트일 때만 나갑니다.
   * "정리가 진짜 봐야 할 것을 묻지 않게 한다" 는 취지가 절반만 이뤄집니다.
   *
   * 그래서 주간 알림에 한 줄로 싣습니다. 0이면 줄이 나오지 않습니다.
   */
  orders: { needsReview: number };
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
    orders: {
      needsReview: await count(
        db,
        `SELECT COUNT(*) AS n FROM orders
           WHERE status = 'pending' AND payment_key IS NOT NULL`,
      ),
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
  /*
   * 0이면 적지 않습니다 — 매주 "0건" 을 보면 그 줄을 읽지 않게 됩니다.
   * 숫자가 있을 때만 나타나야 눈에 걸립니다.
   */
  if (s.orders.needsReview > 0) {
    lines.push(`⚠️ 확인 필요  결제 결과가 확정되지 않은 주문 ${s.orders.needsReview}건`);
  }
  if (adminUrl) lines.push(adminUrl);
  return lines.join('\n');
}

/**
 * 버려진 결제 시도를 정리합니다.
 *
 * ── 왜 쌓이는가 ─────────────────────────────────────────────
 * 체크아웃은 결제 요청 **전에** 주문을 만듭니다 — 그래야 승인 단계에서
 * 브라우저가 보낸 금액이 아니라 서버가 기억하는 금액을 쓸 수 있습니다.
 * 그런데 손님이 결제수단 화면에서 그만두면 그 행은 `pending` 으로 남고,
 * 다시 결제하면 **새 주문번호로 새 행** 이 생깁니다(토스는 주문번호를
 * 재사용하지 못하게 합니다 — 재사용하면 이미 처리된 결제로 샙니다).
 *
 * 그래서 버려진 `pending` 이 계속 쌓입니다. 관리 화면의 "결제 대기" 가
 * 실제로 기다리는 주문과 그냥 버려진 것으로 섞이면, **진짜 봐야 할 것이
 * 묻힙니다.**
 *
 * ── 왜 하루인가 ─────────────────────────────────────────────
 * 토스의 결제 인증 유효시간은 10분입니다. 하루가 지난 `pending` 은 승인이
 * 올 수 있는 상태가 아닙니다. 그래도 넉넉히 둡니다 — 짧게 잡아 살아 있는
 * 주문을 닫는 것이 반대보다 훨씬 나쁩니다.
 *
 * `failed` 로 옮깁니다. `cancelled` 는 사람이 취소한 것을 위해 남겨 둡니다 —
 * 아직 그 경로가 없지만(취소·환불은 미구현), 자동 정리가 그 자리를 먼저
 * 차지하면 나중에 둘을 구분할 수 없습니다.
 */
export async function sweepAbandoned(db: D1Database, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const result = await db
    .prepare(
      /*
       * ⚠️ `payment_key IS NULL` 이 이 쿼리에서 가장 중요한 조건입니다.
       *
       * 결과를 단정할 수 없는 승인 실패는 주문을 **일부러** `pending` 으로
       * 둡니다(돈이 나갔는데 장부가 실패로 닫히는 것을 피하려고). 그 행에는
       * `notePaymentAttempt` 가 승인 시도 표식을 남깁니다.
       *
       * 이 조건이 없으면 정리가 **그 행까지 `failed` 로 닫습니다** — 승인
       * 핸들러가 막으려던 바로 그 상태를 정리 작업이 만듭니다. 게다가 그
       * 뒤에는 완료 화면이 409 `ORDER_NOT_PAYABLE` 을 받아 되살릴 길도
       * 없습니다.
       */
      `UPDATE orders SET status = 'failed', updated_at = ?
         WHERE status = 'pending' AND payment_key IS NULL AND created_at < ?`,
    )
    .bind(now.toISOString(), cutoff)
    .run();
  return result.meta?.changes ?? 0;
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
  if (!env.DB) return;

  /*
   * 정리는 **웹훅 설정보다 위에** 있습니다.
   *
   * 전에는 아래 `webhookConfigured` 게이트 뒤에 있었습니다. 그러면
   * `NOTIFY_WEBHOOK_URL` 이 비었거나 오타나면 다이제스트뿐 아니라 **주문
   * 정리까지 영영 안 돌았습니다** — 주석은 "둘은 서로 다른 일" 이라고
   * 적어 놓고 게이트는 묶여 있었습니다.
   *
   * try 도 따로 감쌉니다. 정리가 실패했다고 그 주 알림이 통째로 안 나가면,
   * "명단이 조용하다" 와 "정리가 깨졌다" 를 구분할 수 없습니다.
   */
  let swept = 0;
  try {
    swept = await sweepAbandoned(env.DB, now);
    if (swept > 0) console.log('버려진 결제 시도 정리', { swept });
  } catch (cause) {
    reportError(env, ctx, cause, undefined, { tags: { job: 'sweep-abandoned' } });
  }

  if (!webhookConfigured(webhookEnv)) return;

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
