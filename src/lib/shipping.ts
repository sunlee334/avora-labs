import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, type Order } from "@/db/schema";
import { SHIPPING } from "@/lib/config";
import { isValidOrderNumber } from "@/lib/orders";
import { recordOrderEvent } from "@/lib/order-events";
import { enqueueOrderNotifications } from "@/lib/notifications/enqueue";
import { CARRIERS } from "@/app/admin/orders/shared";
import type { TrackingRow } from "@/lib/csv";

/**
 * 출고 처리 한 곳: 상태를 shipped 로 바꾸고 송장을 저장하고, 이력을 남기고, 송장 안내 알림을 예약한다.
 * 관리자 주문 화면의 단건 입력과 송장 CSV 일괄 등록이 같은 함수를 쓴다 — 두 경로가 어긋나지 않게.
 */
export type Carrier = (typeof CARRIERS)[number];

/** 출고할 수 있는 상태. 결제 완료에서 바로 출고하는 경우(준비 단계를 건너뜀)도 허용한다 — 송장이 곧 출고 증거다. */
export const SHIPPABLE_STATUSES = ["paid", "preparing"] as const;

export function isCarrier(value: string): value is Carrier {
  return (CARRIERS as readonly string[]).includes(value);
}

export type ShipResult =
  | { ok: true; order: Order }
  | { ok: false; reason: "not_found" | "invalid_status" | "invalid_carrier"; message: string; status?: Order["status"] };

export async function markOrderShipped(input: {
  order: Order;
  carrier: string;
  trackingNumber: string;
  now?: Date;
  source?: string;
}): Promise<ShipResult> {
  const { order } = input;
  if (!isCarrier(input.carrier)) {
    return { ok: false, reason: "invalid_carrier", message: `알 수 없는 택배사: ${input.carrier}` };
  }
  if (!(SHIPPABLE_STATUSES as readonly string[]).includes(order.status)) {
    return { ok: false, reason: "invalid_status", status: order.status, message: `${order.status} 상태에서는 배송 처리를 할 수 없습니다.` };
  }
  const now = input.now ?? new Date();
  const [shipped] = await db
    .update(orders)
    .set({
      status: "shipped",
      trackingCarrier: input.carrier,
      trackingNumber: input.trackingNumber,
      shippedAt: now,
      updatedAt: now,
    })
    // 동시에 두 경로에서 처리해도 한 번만 바뀌도록 상태 조건을 건다.
    .where(eq(orders.id, order.id))
    .returning();
  if (!shipped) return { ok: false, reason: "not_found", message: "주문을 찾을 수 없습니다." };

  await recordOrderEvent(db, {
    orderId: order.id,
    from: order.status,
    to: "shipped",
    actor: "admin",
    reason: `${input.carrier} ${input.trackingNumber}`,
    source: input.source ?? "admin-ui",
  });
  // 송장 안내 알림 예약. 대기열 오류가 배송 처리 자체를 막으면 안 된다.
  try {
    await enqueueOrderNotifications(shipped, "shipped", { now });
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "notify.enqueue_failed",
        order: shipped.orderNumber,
        stage: "shipped",
        cause: error instanceof Error ? error.message.slice(0, 200) : String(error),
      }),
    );
  }
  return { ok: true, order: shipped };
}

export interface BulkShipResult {
  applied: number;
  skipped: { line: number; orderNumber: string; reason: string }[];
  errors: { line: number; orderNumber: string; reason: string }[];
}

/**
 * 송장 CSV 행을 순서대로 처리한다. 한 행의 실패가 나머지를 막지 않는다.
 * - 형식이 틀린 주문번호, 없는 주문, 출고할 수 없는 상태(이미 배송 중·취소 등)는 skipped 에 사유와 함께 남긴다.
 * - DB 오류처럼 예상 밖의 실패는 errors 에 남긴다.
 */
export async function bulkMarkShipped(rows: readonly TrackingRow[], opts: { now?: Date; source?: string } = {}): Promise<BulkShipResult> {
  const result: BulkShipResult = { applied: 0, skipped: [], errors: [] };
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isValidOrderNumber(row.orderNumber)) {
      result.skipped.push({ line: row.line, orderNumber: row.orderNumber, reason: "주문번호 형식이 아닙니다." });
      continue;
    }
    if (seen.has(row.orderNumber)) {
      result.skipped.push({ line: row.line, orderNumber: row.orderNumber, reason: "같은 파일에 중복된 주문번호입니다 (첫 행만 적용)." });
      continue;
    }
    seen.add(row.orderNumber);
    try {
      const order = await db.query.orders.findFirst({ where: eq(orders.orderNumber, row.orderNumber) });
      if (!order) {
        result.skipped.push({ line: row.line, orderNumber: row.orderNumber, reason: "주문을 찾을 수 없습니다." });
        continue;
      }
      const shipped = await markOrderShipped({
        order,
        carrier: row.carrier ?? SHIPPING.carrierDefault,
        trackingNumber: row.trackingNumber,
        now: opts.now,
        source: opts.source ?? "admin-csv",
      });
      if (shipped.ok) {
        result.applied += 1;
      } else {
        result.skipped.push({ line: row.line, orderNumber: row.orderNumber, reason: shipped.message });
      }
    } catch (error) {
      result.errors.push({
        line: row.line,
        orderNumber: row.orderNumber,
        reason: error instanceof Error ? error.message.slice(0, 160) : String(error),
      });
    }
  }
  return result;
}
