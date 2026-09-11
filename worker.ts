/**
 * Cloudflare Workers 진입점. OpenNext 가 생성한 fetch 핸들러를 그대로 쓰고, cron(scheduled) 핸들러를 덧붙인다.
 * 문서: https://opennext.js.org/cloudflare/howtos/custom-worker
 *
 * cron 은 wrangler.jsonc 의 `triggers.crons` 로 등록한다. 로컬 확인: `wrangler dev --test-scheduled` 를 띄운 뒤
 * `curl "http://localhost:8787/__scheduled"` 로 scheduled 핸들러를 직접 호출한다.
 */
import { drizzle } from "drizzle-orm/d1";
import { opsAlert } from "./src/lib/ops-alert";
import {
  expireStalePendingOrders,
  findStuckPaymentClaims,
  purgeAbandonedGuestCarts,
  purgeExpiredRateLimits,
  purgeExpiredSessions,
  type MaintenanceDb,
} from "./src/lib/order-maintenance";
import * as schema from "./src/db/schema";
// `.open-next/worker.js` 는 `pnpm cf:build` 시점에 생성된다. 빌드 전에는 없을 수 있어 ts-expect-error 를 쓸 수 없다.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";

/** wrangler types 가 만든 Cloudflare.Env + `wrangler secret put` 으로만 들어오는 선택 비밀값 */
type WorkerEnv = Cloudflare.Env & { OPS_ALERT_WEBHOOK_URL?: string; CRON_SECRET?: string };

/** 일일 대사 트리거 (03:15 KST). wrangler.jsonc 의 triggers.crons 와 문자열이 같아야 한다. */
const DAILY_CRON = "15 18 * * *";

/**
 * Next 안의 코드(토스 조회·db 프록시)를 쓰는 cron 작업은 Worker 내부 fetch 로 /api/internal/cron 을 호출한다.
 * CRON_SECRET(Bearer) 으로 인가한다. 시크릿이 없으면 작업을 건너뛰고 알림만 남긴다.
 */
async function runNextCronJob(env: WorkerEnv, ctx: ExecutionContext, job: "pending" | "daily"): Promise<void> {
  if (!env.CRON_SECRET) {
    // 시크릿 없이는 라우트가 거부한다. 조용히 넘어가지 않도록 알림 로그를 남긴다.
    await opsAlert("cron.secret_missing", { job }, { webhookUrl: env.OPS_ALERT_WEBHOOK_URL ?? null });
    return;
  }
  const headers: Record<string, string> = { authorization: `Bearer ${env.CRON_SECRET}` };
  const request = new Request(`https://avoralabs.co/api/internal/cron?job=${job}`, { headers });
  const response: Response = await handler.fetch(request, env, ctx);
  const body = await response.text();
  console.log(JSON.stringify({ level: response.ok ? "info" : "error", event: "cron.next_job", job, status: response.status, body: body.slice(0, 500) }));
  if (!response.ok) throw new Error(`cron job ${job} failed with ${response.status}`);
}

async function runMaintenance(env: WorkerEnv): Promise<void> {
  const db = drizzle(env.DB, { schema }) as unknown as MaintenanceDb;
  const alert = { webhookUrl: env.OPS_ALERT_WEBHOOK_URL ?? null };
  const now = new Date();

  const { expired } = await expireStalePendingOrders(db, { now });
  if (expired.length > 0) {
    console.log(JSON.stringify({ level: "info", event: "cron.pending_orders_expired", count: expired.length, orders: expired }));
  }

  const stuck = await findStuckPaymentClaims(db, { now });
  for (const claim of stuck.alerts) {
    await opsAlert("cron.stuck_payment_claim", { ...claim }, { level: "warn", ...alert });
  }
  if (stuck.stuckTotal > 0 || stuck.awaitingConfirmation > 0) {
    // 승인 중단 주문이 남아 있는 한 매 실행마다 집계를 warn 으로 남긴다 (개별 알림은 2시간 창으로 제한, 웹훅은 보내지 않음).
    const line = JSON.stringify({
      level: stuck.stuckTotal > 0 ? "warn" : "info",
      event: "cron.pending_claims",
      stuck: stuck.stuckTotal,
      awaitingConfirmation: stuck.awaitingConfirmation,
    });
    if (stuck.stuckTotal > 0) console.warn(line);
    else console.log(line);
  }

  const purged = await purgeExpiredRateLimits(db, now);
  if (purged > 0) {
    console.log(JSON.stringify({ level: "info", event: "cron.rate_limits_purged", count: purged }));
  }

  const sessionsPurged = await purgeExpiredSessions(db, now);
  const cartsPurged = await purgeAbandonedGuestCarts(db, { now });
  if (sessionsPurged > 0 || cartsPurged > 0) {
    console.log(
      JSON.stringify({ level: "info", event: "cron.housekeeping", sessions: sessionsPurged, guestCarts: cartsPurged }),
    );
  }
  // 성공 신호. 외형 모니터에서 이 로그(또는 하트비트)가 끊기면 트리거 누락·D1 장애를 의심한다.
  console.log(JSON.stringify({ level: "info", event: "cron.heartbeat", at: now.toISOString() }));
}

// OpenNext 의 Durable Object(DOQueueHandler·DOShardedTagCache·BucketCachePurge)는 다시 내보내지 않는다.
// ISR 캐시·큐를 켜서 wrangler.jsonc 에 durable_objects 바인딩을 추가하는 시점에 `.open-next/worker.js` 에서 re-export 할 것.
export default {
  fetch: (request, env, ctx) => handler.fetch(request, env, ctx),

  // promise 를 그대로 돌려줘야 실패가 Cloudflare 의 cron 실행 결과(대시보드·wrangler tail --status error)에 잡힌다.
  async scheduled(controller, env, ctx) {
    try {
      if (controller.cron === DAILY_CRON) {
        await runNextCronJob(env, ctx, "daily");
        return;
      }
      await runMaintenance(env);
      await runNextCronJob(env, ctx, "pending");
    } catch (error) {
      await opsAlert(
        "cron.maintenance_failed",
        { cron: controller.cron, cause: error },
        { webhookUrl: env.OPS_ALERT_WEBHOOK_URL ?? null },
      );
      throw error;
    }
  },
} satisfies ExportedHandler<WorkerEnv>;
