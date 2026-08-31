/**
 * 출시 알림 명단.
 *
 * 제품이 2027년 상반기에 나옵니다. 그때까지 이 페이지를 보고 관심이 생긴
 * 사람이 할 수 있는 일이 아무것도 없으면, 그 관심은 그냥 사라집니다.
 * 여기 모이는 명단은 펀딩 플랫폼이 아니라 우리 쪽에 남습니다.
 *
 * 표 구조와 "왜 이메일 하나만 받는가" 는 migrations/0007_launch_notify.sql
 * 에 적혀 있습니다.
 */

const ALPHABET = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789';

export type SignupResult = 'ok' | 'already' | 'revived';

/**
 * 고를 수 있는 활동. **이 배열이 정의처입니다.**
 *
 * 화면의 문구는 언어마다 다르지만 저장되는 값은 여기 슬러그 하나로 통일합니다 —
 * 태국어 화면에서 신청한 사람과 한국어 화면에서 신청한 사람을 같은 조건으로
 * 뽑을 수 있어야 검증단 모집이 성립합니다.
 *
 * 목록에 없는 값은 조용히 버립니다. 이 열은 우리가 명단을 추리는 데만 쓰므로,
 * 손님이 보낸 임의의 문자열을 그대로 담아 둘 이유가 없습니다.
 */
export const ACTIVITIES = [
  'running',
  'hiking',
  'golf',
  'water',
  'gym',
  'other',
] as const;
export type Activity = (typeof ACTIVITIES)[number];

export interface NotifySignup {
  email: string;
  locale: string;
  source: string | null;
  activities: string | null;
  /**
   * 야간(21시~익일 8시) 수신 동의 여부.
   *
   * 「정보통신망법」 제50조 3항은 그 시간대 광고성 정보에 **별도 동의** 를
   * 요구합니다. 일반 광고 동의로는 보낼 수 없습니다.
   */
  night: boolean;
}

/**
 * 활동 선택을 저장 형태로 바꿉니다.
 *
 * 받는 것: 슬러그 배열. 돌려주는 것: 쉼표로 이은 문자열, 또는 아무것도 고르지
 * 않았으면 null.
 *
 * 순서를 ACTIVITIES 순으로 다시 세웁니다 — 화면에서 누른 순서대로 담으면
 * 같은 조합이 'gym,running' 과 'running,gym' 두 형태로 저장되어, 나중에
 * 눈으로 훑을 때 같은 것이 달라 보입니다.
 */
export function normalizeActivities(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const picked = new Set(
    raw.filter((v): v is Activity => ACTIVITIES.includes(v as Activity)),
  );
  if (picked.size === 0) return null;
  return ACTIVITIES.filter((a) => picked.has(a)).join(',');
}

function newId(now: Date, prefix: string): string {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  let suffix = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(6))) {
    suffix += ALPHABET[byte % ALPHABET.length];
  }
  return `${prefix}-${stamp}-${suffix}`;
}

/**
 * 이메일 정규화.
 *
 * 소문자로 내리고 앞뒤 공백을 텁니다. `A@x.com` 과 `a@x.com` 을 다른 행으로
 * 두면 같은 사람에게 두 번 보냅니다. 도메인만 소문자로 내리는 구현도 있지만
 * (로컬 파트는 원칙적으로 대소문자를 구분합니다), 실제로 구분하는 메일
 * 서비스는 거의 없고 여기서는 중복 발송을 막는 쪽이 더 중요합니다.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 5 || email.length > 254) return null;
  // 완전한 RFC 검증은 하지 않습니다 — 그 정규식은 아무도 못 읽고, 통과해도
  // 존재하는 주소라는 뜻은 아닙니다. 실제 확인은 메일이 도착하는지로 합니다.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return null;
  return email;
}

/**
 * 명단에 올립니다.
 *
 * 같은 주소가 다시 신청하면 오류가 아닙니다 — 신청한 사람 입장에서는 성공한
 * 것이고, "이미 신청하셨습니다" 는 그 주소가 명단에 있다는 사실을 아무에게나
 * 알려 주는 것이기도 합니다. 그래서 화면에는 같은 문구를 보여주고, 구분은
 * 반환값으로만 남깁니다.
 *
 * 예전에 해지한 주소가 다시 신청하면 되살립니다. 본인이 다시 원한 것이므로
 * 막을 이유가 없습니다.
 */
export async function signup(
  db: D1Database,
  { email, locale, source, activities, night }: NotifySignup,
  now: Date,
): Promise<SignupResult> {
  const iso = now.toISOString();

  const revived = await db
    .prepare(
      `UPDATE launch_notify
          SET unsubscribed_at = NULL, consented_at = ?, locale = ?, source = ?,
              activities = COALESCE(?, activities), night_at = ?
        WHERE email = ? AND unsubscribed_at IS NOT NULL`,
    )
    .bind(iso, locale, source, activities, night ? iso : null, email)
    .run();
  if ((revived.meta?.changes ?? 0) > 0) return 'revived';

  const inserted = await db
    .prepare(
      `INSERT INTO launch_notify
         (id, email, locale, source, activities, created_at, consented_at,
          unsubscribe_token, night_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(
      newId(now, 'NOTIFY'),
      email,
      locale,
      source,
      activities,
      iso,
      iso,
      newId(now, 'UNSUB'),
      night ? iso : null,
    )
    .run();

  if ((inserted.meta?.changes ?? 0) > 0) return 'ok';

  /*
   * 이미 명단에 있는 사람이 다시 신청했습니다.
   *
   * 이 경우에도 **활동은 갱신합니다.** 처음 신청할 때는 이메일만 남기고 갔다가,
   * 10월 검증단 모집 소식을 보고 돌아와 러닝을 고르는 흐름이 그대로 이
   * 기능의 목적입니다. 그런데 위 INSERT 는 DO NOTHING 이라 그 사람의 두 번째
   * 제출은 아무 일도 일으키지 않았고, 화면에는 "신청되었습니다" 가 떴습니다.
   * 조용히 버려지는 쪽이 최악입니다.
   *
   * 안 골랐으면(null) 손대지 않습니다 — 이메일만 다시 넣은 사람의 예전
   * 선택까지 지울 이유가 없습니다. 되살리는 경로의 COALESCE 와 같은 규칙입니다.
   *
   * 고른 경우에는 합치지 않고 **덮어씁니다.** 화면의 체크박스는 늘 빈 상태로
   * 보이므로, 보낸 것이 곧 지금 원하는 것입니다. 합치면 한 번 고른 활동을
   * 영영 뺄 수 없습니다.
   */
  if (activities !== null) {
    await db
      .prepare(`UPDATE launch_notify SET activities = ? WHERE email = ?`)
      .bind(activities, email)
      .run();
  }

  return 'already';
}

/** 수신 거부. 토큰으로만 받습니다 — 이메일 주소를 링크에 싣지 않기 위해서입니다. */
export async function unsubscribe(
  db: D1Database,
  token: string,
  now: Date,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE launch_notify SET unsubscribed_at = ?
        WHERE unsubscribe_token = ? AND unsubscribed_at IS NULL`,
    )
    .bind(now.toISOString(), token)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** 아직 받겠다고 한 사람 수. 관리 화면에서 펀딩 준비 상황을 볼 때 씁니다. */
export async function activeCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM launch_notify WHERE unsubscribed_at IS NULL`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export interface NotifyRow {
  id: string;
  email: string;
  locale: string;
  source: string | null;
  createdAt: string;
  consentedAt: string;
  unsubscribedAt: string | null;
  activities: string[];
}

/**
 * 관리 화면에 뿌릴 명단 한 쪽.
 *
 * 수신거부한 사람도 함께 돌려줍니다 — 명단에서 지우면 "몇 명이 나갔는가" 를
 * 볼 수 없고, 그 숫자가 문구를 고칠지 말지를 정합니다. 대신 화면이 구분해
 * 표시하고, 실제 발송은 unsubscribed_at 이 비어 있는 행만 씁니다.
 */
export async function listSignups(
  db: D1Database,
  options: { limit: number; offset: number; source?: string; active?: boolean },
): Promise<{ rows: NotifyRow[]; matched: number; total: number; active: number }> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (options.source) {
    where.push('source = ?');
    args.push(options.source);
  }
  if (options.active !== undefined) {
    where.push(options.active ? 'unsubscribed_at IS NULL' : 'unsubscribed_at IS NOT NULL');
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  /*
   * 세 숫자가 각각 다른 것을 셉니다. 하나로 뭉치면 화면이 거짓말을 합니다 —
   * 예전에는 필터를 건 목록 옆에 필터를 무시한 "수신 중" 이 나란히 놓여서
   * "수신 중 120 · 전체 5" 같은 문장이 나왔습니다.
   *   matched — 지금 조건에 맞는 수. 쪽 나누기가 쓰는 값입니다.
   *   total   — 조건과 무관한 명단 전체.
   *   active  — 그중 수신 거부하지 않은 사람.
   */
  const matchedRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM launch_notify ${clause}`)
    .bind(...args)
    .first<{ n: number }>();

  const totalRow = await db
    .prepare('SELECT COUNT(*) AS n FROM launch_notify')
    .first<{ n: number }>();

  const { results } = await db
    .prepare(
      `SELECT id, email, locale, source, activities, created_at, consented_at, unsubscribed_at
         FROM launch_notify ${clause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
    )
    .bind(...args, options.limit, options.offset)
    .all<Record<string, unknown>>();

  return {
    rows: (results ?? []).map((r) => ({
      id: String(r.id),
      email: String(r.email),
      locale: String(r.locale),
      source: r.source === null ? null : String(r.source),
      createdAt: String(r.created_at),
      consentedAt: String(r.consented_at),
      unsubscribedAt: r.unsubscribed_at === null ? null : String(r.unsubscribed_at),
      // 빈 문자열로 split 하면 [''] 이 나와 "하나 골랐다" 처럼 보입니다.
      activities: r.activities ? String(r.activities).split(',') : [],
    })),
    matched: matchedRow?.n ?? 0,
    total: totalRow?.n ?? 0,
    active: await activeCount(db),
  };
}

/**
 * 어느 화면이 명단을 만들고 있는가.
 *
 * 홈 첫 화면·홈 끝·제품 페이지 중 어디가 실제로 도는지 모르면 다음에 무엇을
 * 고칠지 고를 수 없습니다. 그래서 목록과 별개로 이 집계를 함께 냅니다.
 */
export async function signupsBySource(
  db: D1Database,
): Promise<Array<{ source: string | null; n: number }>> {
  /*
   * LIMIT 이 반드시 있어야 합니다. source 는 손님이 보내는 값이고 32자까지
   * 무엇이든 됩니다 — 신청마다 다른 값을 넣으면 묶음 수가 행 수만큼 늘어나고,
   * 그러면 이 배열이 목록을 부를 때마다 통째로 따라 나옵니다. 화면도 요약
   * 타일을 그 수만큼 그립니다. 우리가 심어 둔 자리는 셋뿐이라 20이면 넉넉하고,
   * 넘치는 꼬리는 어차피 볼 값이 아닙니다.
   */
  const { results } = await db
    .prepare(
      `SELECT source, COUNT(*) AS n
         FROM launch_notify
        WHERE unsubscribed_at IS NULL
        GROUP BY source
        ORDER BY n DESC
        LIMIT 20`,
    )
    .all<Record<string, unknown>>();

  return (results ?? []).map((r) => ({
    source: r.source === null ? null : String(r.source),
    n: Number(r.n),
  }));
}
