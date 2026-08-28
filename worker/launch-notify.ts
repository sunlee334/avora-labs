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

export interface NotifySignup {
  email: string;
  locale: string;
  source: string | null;
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
  { email, locale, source }: NotifySignup,
  now: Date,
): Promise<SignupResult> {
  const iso = now.toISOString();

  const revived = await db
    .prepare(
      `UPDATE launch_notify
          SET unsubscribed_at = NULL, consented_at = ?, locale = ?, source = ?
        WHERE email = ? AND unsubscribed_at IS NOT NULL`,
    )
    .bind(iso, locale, source, email)
    .run();
  if ((revived.meta?.changes ?? 0) > 0) return 'revived';

  const inserted = await db
    .prepare(
      `INSERT INTO launch_notify
         (id, email, locale, source, created_at, consented_at, unsubscribe_token)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(
      newId(now, 'NOTIFY'),
      email,
      locale,
      source,
      iso,
      iso,
      newId(now, 'UNSUB'),
    )
    .run();

  return (inserted.meta?.changes ?? 0) > 0 ? 'ok' : 'already';
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
