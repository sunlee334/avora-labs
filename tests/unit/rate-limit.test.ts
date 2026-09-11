import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { isRateLimited, rateLimit, resetRateLimit, resetRateLimits } from "@/lib/auth/rate-limit";

// DB 기반 레이트리밋. vitest 환경의 DATABASE_URL(:memory:) 에 마이그레이션을 적용해 사용한다.
const T0 = 1_800_000_000_000;
const opts = { limit: 3, windowMs: 60_000 };

describe("rateLimit (DB-backed fixed window)", () => {
  beforeAll(async () => {
    await runMigrations(db);
  });
  beforeEach(async () => {
    await resetRateLimits();
  });

  it("allows up to `limit` calls in a window, then blocks with retryAfterSec", async () => {
    expect((await rateLimit("k", opts, T0)).ok).toBe(true);
    expect((await rateLimit("k", opts, T0 + 1_000)).ok).toBe(true);
    expect((await rateLimit("k", opts, T0 + 2_000)).ok).toBe(true);
    const blocked = await rateLimit("k", opts, T0 + 3_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("isolates keys", async () => {
    for (let i = 0; i < 3; i += 1) await rateLimit("a", opts, T0);
    expect((await rateLimit("a", opts, T0)).ok).toBe(false);
    expect((await rateLimit("b", opts, T0)).ok).toBe(true);
  });

  it("resets after the window passes", async () => {
    for (let i = 0; i < 4; i += 1) await rateLimit("w", opts, T0);
    expect((await rateLimit("w", opts, T0)).ok).toBe(false);
    expect((await rateLimit("w", opts, T0 + 60_001)).ok).toBe(true);
    expect((await rateLimit("w", opts, T0 + 60_002)).ok).toBe(true);
  });

  it("isRateLimited peeks without incrementing; resetRateLimit clears", async () => {
    expect(await isRateLimited("p", 3, T0)).toBe(false);
    for (let i = 0; i < 3; i += 1) await rateLimit("p", opts, T0);
    expect(await isRateLimited("p", 3, T0)).toBe(true);
    expect(await isRateLimited("p", 3, T0)).toBe(true); // 반복 조회해도 변하지 않는다
    expect(await isRateLimited("p", 3, T0 + 60_001)).toBe(false); // 윈도우 경과
    await resetRateLimit("p");
    expect(await isRateLimited("p", 3, T0)).toBe(false);
    expect((await rateLimit("p", opts, T0)).ok).toBe(true);
  });
});
