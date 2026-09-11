import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { affectedRows } from "../db/affected";
import * as schema from "../db/schema";
import { insertOrderEvent } from "./order-events";

/**
 * 주문 정리 작업. Workers cron(worker.ts)과 테스트에서 호출하므로 `@/db/client` 프록시 대신 DB 를 인자로 받고,
 * `server-only`·`next/headers` 를 import 하지 않는다. 경로 별칭(@/) 도 쓰지 않는다 — wrangler 번들에서 그대로 resolve 되도록.
 */
export type MaintenanceDb = LibSQLDatabase<typeof schema>;

/** 결제창을 열어 둔 채 떠난 주문을 취소로 돌리기까지 기다리는 시간 */
export const PENDING_ORDER_TTL_MS = 24 * 60 * 60 * 1000;
/** paymentKey 가 기록됐는데 이 시간 넘게 pending 이면 승인 처리 중 중단된 것으로 본다 */
export const STUCK_CLAIM_TTL_MS = 60 * 60 * 1000;
/** 승인 중단 알림을 반복하는 기간. TTL 을 넘긴 뒤 이 시간 동안만 알리고(30분 cron 기준 최대 4회) 그 뒤엔 집계 로그만 남긴다. */
export const STUCK_CLAIM_ALERT_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface ExpireResult {
  expired: string[];
}

/**
 * paymentKey 가 없는(승인 시도 전) pending 주문 중 TTL 이 지난 것을 취소한다.
 * 승인 API 를 한 번도 호출하지 않았으므로 돈은 움직이지 않았고, 재고·쿠폰도 차감되지 않았다.
 * 이후 늦게 confirm 이 들어와도 ORDER_NOT_PENDING 으로 거절되므로 캡처가 일어나지 않는다.
 */
export async function expireStalePendingOrders(
  db: MaintenanceDb,
  options: { now?: Date; ttlMs?: number } = {},
): Promise<ExpireResult> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - (options.ttlMs ?? PENDING_ORDER_TTL_MS));
  const rows = await db
    .update(schema.orders)
    .set({
      status: "cancelled",
      failReason: "EXPIRED",
      cancelledAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.orders.status, "pending"),
        isNull(schema.orders.paymentKey),
        lt(schema.orders.createdAt, cutoff),
      ),
    )
    .returning({ id: schema.orders.id, orderNumber: schema.orders.orderNumber });
  for (const row of rows) {
    try {
      await insertOrderEvent(db, { orderId: row.id, from: "pending", to: "cancelled", actor: "system", reason: "EXPIRED", source: "cron" });
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "order_event.insert_failed", orderId: row.id, cause: error instanceof Error ? error.message.slice(0, 200) : String(error) }));
    }
  }
  return { expired: rows.map((r) => r.orderNumber) };
}

export interface StuckClaim {
  orderNumber: string;
  paymentKey: string;
  ageMinutes: number;
}

export interface StuckClaimReport {
  /** 이번 실행에서 알림을 보낼 주문 (TTL 을 갓 넘긴 것들) */
  alerts: StuckClaim[];
  /** TTL 을 넘긴 승인 중단 주문 전체 수 (집계 로그용) */
  stuckTotal: number;
  /** 가상계좌 입금 대기 등 승인 응답이 DONE 이 아니었던 주문 수. 입금 웹훅 연동 전까지는 사람이 확인한다. */
  awaitingConfirmation: number;
}

/**
 * paymentKey 가 기록됐는데도 pending 인 채 오래 남은 주문. confirmOrder 가 토스 승인 뒤 paid 전환 전에 죽었을 수 있어
 * 자동으로 손대지 않고 알림만 보낸다 (돈이 움직였는지 사람이 상점관리자에서 확인해야 한다).
 * 같은 주문으로 30분마다 무한히 알리지 않도록 TTL 을 넘긴 뒤 STUCK_CLAIM_ALERT_WINDOW_MS 동안만 알림 대상에 넣는다.
 * 입금 대기(PAYMENT_NOT_DONE) 주문은 알려진 상태이므로 알림이 아니라 집계로만 센다.
 */
export async function findStuckPaymentClaims(
  db: MaintenanceDb,
  options: { now?: Date; ttlMs?: number; alertWindowMs?: number } = {},
): Promise<StuckClaimReport> {
  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? STUCK_CLAIM_TTL_MS;
  const cutoff = new Date(now.getTime() - ttlMs);
  const alertFloor = new Date(cutoff.getTime() - (options.alertWindowMs ?? STUCK_CLAIM_ALERT_WINDOW_MS));
  const rows = await db
    .select({
      orderNumber: schema.orders.orderNumber,
      paymentKey: schema.orders.paymentKey,
      updatedAt: schema.orders.updatedAt,
      failReason: schema.orders.failReason,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.status, "pending"),
        isNotNull(schema.orders.paymentKey),
        lt(schema.orders.updatedAt, cutoff),
      ),
    );
  const awaiting = rows.filter((r) => r.failReason?.startsWith("PAYMENT_NOT_DONE"));
  const stuck = rows.filter((r) => !r.failReason?.startsWith("PAYMENT_NOT_DONE"));
  const alerts = stuck
    .filter((r) => r.updatedAt >= alertFloor)
    .map((r) => ({
      orderNumber: r.orderNumber,
      paymentKey: r.paymentKey ?? "",
      ageMinutes: Math.round((now.getTime() - r.updatedAt.getTime()) / 60_000),
    }));
  return { alerts, stuckTotal: stuck.length, awaitingConfirmation: awaiting.length };
}

/** 만료된 세션 정리 (로그인 경로에서 테이블을 훑지 않도록 cron 이 맡는다). 지운 행 수를 돌려준다. */
export async function purgeExpiredSessions(db: MaintenanceDb, now = new Date()): Promise<number> {
  const result = await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now)).run();
  return affectedRows(result);
}

/** 비회원 장바구니 쿠키 수명. src/lib/cart.ts 의 maxAge(90일) 와 맞춘다. */
export const GUEST_CART_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * 오래 방치된 비회원 장바구니 삭제 (품목은 FK cascade 로 함께 지워진다). 회원 장바구니는 남긴다.
 * 쿠키가 만료된 뒤에는 어차피 다시 찾을 수 없는 행이다.
 */
export async function purgeAbandonedGuestCarts(
  db: MaintenanceDb,
  options: { now?: Date; ttlMs?: number } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - (options.ttlMs ?? GUEST_CART_TTL_MS));
  const result = await db
    .delete(schema.carts)
    .where(and(isNull(schema.carts.userId), lt(schema.carts.updatedAt, cutoff)))
    .run();
  return affectedRows(result);
}

/** 만료된 rate_limits 행 정리. 없어도 동작에는 지장 없지만 테이블이 계속 커지는 것을 막는다. */
export async function purgeExpiredRateLimits(db: MaintenanceDb, now = new Date()): Promise<number> {
  const result = await db.delete(schema.rateLimits).where(lt(schema.rateLimits.resetAt, now)).run();
  return affectedRows(result);
}
