/**
 * 회원 계정과 세션.
 *
 * 세션 설계:
 *   쿠키에는 원본 토큰을, DB 에는 그 SHA-256 해시를 둡니다. DB 를 읽을 수
 *   있게 된 사람이 남의 세션을 그대로 쓰지 못하게 하기 위해서입니다.
 *   서명된 쿠키만 쓰면 DB 조회가 없어 빠르지만 로그아웃과 강제 만료를 할 수
 *   없습니다. 배송지가 들어 있는 계정이라 취소할 수 있어야 합니다.
 */
import { normalizePhone, rowToOrder, type OrderRecord } from './orders';

/** 세션 유지 기간. 쇼핑몰 계정이라 너무 길면 공용 PC 에서 위험합니다. */
export const SESSION_DAYS = 30;

export const SESSION_COOKIE = 'avora_session';

export interface User {
  id: string;
  provider: string;
  providerUserId: string;
  email: string | null;
  name: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  postalCode: string | null;
  address1: string | null;
  address2: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedAddress {
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  address1: string;
  address2?: string;
}

/** 추측할 수 없는 세션 토큰. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    provider: row.provider as string,
    providerUserId: row.provider_user_id as string,
    email: (row.email as string) ?? null,
    name: (row.name as string) ?? null,
    recipientName: (row.recipient_name as string) ?? null,
    recipientPhone: (row.recipient_phone as string) ?? null,
    postalCode: (row.postal_code as string) ?? null,
    address1: (row.address1 as string) ?? null,
    address2: (row.address2 as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * 이 제공자 계정으로 처음이면 만들고, 있으면 가져옵니다.
 *
 * 식별자는 (provider, providerUserId) 입니다. 이메일이 아닙니다 —
 * 카카오는 이메일을 주지 않을 수 있고, 이메일은 바뀌기도 합니다.
 */
export async function findOrCreateUser(
  db: D1Database,
  provider: string,
  profile: { providerUserId: string; email?: string; name?: string },
  now: string,
): Promise<User> {
  const existing = await db
    .prepare('SELECT * FROM users WHERE provider = ? AND provider_user_id = ?')
    .bind(provider, profile.providerUserId)
    .first();

  if (existing) {
    // 제공자 쪽에서 이름·이메일이 바뀌었을 수 있으니 갱신합니다.
    await db
      .prepare('UPDATE users SET email = ?, name = ?, updated_at = ? WHERE id = ?')
      .bind(profile.email ?? null, profile.name ?? null, now, (existing as { id: string }).id)
      .run();
    const refreshed = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind((existing as { id: string }).id)
      .first();
    return rowToUser(refreshed as Record<string, unknown>);
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO users (id, provider, provider_user_id, email, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, provider, profile.providerUserId, profile.email ?? null, profile.name ?? null, now, now)
    .run();

  const created = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return rowToUser(created as Record<string, unknown>);
}

export async function createSession(
  db: D1Database,
  userId: string,
  now: Date,
): Promise<string> {
  const token = newToken();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db
    .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await hashToken(token), userId, now.toISOString(), expires.toISOString())
    .run();
  return token;
}

/** 쿠키의 토큰으로 사용자를 찾습니다. 만료됐으면 null. */
export async function userFromToken(
  db: D1Database,
  token: string,
  now: string,
): Promise<User | null> {
  const row = await db
    .prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    )
    .bind(await hashToken(token), now)
    .first();
  return row ? rowToUser(row as Record<string, unknown>) : null;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
}

/** 만료된 세션을 치웁니다. 쌓아둘 이유가 없습니다. */
export async function purgeExpiredSessions(db: D1Database, now: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
}

/** 다음 주문에서 다시 입력하지 않도록 배송지를 기억합니다. */
export async function saveAddress(
  db: D1Database,
  userId: string,
  address: SavedAddress,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET recipient_name = ?, recipient_phone = ?, postal_code = ?,
       address1 = ?, address2 = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(
      address.recipientName,
      normalizePhone(address.recipientPhone),
      address.postalCode,
      address.address1,
      address.address2 ?? null,
      now,
      userId,
    )
    .run();
}

/** 이 계정에 연결된 주문. 최신순. */
export async function ordersForUser(
  db: D1Database,
  userId: string,
  limit = 20,
): Promise<OrderRecord[]> {
  const rows = await db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(userId, limit)
    .all();
  return (rows.results ?? []).map((row) => rowToOrder(row as Record<string, unknown>));
}

/**
 * 로그인 전에 넣은 주문을 계정에 가져옵니다.
 *
 * 연락처가 같다고 자동으로 잇지 않습니다. 번호는 재사용되고 오타도 나므로,
 * 남의 주문이 남의 계정에 붙을 수 있습니다. 주문번호와 연락처를 **둘 다**
 * 아는 사람만 가져올 수 있게 합니다 — 주문 조회와 같은 조건입니다.
 */
export async function claimOrder(
  db: D1Database,
  userId: string,
  orderId: string,
  phone: string,
  now: string,
): Promise<'claimed' | 'not_found' | 'already_claimed'> {
  const row = await db
    .prepare('SELECT user_id FROM orders WHERE id = ? AND recipient_phone = ?')
    .bind(orderId, normalizePhone(phone))
    .first<{ user_id: string | null }>();

  if (!row) return 'not_found';
  if (row.user_id) return row.user_id === userId ? 'already_claimed' : 'not_found';

  await db
    .prepare('UPDATE orders SET user_id = ?, updated_at = ? WHERE id = ? AND user_id IS NULL')
    .bind(userId, now, orderId)
    .run();
  return 'claimed';
}

/** 화면에 내보낼 계정 정보. 제공자 쪽 id 는 밖으로 내보내지 않습니다. */
export function publicUser(user: User) {
  return {
    name: user.name,
    email: user.email,
    provider: user.provider,
    address:
      user.address1 && user.recipientName
        ? {
            recipientName: user.recipientName,
            recipientPhone: user.recipientPhone,
            postalCode: user.postalCode,
            address1: user.address1,
            address2: user.address2,
          }
        : null,
    createdAt: user.createdAt,
  };
}
