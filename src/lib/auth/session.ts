import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/db/client";
import { sessions, users, type User } from "@/db/schema";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/config";

export type SessionUser = Pick<
  User,
  | "id"
  | "email"
  | "name"
  | "phone"
  | "role"
  | "marketingEmailOptIn"
  | "marketingSmsOptIn"
  | "createdAt"
  | "passwordResetRequired"
>;

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
});

/** DB 에는 토큰의 해시만 둔다. 원문은 쿠키에만 있으므로 DB 가 읽혀도 세션을 재사용할 수 없다. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ token: hashToken(token), userId, expiresAt });
  // 만료 세션 정리는 cron(worker.ts → purgeExpiredSessions)이 맡는다. 로그인 경로에서 테이블을 훑지 않는다.
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...cookieOptions(), expires: expiresAt });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/** 해당 회원의 모든 세션을 지운다 (모든 기기에서 로그아웃, 비밀번호 변경·유출 대응). 지운 세션 수를 돌려준다. */
export async function destroyAllSessions(userId: number): Promise<number> {
  const rows = await db.delete(sessions).where(eq(sessions.userId, userId)).returning({ token: sessions.token });
  return rows.length;
}

/** 요청당 1회만 DB를 조회한다 (React cache). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
      marketingEmailOptIn: users.marketingEmailOptIn,
      marketingSmsOptIn: users.marketingSmsOptIn,
      passwordResetRequired: users.passwordResetRequired,
      createdAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .get();
  return row ?? null;
});
