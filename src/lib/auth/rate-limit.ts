import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";

/**
 * 고정 윈도우 레이트리밋. 카운터를 DB(rate_limits) 에 두어 Workers 의 isolate 간에도 공유된다.
 * 단일 UPSERT 문으로 원자적으로 증가시키므로 libsql·D1 모두에서 경쟁 조건 없이 동작한다.
 */
export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export async function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
  now = Date.now(),
): Promise<RateLimitResult> {
  try {
    return await rateLimitInDb(key, { limit, windowMs }, now);
  } catch (error) {
    // 카운터 저장소 장애가 로그인·결제 자체를 막지 않도록 fail-open 하고 로그만 남긴다.
    console.warn(`[rate-limit] store unavailable, allowing request key=${key.split(":")[0]}`, error);
    return { ok: true, retryAfterSec: 0 };
  }
}

async function rateLimitInDb(
  key: string,
  { limit, windowMs }: RateLimitOptions,
  now: number,
): Promise<RateLimitResult> {
  const freshReset = now + windowMs;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: new Date(freshReset) })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.resetAt} <= ${now} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        resetAt: sql`CASE WHEN ${rateLimits.resetAt} <= ${now} THEN ${freshReset} ELSE ${rateLimits.resetAt} END`,
      },
    })
    .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });

  const resetAtMs = row?.resetAt instanceof Date ? row.resetAt.getTime() : Number(row?.resetAt ?? freshReset);
  if ((row?.count ?? 1) > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((resetAtMs - now) / 1000)) };
  }
  // 가끔 만료 행을 정리한다 (약 2% 확률). 테이블이 무한히 커지지 않게 하는 정도면 충분하다.
  if (Math.random() < 0.02) {
    await db.delete(rateLimits).where(lt(rateLimits.resetAt, new Date(now)));
  }
  return { ok: true, retryAfterSec: 0 };
}

/** 카운트를 올리지 않고 현재 차단 여부만 확인한다 (실패 시에만 카운트하는 용도). */
export async function isRateLimited(key: string, limit: number, now = Date.now()): Promise<boolean> {
  let row: { count: number; resetAt: Date | number } | undefined;
  try {
    row = await db.query.rateLimits.findFirst({ where: eq(rateLimits.key, key) });
  } catch (error) {
    console.warn("[rate-limit] store unavailable on peek", error);
    return false;
  }
  if (!row) return false;
  const resetAtMs = row.resetAt instanceof Date ? row.resetAt.getTime() : Number(row.resetAt);
  if (resetAtMs <= now) return false;
  return row.count >= limit;
}

/** 특정 키의 카운트를 지운다 (예: 로그인 성공 시 실패 카운트 리셋). */
export async function resetRateLimit(key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

/** 테스트용: 모든 카운터 삭제 */
export async function resetRateLimits(): Promise<void> {
  await db.delete(rateLimits);
}
