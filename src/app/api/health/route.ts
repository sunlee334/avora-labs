import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { CRON_STATE_KEYS, getOpsState, summarizeCron } from "@/lib/ops-state";

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
type CronSummary = ReturnType<typeof summarizeCron>;
let lastResult: { ok: boolean; cron: CronSummary | null; checkedAt: number } | null = null;

async function checkDb(now: number): Promise<{ ok: boolean; cron: CronSummary | null }> {
  if (lastResult && now - lastResult.checkedAt < RESULT_TTL_MS) return lastResult;
  let ok = false;
  let cron: CronSummary | null = null;
  try {
    await db.get(sql`select 1`);
    ok = true;
    // cron 마지막 실행 시각 — 외형 모니터가 "사이트는 살아 있는데 cron 이 멈춤" 을 잡는다.
    cron = summarizeCron(await getOpsState(db, CRON_STATE_KEYS), new Date(now));
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "alert",
        event: "health.db_unavailable",
        cause: error instanceof Error ? error.message.slice(0, 200) : String(error),
      }),
    );
  }
  lastResult = { ok, cron, checkedAt: now };
  return lastResult;
}

/**
 * 외형 모니터링용 헬스체크. D1 에 한 행을 읽어 앱과 DB 가 함께 살아 있는지 보고, cron 의 마지막 실행 시각(ops_state)을 함께 준다.
 * 상태 코드(200/503)는 DB 기준이고 cron 지연은 `cron.stale` 로만 표시한다 — 사이트는 살아 있으므로 503 을 내지 않는다.
 * 내부 오류 문구는 로그에만 남긴다.
 */
export async function GET(request: Request) {
  const now = Date.now();
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (throttled(ip, now)) {
    return NextResponse.json({ ok: false }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  const { ok, cron } = await checkDb(now);
  return NextResponse.json(
    { ok, at: new Date(now).toISOString(), cron },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
