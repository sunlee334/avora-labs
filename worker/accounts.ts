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
export interface Identity {
  provider: string;
  providerUserId: string;
  email: string | null;
  createdAt: string;
}

function rowToIdentity(row: Record<string, unknown>): Identity {
  return {
    provider: row.provider as string,
    providerUserId: row.provider_user_id as string,
    email: (row.email as string) ?? null,
    createdAt: row.created_at as string,
  };
}

/**
 * 이 로그인 수단으로 처음이면 사람을 만들고, 있으면 그 사람을 가져옵니다.
 *
 * 식별자는 (provider, providerUserId) 입니다. 이메일이 아닙니다 — 이메일은
 * 없을 수도 있고 바뀔 수도 있으며, 제공자가 소유를 검증했다는 보장도 없습니다.
 */
export async function findOrCreateUser(
  db: D1Database,
  provider: string,
  profile: { providerUserId: string; email?: string; name?: string },
  now: string,
): Promise<User> {
  const identity = await db
    .prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_user_id = ?')
    .bind(provider, profile.providerUserId)
    .first<{ user_id: string }>();

  if (identity) {
    // 제공자 쪽에서 이름·이메일이 바뀌었을 수 있으니 갱신합니다.
    await db
      .prepare('UPDATE users SET email = ?, name = ?, updated_at = ? WHERE id = ?')
      .bind(profile.email ?? null, profile.name ?? null, now, identity.user_id)
      .run();
    await db
      .prepare('UPDATE identities SET email = ? WHERE provider = ? AND provider_user_id = ?')
      .bind(profile.email ?? null, provider, profile.providerUserId)
      .run();
    const refreshed = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(identity.user_id)
      .first();
    return rowToUser(refreshed as Record<string, unknown>);
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO users (id, email, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, profile.email ?? null, profile.name ?? null, now, now)
    .run();
  await db
    .prepare(
      `INSERT INTO identities (provider, provider_user_id, user_id, email, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(provider, profile.providerUserId, id, profile.email ?? null, now)
    .run();

  const created = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return rowToUser(created as Record<string, unknown>);
}

/** 이 사람에게 붙어 있는 로그인 수단들. */
export async function identitiesForUser(db: D1Database, userId: string): Promise<Identity[]> {
  const { results } = await db
    .prepare('SELECT * FROM identities WHERE user_id = ? ORDER BY created_at ASC')
    .bind(userId)
    .all<Record<string, unknown>>();
  return (results ?? []).map(rowToIdentity);
}

export type LinkResult =
  | { ok: true }
  | { ok: false; reason: 'ALREADY_LINKED' }
  | { ok: false; reason: 'TAKEN' };

/**
 * 로그인한 사람에게 다른 로그인 수단을 붙입니다.
 *
 * 이미 **다른 사람**에게 붙어 있으면 거절합니다. 조용히 옮기면 원래 계정의
 * 주문 내역이 사라지고, 그 계정으로는 다시 들어갈 수 없게 됩니다.
 */
export async function linkIdentity(
  db: D1Database,
  userId: string,
  provider: string,
  profile: { providerUserId: string; email?: string },
  now: string,
): Promise<LinkResult> {
  const existing = await db
    .prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_user_id = ?')
    .bind(provider, profile.providerUserId)
    .first<{ user_id: string }>();

  if (existing) {
    return existing.user_id === userId
      ? { ok: false, reason: 'ALREADY_LINKED' }
      : { ok: false, reason: 'TAKEN' };
  }

  await db
    .prepare(
      `INSERT INTO identities (provider, provider_user_id, user_id, email, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(provider, profile.providerUserId, userId, profile.email ?? null, now)
    .run();
  return { ok: true };
}

export type UnlinkResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'LAST_IDENTITY' };

/**
 * 로그인 수단을 뗍니다.
 *
 * **마지막 하나는 뗄 수 없습니다.** 떼는 순간 그 계정에 들어갈 방법이
 * 사라지고, 주문 내역과 배송지가 아무도 닿을 수 없는 곳에 남습니다.
 */
export async function unlinkIdentity(
  db: D1Database,
  userId: string,
  provider: string,
): Promise<UnlinkResult> {
  const mine = await identitiesForUser(db, userId);
  if (!mine.some((identity) => identity.provider === provider)) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  if (mine.length <= 1) return { ok: false, reason: 'LAST_IDENTITY' };

  await db
    .prepare('DELETE FROM identities WHERE user_id = ? AND provider = ?')
    .bind(userId, provider)
    .run();
  return { ok: true };
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
/**
 * 제공자 쪽에서 연결이 끊겼을 때 그 로그인 수단을 지웁니다.
 *
 * 사용자가 카카오 앱 목록에서 우리 앱을 지우거나 카카오계정을 탈퇴하면
 * 우리는 그 사실을 알 방법이 없습니다. 그대로 두면 **탈퇴한 사람의 이메일·
 * 이름·배송지가 계속 남습니다.** 개인정보처리방침에 적은 것과 어긋납니다.
 *
 * ── 주문은 지우지 않습니다 ──────────────────────────────────
 * 전자상거래법은 계약·청약철회 기록과 대금결제 기록을 5년간 보존하도록
 * 합니다. 그래서 주문 자체는 남기고, 계정과의 연결만 끊습니다(user_id 를
 * 비웁니다). 남은 주문은 비회원 주문과 같은 상태가 되고, 주문번호와
 * 연락처로는 여전히 조회됩니다.
 */
export interface RemoveIdentityResult {
  found: boolean;
  /** 마지막 수단이어서 계정까지 정리했는가 */
  userRemoved: boolean;
  /** 계정과의 연결이 끊긴 주문 수 */
  ordersDetached: number;
}

export async function removeIdentity(
  db: D1Database,
  provider: string,
  providerUserId: string,
): Promise<RemoveIdentityResult> {
  const identity = await db
    .prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_user_id = ?')
    .bind(provider, providerUserId)
    .first<{ user_id: string }>();

  // 이미 지워졌거나 우리 쪽에 없는 사람입니다. 카카오는 같은 이벤트를 다시
  // 보낼 수 있으므로, 없다고 해서 오류로 답하지 않습니다.
  if (!identity) return { found: false, userRemoved: false, ordersDetached: 0 };

  await db
    .prepare('DELETE FROM identities WHERE provider = ? AND provider_user_id = ?')
    .bind(provider, providerUserId)
    .run();

  const remaining = await identitiesForUser(db, identity.user_id);
  if (remaining.length > 0) {
    return { found: true, userRemoved: false, ordersDetached: 0 };
  }

  // 남은 로그인 수단이 없습니다 — 이 계정에는 아무도 들어올 수 없으므로
  // 개인정보(이메일·이름·저장된 배송지)를 남길 이유가 없습니다.
  const detached = await db
    .prepare('UPDATE orders SET user_id = NULL WHERE user_id = ?')
    .bind(identity.user_id)
    .run();

  // 세션은 users 를 ON DELETE CASCADE 로 참조하므로 함께 사라집니다.
  await db.prepare('DELETE FROM users WHERE id = ?').bind(identity.user_id).run();

  return {
    found: true,
    userRemoved: true,
    ordersDetached: detached.meta?.changes ?? 0,
  };
}

export function publicUser(user: User) {
  return {
    name: user.name,
    email: user.email,
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
