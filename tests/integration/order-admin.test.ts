import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { couponRedemptions, coupons, orderItems, orders, variants, type Order } from "@/db/schema";
import { installTestDb, uninstallTestDb } from "../helpers/db";

vi.mock("@/lib/payments/toss", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/toss")>();
  return { ...actual, confirmTossPayment: vi.fn(), cancelTossPayment: vi.fn() };
});

import {
  restoreCouponForOrder,
  restoreDeductedStock,
  restoreStockForClosedOrder,
  transitionOrder,
} from "@/lib/order-admin";
import { cancelTossPayment, TossPaymentError } from "@/lib/payments/toss";

let db: Database;

/** 승인이 끝난 상태의 주문을 직접 만든다 (재고는 승인 때 차감된 것으로 맞춘다). */
async function paidOrder(
  overrides: Partial<typeof orders.$inferInsert> = {},
  lines: { sku: string; qty: number; stockDeducted: boolean }[] = [{ sku: "PAROS-DS-50-1", qty: 2, stockDeducted: true }],
): Promise<Order> {
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `PR-20260909-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      status: "paid",
      email: "buyer@example.com",
      customerName: "홍길동",
      phone: "01012345678",
      recipientName: "홍길동",
      recipientPhone: "01012345678",
      postalCode: "04001",
      address1: "서울특별시 마포구",
      subtotalKrw: 64_000,
      totalKrw: 64_000,
      paymentKey: "pk_paid",
      paymentMethod: "카드",
      paidAt: new Date(),
      ...overrides,
    })
    .returning();
  for (const line of lines) {
    const variant = await db.query.variants.findFirst({ where: eq(variants.sku, line.sku), with: { product: true } });
    if (!variant) throw new Error(`unknown sku ${line.sku}`);
    await db.insert(orderItems).values({
      orderId: order.id,
      productId: variant.productId,
      variantId: variant.id,
      productName: variant.product.name,
      variantName: variant.name,
      unitsPerPack: variant.unitsPerPack,
      unitPriceKrw: variant.priceKrw,
      qty: line.qty,
      lineTotalKrw: variant.priceKrw * line.qty,
      stockDeducted: line.stockDeducted,
    });
    if (line.stockDeducted) {
      await db
        .update(variants)
        .set({ stock: variant.stock - line.qty })
        .where(eq(variants.id, variant.id));
    }
  }
  return order;
}

async function stockOf(sku: string): Promise<number> {
  const row = await db.query.variants.findFirst({ where: eq(variants.sku, sku) });
  return row!.stock;
}

beforeEach(async () => {
  ({ db } = await installTestDb({ seed: true }));
  vi.mocked(cancelTossPayment).mockReset();
});

afterEach(() => {
  uninstallTestDb();
});

describe("transitionOrder — cancel/refund with Toss", () => {
  it("cancels the Toss payment first, then marks the order cancelled and restores only deducted stock", async () => {
    const order = await paidOrder();
    expect(await stockOf("PAROS-DS-50-1")).toBe(1_998);
    vi.mocked(cancelTossPayment).mockResolvedValue({
      paymentKey: "pk_paid",
      status: "CANCELED",
      cancelledAmount: 64_000,
      alreadyCancelled: false,
    });

    const result = await transitionOrder({ orderId: order.id, next: "cancelled", reason: "고객 요청" });

    expect(result.ok).toBe(true);
    expect(cancelTossPayment).toHaveBeenCalledWith({
      paymentKey: "pk_paid",
      cancelReason: "고객 요청",
      idempotencyKey: expect.stringMatching(new RegExp(`^cancel-${order.orderNumber}-[0-9a-f]{12}$`)),
    });
    const updated = await db.query.orders.findFirst({ where: eq(orders.id, order.id), with: { items: true } });
    expect(updated?.status).toBe("cancelled");
    expect(updated?.cancelledAt).toBeInstanceOf(Date);
    expect(updated?.adminMemo).toContain("토스 결제 취소 완료: 64,000원");
    expect(updated?.adminMemo).toContain("고객 요청");
    expect(updated?.items[0].stockDeducted).toBe(false);
    expect(await stockOf("PAROS-DS-50-1")).toBe(2_000);
  });

  it("keys Toss idempotency on the order and the reason, so a changed reason is a new request and a retry is not", async () => {
    const order = await paidOrder();
    vi.mocked(cancelTossPayment).mockResolvedValue({ paymentKey: "pk_paid", status: "CANCELED", cancelledAmount: 64_000, alreadyCancelled: false });
    await transitionOrder({ orderId: order.id, next: "cancelled", reason: "사유 A" });
    const other = await paidOrder();
    await transitionOrder({ orderId: other.id, next: "cancelled", reason: "사유 A" });
    const third = await paidOrder();
    await transitionOrder({ orderId: third.id, next: "cancelled", reason: "사유 B" });

    const keys = vi.mocked(cancelTossPayment).mock.calls.map((c) => c[0].idempotencyKey!);
    const suffix = (k: string) => k.split("-").pop();
    expect(suffix(keys[0])).toBe(suffix(keys[1]));
    expect(suffix(keys[0])).not.toBe(suffix(keys[2]));
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("leaves the order untouched when the Toss cancel fails", async () => {
    const order = await paidOrder();
    vi.mocked(cancelTossPayment).mockRejectedValue(
      new TossPaymentError("NOT_CANCELABLE_PAYMENT", "취소할 수 없는 결제입니다.", 403),
    );

    const result = await transitionOrder({ orderId: order.id, next: "cancelled", reason: "x" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("NOT_CANCELABLE_PAYMENT");
    const updated = await db.query.orders.findFirst({ where: eq(orders.id, order.id), with: { items: true } });
    expect(updated?.status).toBe("paid");
    expect(updated?.cancelledAt).toBeNull();
    expect(updated?.items[0].stockDeducted).toBe(true);
    expect(await stockOf("PAROS-DS-50-1")).toBe(1_998);
  });

  it("does not restore stock for lines that were never deducted", async () => {
    const order = await paidOrder({}, [
      { sku: "PAROS-DS-50-1", qty: 1, stockDeducted: true },
      { sku: "PAROS-DS-50-2SET", qty: 1, stockDeducted: false },
    ]);
    const twoSetBefore = await stockOf("PAROS-DS-50-2SET");
    vi.mocked(cancelTossPayment).mockResolvedValue({
      paymentKey: "pk_paid",
      status: "CANCELED",
      cancelledAmount: 64_000,
      alreadyCancelled: false,
    });

    const result = await transitionOrder({ orderId: order.id, next: "cancelled" });

    expect(result.ok).toBe(true);
    expect(await stockOf("PAROS-DS-50-1")).toBe(2_000);
    expect(await stockOf("PAROS-DS-50-2SET")).toBe(twoSetBefore);
  });

  it("restores stock at most once even if restoration is invoked again", async () => {
    const order = await paidOrder();
    expect(await restoreDeductedStock(order.id)).toBe(1);
    expect(await restoreDeductedStock(order.id)).toBe(0);
    expect(await stockOf("PAROS-DS-50-1")).toBe(2_000);
  });

  it("records that the payment was already cancelled instead of failing", async () => {
    const order = await paidOrder();
    vi.mocked(cancelTossPayment).mockResolvedValue({
      paymentKey: "pk_paid",
      status: "CANCELED",
      cancelledAmount: 0,
      alreadyCancelled: true,
    });

    const result = await transitionOrder({ orderId: order.id, next: "cancelled" });

    expect(result.ok).toBe(true);
    const updated = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(updated?.adminMemo).toContain("이미 취소돼 있었습니다");
  });

  it("refuses to auto-cancel a virtual-account payment unless the admin confirms a manual refund", async () => {
    const order = await paidOrder({ paymentMethod: "가상계좌" });

    const refused = await transitionOrder({ orderId: order.id, next: "cancelled" });
    expect(refused.ok).toBe(false);
    expect(refused.message).toContain("가상계좌");
    expect(cancelTossPayment).not.toHaveBeenCalled();
    expect((await db.query.orders.findFirst({ where: eq(orders.id, order.id) }))?.status).toBe("paid");

    const manual = await transitionOrder({ orderId: order.id, next: "cancelled", reason: "환불 완료", manualRefund: true });
    expect(manual.ok).toBe(true);
    expect(cancelTossPayment).not.toHaveBeenCalled();
    const updated = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(updated?.status).toBe("cancelled");
    expect(updated?.adminMemo).toContain("[수동]");
    expect(await stockOf("PAROS-DS-50-1")).toBe(2_000);
  });

  it("refunds a shipped order through Toss but leaves stock for the return-receipt step", async () => {
    const order = await paidOrder({ status: "shipped", shippedAt: new Date() });
    vi.mocked(cancelTossPayment).mockResolvedValue({
      paymentKey: "pk_paid",
      status: "CANCELED",
      cancelledAmount: 64_000,
      alreadyCancelled: false,
    });

    const result = await transitionOrder({ orderId: order.id, next: "refunded", reason: "반품 접수" });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("재고 복원");
    expect(cancelTossPayment).toHaveBeenCalledTimes(1);
    const updated = await db.query.orders.findFirst({ where: eq(orders.id, order.id), with: { items: true } });
    expect(updated?.status).toBe("refunded");
    // 출고된 물건이 돌아오기 전에는 재고를 늘리지 않는다.
    expect(updated?.items[0].stockDeducted).toBe(true);
    expect(await stockOf("PAROS-DS-50-1")).toBe(1_998);

    // 반품 입고 확인 → 복원. 두 번 눌러도 한 번만 복원된다.
    expect(await restoreStockForClosedOrder(order.id)).toMatchObject({ ok: true, restored: 1 });
    expect(await stockOf("PAROS-DS-50-1")).toBe(2_000);
    expect(await restoreStockForClosedOrder(order.id)).toMatchObject({ ok: true, restored: 0 });
    expect(await stockOf("PAROS-DS-50-1")).toBe(2_000);
  });

  it("only restores stock for closed orders", async () => {
    const order = await paidOrder();
    const result = await restoreStockForClosedOrder(order.id);
    expect(result).toMatchObject({ ok: false, restored: 0 });
    expect(await stockOf("PAROS-DS-50-1")).toBe(1_998);
  });

  it("cancels a pending order that holds a paymentKey only after checking Toss", async () => {
    const stuck = await paidOrder(
      { status: "pending", paymentKey: "pk_stuck", paymentMethod: null, paidAt: null },
      [{ sku: "PAROS-DS-50-1", qty: 2, stockDeducted: false }],
    );

    // 토스에 결제가 없으면(404) 주문만 취소한다.
    vi.mocked(cancelTossPayment).mockRejectedValueOnce(
      new TossPaymentError("NOT_FOUND_PAYMENT", "존재하지 않는 결제 정보 입니다.", 404),
    );
    const noPayment = await transitionOrder({ orderId: stuck.id, next: "cancelled", reason: "승인 중단" });
    expect(noPayment.ok).toBe(true);
    const cancelled = await db.query.orders.findFirst({ where: eq(orders.id, stuck.id) });
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.adminMemo).toContain("승인된 결제가 없어");

    // 토스가 다른 이유로 거절하면 상태를 바꾸지 않는다.
    const stuck2 = await paidOrder(
      { status: "pending", paymentKey: "pk_stuck2", paymentMethod: null, paidAt: null },
      [{ sku: "PAROS-DS-50-1", qty: 1, stockDeducted: false }],
    );
    vi.mocked(cancelTossPayment).mockRejectedValueOnce(
      new TossPaymentError("NOT_CANCELABLE_PAYMENT", "취소할 수 없는 결제입니다.", 403),
    );
    const refused = await transitionOrder({ orderId: stuck2.id, next: "cancelled" });
    expect(refused.ok).toBe(false);
    expect((await db.query.orders.findFirst({ where: eq(orders.id, stuck2.id) }))?.status).toBe("pending");

    // 토스에 승인된 결제가 있었으면 환불하고 취소한다.
    const stuck3 = await paidOrder(
      { status: "pending", paymentKey: "pk_stuck3", paymentMethod: null, paidAt: null },
      [{ sku: "PAROS-DS-50-1", qty: 1, stockDeducted: false }],
    );
    vi.mocked(cancelTossPayment).mockResolvedValueOnce({ paymentKey: "pk_stuck3", status: "CANCELED", cancelledAmount: 32_000, alreadyCancelled: false });
    const refunded = await transitionOrder({ orderId: stuck3.id, next: "cancelled" });
    expect(refunded.ok).toBe(true);
    expect((await db.query.orders.findFirst({ where: eq(orders.id, stuck3.id) }))?.adminMemo).toContain("토스 결제 취소 완료");
  });

  it("cancels an unpaid pending order without touching Toss or stock", async () => {
    const order = await paidOrder(
      { status: "pending", paymentKey: null, paymentMethod: null, paidAt: null },
      [{ sku: "PAROS-DS-50-1", qty: 2, stockDeducted: false }],
    );

    const result = await transitionOrder({ orderId: order.id, next: "cancelled", reason: "고객 연락 두절" });

    expect(result.ok).toBe(true);
    expect(cancelTossPayment).not.toHaveBeenCalled();
    const updated = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(updated?.status).toBe("cancelled");
    expect(updated?.adminMemo).toContain("고객 연락 두절");
    expect(await stockOf("PAROS-DS-50-1")).toBe(2_000);
  });
});

describe("transitionOrder — coupon restore", () => {
  async function redeemed(order: Order) {
    const coupon = await db.query.coupons.findFirst({ where: eq(coupons.code, "WITHPAROS") });
    await db.update(coupons).set({ usedCount: 3 }).where(eq(coupons.id, coupon!.id));
    await db.insert(couponRedemptions).values({ couponId: coupon!.id, orderId: order.id, email: order.email });
    return coupon!.id;
  }

  it("gives the coupon back when an order is cancelled: redemption removed, usedCount recounted from rows", async () => {
    const order = await paidOrder();
    const couponId = await redeemed(order);
    // 다른 주문의 적립 행 하나를 더 둬서 "행 수로 다시 센다" 를 확인한다 (기존 usedCount 3 은 어긋난 값).
    const other = await paidOrder();
    await db.insert(couponRedemptions).values({ couponId, orderId: other.id, email: other.email });
    vi.mocked(cancelTossPayment).mockResolvedValue({ paymentKey: "pk_paid", status: "CANCELED", cancelledAmount: 64_000, alreadyCancelled: false });

    const result = await transitionOrder({ orderId: order.id, next: "cancelled", reason: "고객 요청" });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("쿠폰");
    expect(await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, order.id))).toHaveLength(0);
    expect((await db.query.coupons.findFirst({ where: eq(coupons.id, couponId) }))?.usedCount).toBe(1);

    // 다시 호출해도 더 줄지 않는다.
    expect(await restoreCouponForOrder(order.id)).toBe(0);
    expect((await db.query.coupons.findFirst({ where: eq(coupons.id, couponId) }))?.usedCount).toBe(1);
  });

  it("never drives usedCount below zero and restores on refund too", async () => {
    const order = await paidOrder({ status: "shipped", shippedAt: new Date() });
    const couponId = await redeemed(order);
    await db.update(coupons).set({ usedCount: 0 }).where(eq(coupons.id, couponId));
    vi.mocked(cancelTossPayment).mockResolvedValue({ paymentKey: "pk_paid", status: "CANCELED", cancelledAmount: 64_000, alreadyCancelled: false });

    const result = await transitionOrder({ orderId: order.id, next: "refunded" });

    expect(result.ok).toBe(true);
    expect((await db.query.coupons.findFirst({ where: eq(coupons.id, couponId) }))?.usedCount).toBe(0);
    expect(await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, order.id))).toHaveLength(0);
  });
});

describe("transitionOrder — forward transitions", () => {
  it("rejects a transition the state machine does not allow", async () => {
    const order = await paidOrder({ status: "delivered", deliveredAt: new Date() });

    const result = await transitionOrder({ orderId: order.id, next: "preparing" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("변경할 수 없습니다");
  });

  it("stamps deliveredAt when an order is delivered and never calls Toss", async () => {
    const order = await paidOrder({ status: "shipped", shippedAt: new Date() });

    const result = await transitionOrder({ orderId: order.id, next: "delivered" });

    expect(result.ok).toBe(true);
    expect(cancelTossPayment).not.toHaveBeenCalled();
    const updated = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(updated?.status).toBe("delivered");
    expect(updated?.deliveredAt).toBeInstanceOf(Date);
    expect(await stockOf("PAROS-DS-50-1")).toBe(1_998);
  });

  it("reports a missing order", async () => {
    const result = await transitionOrder({ orderId: 9_999, next: "preparing" });
    expect(result).toEqual({ ok: false, message: "주문을 찾을 수 없습니다." });
  });
});
