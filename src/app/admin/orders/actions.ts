"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/guards";
import { ORDER_STATUS } from "@/lib/config";
import { restoreStockForClosedOrder, transitionOrder } from "@/lib/order-admin";
import { reconcileOrderWithToss } from "@/lib/payments/reconcile";
import { redirectWithMessage } from "@/app/admin/_lib/redirect";
import { ALLOWED_TRANSITIONS, CARRIERS } from "./shared";

const statusSchema = z.object({
  status: z.enum(ORDER_STATUS),
  reason: z.string().trim().max(200).optional(),
  manualRefund: z.boolean(),
});

/** 상태 전이. 취소·환불이면 토스 결제 취소와 재고 복원까지 transitionOrder 가 처리한다. */
export async function updateOrderStatusAction(orderId: number, formData: FormData) {
  await assertAdmin();
  const parsed = statusSchema.safeParse({
    status: formData.get("status"),
    reason: formData.get("reason") ?? undefined,
    manualRefund: formData.get("manualRefund") === "on",
  });
  if (!parsed.success) {
    redirectWithMessage(`/admin/orders/${orderId}`, { error: "상태 값과 사유를 확인해 주세요." });
  }

  const result = await transitionOrder({
    orderId,
    next: parsed.data.status,
    reason: parsed.data.reason,
    manualRefund: parsed.data.manualRefund,
  });
  if (!result.ok) {
    redirectWithMessage(`/admin/orders/${orderId}`, { error: result.message });
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  redirectWithMessage(`/admin/orders/${orderId}`, { success: result.message });
}

const RECONCILE_MESSAGE: Record<string, string> = {
  not_found: "주문을 찾을 수 없습니다.",
  no_payment: "토스에 이 주문의 결제가 없습니다. 결제 전 주문이거나 승인 시도가 없었던 주문입니다.",
  in_sync: "토스 결제 상태와 주문 상태가 일치합니다.",
  marked_paid: "토스에서 승인 완료를 확인해 주문을 결제 완료로 바꿨습니다 (재고·쿠폰 반영).",
  cancelled: "토스에서 취소된 결제를 확인해 주문을 취소로 바꿨습니다.",
  refunded: "토스에서 취소된 결제를 확인해 주문을 환불 완료로 바꿨습니다.",
  expired: "토스에서 만료·취소된 결제를 확인해 결제 대기 주문을 닫았습니다.",
  waiting: "토스에서 아직 결제가 끝나지 않았습니다 (입금 대기 등).",
  needs_attention: "토스 상태와 주문 상태가 어긋나 있어 자동으로 맞추지 못했습니다. 운영 알림을 확인해 주세요.",
};

/** 토스 결제 상태를 다시 읽어 주문 상태를 맞춘다 (웹훅 유실·승인 중단 주문 수동 복구). */
export async function syncOrderWithTossAction(orderId: number) {
  await assertAdmin();
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) {
    redirectWithMessage(`/admin/orders/${orderId}`, { error: "주문을 찾을 수 없습니다." });
  }
  let message: string;
  let ok = true;
  try {
    const result = await reconcileOrderWithToss(order.orderNumber, { source: "admin" });
    message = `${RECONCILE_MESSAGE[result.outcome] ?? result.outcome}${result.tossStatus ? ` (토스: ${result.tossStatus})` : ""}`;
    ok = result.outcome !== "needs_attention";
  } catch (error) {
    console.error("[admin] toss sync failed", error);
    message = "토스 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    ok = false;
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  redirectWithMessage(`/admin/orders/${orderId}`, ok ? { success: message } : { error: message });
}

/** 취소·환불된 주문의 재고 복원 (반품 입고 확인 / 취소 시 복원 실패 재시도) */
export async function restoreStockAction(orderId: number) {
  await assertAdmin();
  const result = await restoreStockForClosedOrder(orderId);
  if (!result.ok) {
    redirectWithMessage(`/admin/orders/${orderId}`, { error: result.message });
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  redirectWithMessage(`/admin/orders/${orderId}`, { success: result.message });
}

const shippingSchema = z.object({
  carrier: z.enum(CARRIERS),
  trackingNumber: z.string().trim().min(1).max(40),
});

export async function setShippingAction(orderId: number, formData: FormData) {
  await assertAdmin();
  const parsed = shippingSchema.safeParse({
    carrier: formData.get("carrier"),
    trackingNumber: String(formData.get("trackingNumber") ?? "").trim(),
  });
  if (!parsed.success) {
    redirectWithMessage(`/admin/orders/${orderId}`, {
      error: "택배사와 송장 번호를 확인해 주세요.",
    });
  }

  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) {
    redirectWithMessage(`/admin/orders/${orderId}`, { error: "주문을 찾을 수 없습니다." });
  }
  if (!ALLOWED_TRANSITIONS[order.status].includes("shipped")) {
    redirectWithMessage(`/admin/orders/${orderId}`, {
      error: `${order.status} 상태에서는 배송 처리를 할 수 없습니다.`,
    });
  }

  await db
    .update(orders)
    .set({
      status: "shipped",
      trackingCarrier: parsed.data.carrier,
      trackingNumber: parsed.data.trackingNumber,
      shippedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  redirectWithMessage(`/admin/orders/${orderId}`, {
    success: "송장 정보를 저장하고 배송 중으로 변경했습니다.",
  });
}

const memoSchema = z.object({ memo: z.string().max(2000) });

export async function updateOrderMemoAction(orderId: number, formData: FormData) {
  await assertAdmin();
  const parsed = memoSchema.safeParse({ memo: String(formData.get("memo") ?? "") });
  if (!parsed.success) {
    redirectWithMessage(`/admin/orders/${orderId}`, { error: "메모를 확인해 주세요." });
  }

  await db
    .update(orders)
    .set({ adminMemo: parsed.data.memo, updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  revalidatePath(`/admin/orders/${orderId}`);
  redirectWithMessage(`/admin/orders/${orderId}`, { success: "메모를 저장했습니다." });
}
