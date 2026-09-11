import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db/client";
import { couponRedemptions, coupons, orderItems, orders, variants, type Order } from "@/db/schema";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { enqueueOrderNotifications } from "@/lib/notifications/enqueue";
import { recordOrderEvent, type OrderEventActor } from "@/lib/order-events";
import { opsAlert } from "@/lib/ops-alert";
import { cancelTossPayment, isVirtualAccount, TossPaymentError } from "@/lib/payments/toss";
import { ALLOWED_TRANSITIONS } from "@/app/admin/orders/shared";

export type TransitionResult =
  | { ok: true; order: Order; message: string }
  | { ok: false; message: string };

export interface TransitionInput {
  orderId: number;
  next: OrderStatus;
  /** 취소·환불 사유. 토스 취소 API 와 관리자 메모에 기록된다. */
  reason?: string;
  /**
   * 토스 상점관리자에서 이미 환불(또는 결제 상태 확인)을 끝낸 경우. 결제 취소 API 를 호출하지 않고 메모에 남긴다.
   * 가상계좌(환불 계좌 필요)처럼 API 로 취소할 수 없는 결제의 유일한 경로다.
   */
  manualRefund?: boolean;
  /**
   * 토스 쪽에서 이미 취소된 결제를 DB 에 반영하는 경우(웹훅·대사). 결제 취소 API 를 호출하지 않고 메모에 남긴다.
   */
  externalCancel?: boolean;
  /** 누가 바꿨는지 (이력용). 기본 admin */
  actor?: OrderEventActor;
  /** 어느 경로에서 났는지 (이력용). 기본 admin-ui */
  source?: string;
  now?: Date;
}

/**
 * 관리자 주문 상태 전이. 취소·환불이면 DB 를 바꾸기 전에 토스 결제를 먼저 취소한다 —
 * 결제 취소가 실패했는데 주문만 취소로 바뀌면 고객 돈이 묶인 채 화면에서는 끝난 것처럼 보이기 때문이다.
 *
 * 재고는 출고 전 취소(cancelled)에서만 바로 복원한다. 출고 후 환불(refunded)은 물건이 돌아온 뒤
 * `restoreStockForClosedOrder` 로 복원한다 (반품 회수 전 판매 가능 수량이 부풀지 않도록).
 */
export async function transitionOrder(input: TransitionInput): Promise<TransitionResult> {
  const now = input.now ?? new Date();
  const order = await db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
  if (!order) return { ok: false, message: "주문을 찾을 수 없습니다." };

  const next = input.next;
  if (!ALLOWED_TRANSITIONS[order.status].includes(next)) {
    return {
      ok: false,
      message: `${ORDER_STATUS_LABEL[order.status]} 상태에서는 ${ORDER_STATUS_LABEL[next]}(으)로 변경할 수 없습니다.`,
    };
  }

  const isCancelLike = next === "cancelled" || next === "refunded";
  const actor = input.actor ?? "admin";
  const source = input.source ?? "admin-ui";
  const reason = input.reason?.trim() || (next === "refunded" ? "관리자 환불" : "관리자 취소");
  const memoLines: string[] = [];
  let tossCancelled = false;

  // paymentKey 가 있으면 pending 이어도 토스에 승인된 결제가 있을 수 있다 (승인 요청 중 중단된 주문).
  if (isCancelLike && order.paymentKey) {
    if (input.externalCancel) {
      memoLines.push(`[토스] 토스 측에서 이미 취소된 결제를 반영했습니다 (${order.paymentKey}).`);
    } else if (input.manualRefund) {
      memoLines.push(`[수동] 토스 상점관리자에서 처리 완료로 확인 (${order.paymentKey}). 결제 취소 API 는 호출하지 않았습니다.`);
    } else if (isVirtualAccount(order.paymentMethod)) {
      return {
        ok: false,
        message:
          "가상계좌 결제는 환불 계좌가 필요해 자동 취소할 수 없습니다. 토스 상점관리자에서 환불한 뒤 '상점관리자에서 직접 처리' 를 체크해 주세요.",
      };
    } else {
      try {
        const cancel = await cancelTossPayment({
          paymentKey: order.paymentKey,
          cancelReason: reason,
          // 같은 주문·같은 사유의 재시도(네트워크 오류 등)는 같은 키로 묶는다. 사유가 다르면 다른 키를 써서
          // 멱등키-본문 불일치로 거절되지 않게 한다 — 이중 취소는 토스의 ALREADY_CANCELED_PAYMENT 가 막는다.
          idempotencyKey: `cancel-${order.orderNumber}-${createHash("sha256").update(reason).digest("hex").slice(0, 12)}`,
        });
        tossCancelled = true;
        memoLines.push(
          cancel.alreadyCancelled
            ? `[자동] 토스 결제는 이미 취소돼 있었습니다 (${order.paymentKey}).`
            : `[자동] 토스 결제 취소 완료: ${cancel.cancelledAmount.toLocaleString("ko-KR")}원 (${cancel.status}).`,
        );
      } catch (error) {
        if (order.status === "pending" && error instanceof TossPaymentError && error.httpStatus === 404) {
          // 선점만 됐고 실제 승인은 없었던 주문: 토스에 결제 자체가 없으므로 주문만 취소한다.
          memoLines.push(`[자동] 토스에 승인된 결제가 없어(${error.code}) 결제 취소 없이 주문만 취소했습니다.`);
        } else {
          const detail =
            error instanceof TossPaymentError ? `${error.code}: ${error.message}` : "결제 취소 요청에 실패했습니다.";
          await opsAlert("order.toss_cancel_failed", {
            order: order.orderNumber,
            paymentKey: order.paymentKey,
            status: order.status,
            cause: error,
          });
          return { ok: false, message: `토스 결제 취소에 실패해 상태를 바꾸지 않았습니다. ${detail}` };
        }
      }
    }
  }

  memoLines.push(`[${formatDateTime(now)}] ${ORDER_STATUS_LABEL[next]} 처리 — ${reason}`);

  const patch: Partial<typeof orders.$inferInsert> = { status: next, updatedAt: now };
  if (next === "delivered") patch.deliveredAt = now;
  if (isCancelLike) {
    patch.cancelledAt = now;
    patch.adminMemo = sql`${orders.adminMemo} || ${(order.adminMemo ? "\n" : "") + memoLines.join("\n")}` as never;
  }

  const [updated] = await db
    .update(orders)
    .set(patch)
    .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
    .returning();
  if (!updated) {
    // 그 사이 다른 관리자가 상태를 바꾼 경우. 토스 취소가 이미 실행됐다면 돈은 돌아갔는데 주문은 그대로이므로 반드시 알린다.
    if (tossCancelled) {
      await opsAlert("order.toss_cancelled_but_status_unchanged", {
        order: order.orderNumber,
        paymentKey: order.paymentKey,
        expectedStatus: order.status,
      });
      return {
        ok: false,
        message:
          "토스 결제는 취소됐지만 그 사이 주문 상태가 바뀌어 주문을 갱신하지 못했습니다. 새로고침 후 상태를 다시 확인해 주세요.",
      };
    }
    return { ok: false, message: "그 사이 주문 상태가 바뀌었습니다. 화면을 새로고침한 뒤 다시 확인해 주세요." };
  }

  await recordOrderEvent(db, { orderId: order.id, from: order.status, to: next, actor, reason, source });

  if (next === "shipped" || next === "delivered") {
    // 송장 안내·리뷰 요청·재구매 리마인드 예약. 대기열 오류가 상태 변경을 실패로 만들면 안 된다.
    try {
      await enqueueOrderNotifications(updated, next, { now });
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", event: "notify.enqueue_failed", order: order.orderNumber, stage: next, cause: error instanceof Error ? error.message.slice(0, 200) : String(error) }));
    }
  }

  let message = `주문을 ${ORDER_STATUS_LABEL[next]} 상태로 변경했습니다.`;
  if (isCancelLike) {
    // 쿠폰은 취소·환불 모두에서 되돌린다 (고객이 다시 쓸 수 있게). 재고와 달리 물건 회수와 무관하다.
    try {
      const restored = await restoreCouponForOrder(order.id);
      if (restored > 0) message += " 쿠폰 사용 기록을 되돌렸습니다.";
    } catch (error) {
      await opsAlert("order.coupon_restore_failed", { order: order.orderNumber, cause: error });
      message += " 단, 쿠폰 복원에 실패했습니다 (알림 발송).";
    }
  }
  if (next === "cancelled") {
    try {
      const restored = await restoreDeductedStock(order.id);
      if (restored > 0) message += ` 재고 ${restored}개 품목을 복원했습니다.`;
    } catch {
      // restoreDeductedStock 가 이미 알림을 남겼다. 취소 자체는 끝났으므로 성공으로 돌려주되 후속 조치를 안내한다.
      message += " 단, 재고 복원에 실패했습니다. 아래 '재고 복원' 버튼으로 다시 시도해 주세요.";
    }
  } else if (next === "refunded") {
    message += " 반품이 입고되면 '재고 복원' 버튼으로 재고를 되돌려 주세요.";
  }
  return { ok: true, order: updated, message };
}

/** 취소·환불된 주문의 재고 복원 (환불 후 반품 입고 확인, 또는 취소 시 복원 실패의 재시도). 여러 번 눌러도 한 번만 복원된다. */
export async function restoreStockForClosedOrder(
  orderId: number,
): Promise<{ ok: boolean; message: string; restored: number }> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return { ok: false, message: "주문을 찾을 수 없습니다.", restored: 0 };
  if (order.status !== "cancelled" && order.status !== "refunded") {
    return { ok: false, message: "취소·환불된 주문만 재고를 복원할 수 있습니다.", restored: 0 };
  }
  try {
    const restored = await restoreDeductedStock(orderId);
    return restored === 0
      ? { ok: true, message: "복원할 재고가 없습니다 (이미 복원됐거나 차감된 적이 없습니다).", restored }
      : { ok: true, message: `재고 ${restored}개 품목을 복원했습니다.`, restored };
  } catch {
    return { ok: false, message: "재고 복원에 실패했습니다. 잠시 후 다시 시도해 주세요.", restored: 0 };
  }
}

/**
 * 결제 승인 때 실제로 차감된 품목(stock_deducted=1)만 재고를 되돌리고 표시를 지운다.
 * 차감이 안 됐던 품목(재고 부족·batch 실패)이나 이미 복원한 품목은 건드리지 않는다 → 과복원 방지.
 * 재고 증가와 표시 해제를 한 batch 로 묶어 둘 중 하나만 반영되는 상태를 막는다. 실패 시 표시가 남아 재시도할 수 있다.
 */
export async function restoreDeductedStock(orderId: number): Promise<number> {
  const items = await db
    .select({ id: orderItems.id, variantId: orderItems.variantId, qty: orderItems.qty })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.stockDeducted, true)));
  if (items.length === 0) return 0;

  const statements = [
    ...items.map((item) =>
      db
        .update(variants)
        .set({ stock: sql`${variants.stock} + ${item.qty}` })
        .where(eq(variants.id, item.variantId)),
    ),
    db
      .update(orderItems)
      .set({ stockDeducted: false })
      .where(inArray(orderItems.id, items.map((i) => i.id))),
  ] as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
  try {
    await db.batch(statements);
  } catch (error) {
    await opsAlert("order.stock_restore_failed", { orderId, cause: error });
    throw error;
  }
  return items.length;
}

/**
 * 취소·환불된 주문의 쿠폰 사용 기록을 되돌린다: redemption 행을 지우고 `usedCount` 를 그만큼 줄인다(0 미만 방지).
 * 행이 지워지므로 여러 번 호출해도 한 번만 반영된다.
 */
export async function restoreCouponForOrder(orderId: number): Promise<number> {
  const rows = await db
    .select({ id: couponRedemptions.id, couponId: couponRedemptions.couponId })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.orderId, orderId));
  if (rows.length === 0) return 0;

  const couponIds = [...new Set(rows.map((r) => r.couponId))];

  // usedCount 는 적립 행 수로 다시 센다 (승인 쪽과 같은 규칙). 중복 실행·부분 실패가 있어도 항상 실제 행 수와 같다.
  const statements = [
    db.delete(couponRedemptions).where(inArray(couponRedemptions.id, rows.map((r) => r.id))),
    ...couponIds.map((couponId) =>
      db
        .update(coupons)
        .set({ usedCount: sql`(select count(*) from ${couponRedemptions} where ${couponRedemptions.couponId} = ${couponId})` })
        .where(eq(coupons.id, couponId)),
    ),
  ] as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
  await db.batch(statements);
  return rows.length;
}
