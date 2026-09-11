import { NextResponse } from "next/server";
import { runDailyReconcileJob, runPendingReconcileJob } from "@/lib/payments/reconcile";

export const dynamic = "force-dynamic";

let warnedMissingSecret = false;

/**
 * worker.ts 의 scheduled 핸들러가 Worker 내부에서 호출하는 cron 작업 진입점.
 * Next 안의 코드(토스 클라이언트·db 프록시)를 재사용하려고 HTTP 라우트로 둔다.
 *
 * 인가: CRON_SECRET(`wrangler secret put CRON_SECRET --env production`, 로컬은 .dev.vars/.env) Bearer 토큰이 일치해야 한다.
 * 시크릿이 없으면 어떤 요청도 받지 않는다 (fail-closed) — 약한 검사로 조용히 내려앉지 않도록.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.error(JSON.stringify({ level: "alert", event: "cron.secret_missing", detail: "CRON_SECRET 이 없어 cron 작업을 거부합니다." }));
    }
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const job = new URL(request.url).searchParams.get("job") ?? "pending";
  try {
    const summary = job === "daily" ? await runDailyReconcileJob() : await runPendingReconcileJob();
    return NextResponse.json({
      ok: true,
      job,
      checked: summary.checked,
      changed: summary.changed.length,
      attention: summary.attention.length,
      errors: summary.errors,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "cron.job_failed",
        job,
        cause: error instanceof Error ? error.message.slice(0, 200) : String(error),
      }),
    );
    return NextResponse.json({ ok: false, job }, { status: 500 });
  }
}
