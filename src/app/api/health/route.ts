import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";

/** isolate 내 간이 제한: 같은 IP 가 분당 이 횟수를 넘으면 DB 를 건드리지 않고 429. D1 읽기 증폭을 막는 용도라 정확할 필요는 없다. */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function throttled(ip: string, now: number): boolean {
  if (hits.size > 1_000) hits.clear();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

/** isolate 안에서 결과를 잠깐 재사용한다. 모니터 여러 개가 동시에 찔러도 D1 왕복은 이 주기당 한 번이다. */
const RESULT_TTL_MS = 10_000;
let lastResult: { ok: boolean; checkedAt: number } | null = null;

async function checkDb(now: number): Promise<boolean> {
  if (lastResult && now - lastResult.checkedAt < RESULT_TTL_MS) return lastResult.ok;
  let ok = false;
  try {
    await db.get(sql`select 1`);
    ok = true;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "alert",
        event: "health.db_unavailable",
        cause: error instanceof Error ? error.message.slice(0, 200) : String(error),
      }),
    );
  }
  lastResult = { ok, checkedAt: now };
  return ok;
}

/**
 * 외형 모니터링용 헬스체크. D1 에 한 행을 읽어 앱과 DB 가 함께 살아 있는지 본다.
 * 응답은 상태 코드(200/503)와 `ok` 만 내보낸다 — 내부 상태·오류 문구는 로그에만 남긴다.
 */
export async function GET(request: Request) {
  const now = Date.now();
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (throttled(ip, now)) {
    return NextResponse.json({ ok: false }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  const ok = await checkDb(now);
  return NextResponse.json(
    { ok, at: new Date(now).toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
