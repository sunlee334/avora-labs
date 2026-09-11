import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { couponRedemptions, coupons, orderEvents, orderItems, orders, users, variants } from "@/db/schema";
import type { CartView } from "@/lib/cart";
import { installTestDb, uninstallTestDb } from "../helpers/db";

// `server-only` 는 vitest.config 의 alias 로 무력화된다. 쿠키·네트워크에 닿는 두 모듈만 대체한다.
vi.mock("@/lib/cart", () => ({ getCart: vi.fn(), clearCart: vi.fn(async () => {}) }));
vi.mock("@/lib/payments/toss", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/toss")>();
  return { ...actual, confirmTossPayment: vi.fn(), cancelTossPayment: vi.fn() };
});

import { clearCart, getCart } from "@/lib/cart";
import { applyPaidTransition, CheckoutError, confirmOrder, createPendingOrder, failOrder } from "@/lib/checkout";
import { cancelTossPayment, confirmTossPayment, TossPaymentError } from "@/lib/payments/toss";

const INPUT = {
  email: "Buyer@Example.com",
  customerName: "홍길동",
  phone: "01012345678",
  recipientName: "홍길동",
  recipientPhone: "01012345678",
  postalCode: "04001",
  address1: "서울특별시 마포구",
};

let db: Database;

/** DB 의 실제 변형 정보로 CartView 를 만든다 (가격·재고를 서버 값에서 읽는 흐름을 그대로 태우기 위해). */
async function cartOf(lines: { sku: string; qty: number }[], purchasable = true): Promise<CartView> {
  const views: CartView["lines"] = [];
  for (const line of lines) {
    const variant = await db.query.variants.findFirst({
      where: eq(variants.sku, line.sku),
      with: { product: true },
    });
    if (!variant) throw new Error(`unknown sku ${line.sku}`);
    views.push({
      id: views.length + 1,
      variantId: variant.id,
      qty: line.qty,
      variant,
      lineTotalKrw: variant.priceKrw * line.qty,
      issue: null,
    });
  }
  return {
    id: "cart-test",
    lines: views,
    itemCount: views.reduce((n, l) => n + l.qty, 0),
    subtotalKrw: views.reduce((n, l) => n + l.lineTotalKrw, 0),
    purchasable,
  };
}

function tossApproval(paymentKey: string, orderNumber: string, amount: number) {
  return {
    paymentKey,
    orderId: orderNumber,
    orderName: "PAROS Daily Sunscreen 본품 50ml",
    status: "DONE",
    method: "카드",
    totalAmount: amount,
    approvedAt: "2026-09-09T10:00:00+09:00",
    receiptUrl: null,
  };
}

async function variantStock(sku: string): Promise<number> {
  const row = await db.query.variants.findFirst({ where: eq(variants.sku, sku) });
  return row!.stock;
}

beforeEach(async () => {
  ({ db } = await installTestDb({ seed: true }));
  vi.mocked(getCart).mockReset();
  vi.mocked(clearCart).mockClear();
  vi.mocked(confirmTossPayment).mockReset();
  vi.mocked(cancelTossPayment).mockReset();
});

afterEach(() => {
  uninstallTestDb();
});

describe("createPendingOrder", () => {
  it("prices the order from DB values, charges shipping under the threshold and lowercases the email", async () => {
    vi.mocked(getCart).mockResolvedValue(await cartOf([{ sku: "PAROS-DS-50-1", qty: 1 }]));

    const result = await createPendingOrder(INPUT);

    expect(result.amount).toBe(32_000 + 3_000);
    expect(result.orderName).toBe("PAROS Daily Sunscreen 본품 50ml");
    expect(result.customerEmail).toBe("buyer@example.com");

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, result.orderId),
      with: { items: true },
    });
    expect(order?.status).toBe("pending");
    expect(order?.paymentKey).toBeNull();
    expect(order?.shippingReason).toBe("none");
    expect(order?.items).toHaveLength(1);
    expect(order?.items[0]).toMatchObject({ qty: 1, unitPriceKrw: 32_000, lineTotalKrw: 32_000, stockDeducted: false });
    // 결제 대기 단계에서는 재고를 건드리지 않는다.
    expect(await variantStock("PAROS-DS-50-1")).toBe(2_000);
  });

  it("waives shipping at or above the free-shipping threshold", async () => {
    vi.mocked(getCart).mockResolvedValue(await cartOf([{ sku: "PAROS-DS-50-1", qty: 2 }]));

    const result = await createPendingOrder(INPUT);

    expect(result.amount).toBe(64_000);
    const order = await db.query.orders.findFirst({ where: eq(orders.id, result.orderId) });
    expect(order?.shippingReason).toBe("threshold");
  });

  it("applies a free-shipping coupon and records it on the order", async () => {
    vi.mocked(getCart).mockResolvedValue(await cartOf([{ sku: "PAROS-DS-50-1", qty: 1 }]));

    const result = await createPendingOrder({ ...INPUT, couponCode: " withparos " });

    expect(result.amount).toBe(32_000);
    const order = await db.query.orders.findFirst({ where: eq(orders.id, result.orderId) });
    expect(order?.couponCode).toBe("WITHPAROS");
    expect(order?.couponId).not.toBeNull();
    expect(order?.shippingReason).toBe("coupon");
  });

  it("waives shipping on a member's first paid order only", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "member@example.com", passwordHash: "x", name: "회원" })
      .returning();
    vi.mocked(getCart).mockResolvedValue(await cartOf([{ sku: "PAROS-DS-50-1", qty: 1 }]));

    const first = await createPendingOrder({ ...INPUT, userId: user.id });
    expect(first.amount).toBe(32_000);

    // pending 주문은 구매로 세지 않으므로 두 번째 pending 도 여전히 첫 주문 대우를 받는다.
    const secondPending = await createPendingOrder({ ...INPUT, userId: user.id });
    expect(secondPending.amount).toBe(32_000);

    await db.update(orders).set({ status: "paid" }).where(eq(orders.id, first.orderId));
    const afterPaid = await createPendingOrder({ ...INPUT, userId: user.id });
    expect(afterPaid.amount).toBe(35_000);
  });

  it("rejects an empty or non-purchasable cart before touching the DB", async () => {
    vi.mocked(getCart).mockResolvedValue(await cartOf([]));
    await expect(createPendingOrder(INPUT)).rejects.toMatchObject({ code: "EMPTY_CART" });

    vi.mocked(getCart).mockResolvedValue(await cartOf([{ sku: "PAROS-DS-50-1", qty: 1 }], false));
    await expect(createPendingOrder(INPUT)).rejects.toMatchObject({ code: "NOT_PURCHASABLE" });

    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("rejects an invalid coupon with the customer-facing reason", async () => {
    vi.mocked(getCart).mockResolvedValue(await cartOf([{ sku: "PAROS-DS-50-1", qty: 1 }]));

    await expect(createPendingOrder({ ...INPUT, couponCode: "NOPE" })).rejects.toSatisfy(
      (e) => e instanceof CheckoutError && e.code === "COUPON_INVALID" && e.couponFailure?.code === "invalid",
    );
  });
});

describe("confirmOrder", () => {
  async function pendingOrder(couponCode?: string) {
    vi.mocked(getCart).mockResolvedValue(await cartOf([{ sku: "PAROS-DS-50-1", qty: 2 }]));
    return createPendingOrder({ ...INPUT, couponCode });
  }

  it("captures once, marks the order paid, decrements stock and flags the deducted lines", async () => {
    const pending = await pendingOrder("WITHPAROS");
    vi.mocked(confirmTossPayment).mockResolvedValue(tossApproval("pk_1", pending.orderNumber, pending.amount));

    const result = await confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount });

    expect(result.confirmedNow).toBe(true);
    expect(result.status).toBe("paid");
    expect(confirmTossPayment).toHaveBeenCalledTimes(1);
    expect(confirmTossPayment).toHaveBeenCalledWith({
      paymentKey: "pk_1",
      orderId: pending.orderNumber,
      amount: pending.amount,
      idempotencyKey: `confirm-${pending.orderNumber}`,
    });
    expect(clearCart).toHaveBeenCalledTimes(1);

    const order = await db.query.orders.findFirst({ where: eq(orders.id, pending.orderId), with: { items: true } });
    expect(order).toMatchObject({ status: "paid", paymentKey: "pk_1", paymentMethod: "카드", failReason: null });
    expect(order?.paidAt).toBeInstanceOf(Date);
    expect(order?.items[0].stockDeducted).toBe(true);
    expect(await variantStock("PAROS-DS-50-1")).toBe(1_998);

    const coupon = await db.query.coupons.findFirst({ where: eq(coupons.code, "WITHPAROS") });
    expect(coupon?.usedCount).toBe(1);
    const redemptions = await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, pending.orderId));
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].email).toBe("buyer@example.com");
  });

  it("is idempotent for a retry with the same paymentKey and never captures or deducts twice", async () => {
    const pending = await pendingOrder();
    vi.mocked(confirmTossPayment).mockResolvedValue(tossApproval("pk_1", pending.orderNumber, pending.amount));

    await confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount });
    const again = await confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount });

    expect(again.confirmedNow).toBe(false);
    expect(again.status).toBe("paid");
    expect(confirmTossPayment).toHaveBeenCalledTimes(1);
    expect(await variantStock("PAROS-DS-50-1")).toBe(1_998);
  });

  it("hides a paid order from a request carrying a different paymentKey", async () => {
    const pending = await pendingOrder();
    vi.mocked(confirmTossPayment).mockResolvedValue(tossApproval("pk_1", pending.orderNumber, pending.amount));
    await confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount });

    await expect(
      confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_other", amount: pending.amount }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("refuses an amount that differs from the stored total without calling Toss", async () => {
    const pending = await pendingOrder();

    await expect(
      confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount - 1 }),
    ).rejects.toMatchObject({ code: "AMOUNT_MISMATCH" });

    expect(confirmTossPayment).not.toHaveBeenCalled();
    const order = await db.query.orders.findFirst({ where: eq(orders.id, pending.orderId) });
    expect(order).toMatchObject({ status: "pending", failReason: "AMOUNT_MISMATCH", paymentKey: null });
  });

  it("stops before capture when the coupon limit was used up after the pending order was created", async () => {
    const pending = await pendingOrder("WITHPAROS");
    await db.update(coupons).set({ maxUses: 1, usedCount: 1 }).where(eq(coupons.code, "WITHPAROS"));

    await expect(
      confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount }),
    ).rejects.toMatchObject({ code: "COUPON_EXHAUSTED" });

    expect(confirmTossPayment).not.toHaveBeenCalled();
    const order = await db.query.orders.findFirst({ where: eq(orders.id, pending.orderId) });
    expect(order?.status).toBe("pending");
    expect(order?.paymentKey).toBeNull();
  });

  it("releases the claim and records the reason when Toss rejects the confirmation", async () => {
    const pending = await pendingOrder();
    vi.mocked(confirmTossPayment).mockRejectedValue(
      new TossPaymentError("REJECT_CARD_COMPANY", "카드사에서 승인을 거절했습니다.", 400),
    );

    await expect(
      confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount }),
    ).rejects.toBeInstanceOf(TossPaymentError);

    const order = await db.query.orders.findFirst({ where: eq(orders.id, pending.orderId), with: { items: true } });
    expect(order?.status).toBe("pending");
    expect(order?.paymentKey).toBeNull();
    expect(order?.failReason).toContain("REJECT_CARD_COMPANY");
    expect(order?.items[0].stockDeducted).toBe(false);
    expect(await variantStock("PAROS-DS-50-1")).toBe(2_000);
    expect(clearCart).not.toHaveBeenCalled();
  });

  it("keeps the claim when the confirmation outcome is unknown (timeout), so only the same paymentKey may retry", async () => {
    const pending = await pendingOrder();
    vi.mocked(confirmTossPayment).mockRejectedValueOnce(
      new TossPaymentError("TIMEOUT", "결제 서버 응답이 시간 내에 오지 않았습니다.", 504),
    );

    await expect(
      confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });

    let order = await db.query.orders.findFirst({ where: eq(orders.id, pending.orderId) });
    expect(order?.status).toBe("pending");
    expect(order?.paymentKey).toBe("pk_1");
    expect(order?.failReason).toContain("TIMEOUT");

    // 다른 paymentKey 로는 선점하지 못한다 (첫 결제가 승인됐을 수 있으므로).
    await expect(
      confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_2", amount: pending.amount }),
    ).rejects.toMatchObject({ code: "ORDER_IN_PROGRESS" });
    expect(confirmTossPayment).toHaveBeenCalledTimes(1);

    // 같은 paymentKey 재시도는 통과하고 정상 승인된다.
    vi.mocked(confirmTossPayment).mockResolvedValue(tossApproval("pk_1", pending.orderNumber, pending.amount));
    const result = await confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount });
    expect(result.confirmedNow).toBe(true);
    order = await db.query.orders.findFirst({ where: eq(orders.id, pending.orderId) });
    expect(order?.status).toBe("paid");
    expect(order?.failReason).toBeNull();
    expect(await variantStock("PAROS-DS-50-1")).toBe(1_998);
  });

  it("refunds a capture that landed on an order cancelled meanwhile instead of reviving it", async () => {
    const pending = await pendingOrder("WITHPAROS");
    vi.mocked(confirmTossPayment).mockImplementation(async () => {
      // 승인 요청이 나가 있는 동안 관리자가 주문을 취소한 상황을 흉내 낸다.
      await db.update(orders).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(orders.id, pending.orderId));
      return tossApproval("pk_1", pending.orderNumber, pending.amount);
    });
    vi.mocked(cancelTossPayment).mockResolvedValue({ paymentKey: "pk_1", status: "CANCELED", cancelledAmount: pending.amount, alreadyCancelled: false });

    const result = await confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount });

    expect(result.status).toBe("cancelled");
    expect(result.confirmedNow).toBe(false);
    expect(cancelTossPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentKey: "pk_1", idempotencyKey: `cancel-${pending.orderNumber}-closed` }),
    );
    const order = await db.query.orders.findFirst({ where: eq(orders.id, pending.orderId), with: { items: true } });
    expect(order?.status).toBe("cancelled");
    expect(order?.adminMemo).toContain("전액 환불");
    // 재고·쿠폰은 건드리지 않는다 (물건이 팔린 것이 아니다).
    expect(order?.items[0].stockDeducted).toBe(false);
    expect(await variantStock("PAROS-DS-50-1")).toBe(2_000);
    expect((await db.query.coupons.findFirst({ where: eq(coupons.code, "WITHPAROS") }))?.usedCount).toBe(0);
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, pending.orderId));
    expect(events.map((e) => e.reason)).toContain("CAPTURE_ON_CLOSED_REFUNDED");
  });

  it("keeps usedCount equal to the number of redemption rows even if side effects run twice", async () => {
    const pending = await pendingOrder("WITHPAROS");
    vi.mocked(confirmTossPayment).mockResolvedValue(tossApproval("pk_1", pending.orderNumber, pending.amount));
    await confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount });
    expect((await db.query.coupons.findFirst({ where: eq(coupons.code, "WITHPAROS") }))?.usedCount).toBe(1);

    // 부수효과 batch 를 한 번 더 돌려도(중복 실행) 적립 행은 1개, usedCount 도 행 수 기준이라 1 이다.
    await db.update(orders).set({ status: "pending" }).where(eq(orders.id, pending.orderId));
    const order = await db.query.orders.findFirst({ where: eq(orders.id, pending.orderId), with: { items: true } });
    await applyPaidTransition(
      order!,
      { paymentKey: "pk_1", method: "카드", totalAmount: pending.amount, approvedAt: null },
      { source: "test", actor: "system" },
    );
    expect(await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, pending.orderId))).toHaveLength(1);
    expect((await db.query.coupons.findFirst({ where: eq(coupons.code, "WITHPAROS") }))?.usedCount).toBe(1);
  });

  it("does not mark the order paid when Toss reports a non-DONE status (virtual account waiting for deposit)", async () => {
    const pending = await pendingOrder("WITHPAROS");
    vi.mocked(confirmTossPayment).mockResolvedValue({
      ...tossApproval("pk_va", pending.orderNumber, pending.amount),
      status: "WAITING_FOR_DEPOSIT",
      method: "가상계좌",
      approvedAt: null,
    });

    await expect(
      confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_va", amount: pending.amount }),
    ).rejects.toMatchObject({ code: "PAYMENT_NOT_DONE" });

    const order = await db.query.orders.findFirst({ where: eq(orders.id, pending.orderId), with: { items: true } });
    expect(order?.status).toBe("pending");
    // 선점은 유지된다 (입금 후 같은 paymentKey 로 확정 가능, cron 만료 대상 제외).
    expect(order?.paymentKey).toBe("pk_va");
    expect(order?.failReason).toBe("PAYMENT_NOT_DONE:WAITING_FOR_DEPOSIT");
    expect(order?.items[0].stockDeducted).toBe(false);
    expect(await variantStock("PAROS-DS-50-1")).toBe(2_000);
    expect((await db.query.coupons.findFirst({ where: eq(coupons.code, "WITHPAROS") }))?.usedCount).toBe(0);
    expect(clearCart).not.toHaveBeenCalled();
  });

  it("auto-refunds and cancels the order when stock ran out between checkout and capture (oversell)", async () => {
    const pending = await pendingOrder("WITHPAROS");
    await db.update(variants).set({ stock: 1 }).where(eq(variants.sku, "PAROS-DS-50-1"));
    vi.mocked(confirmTossPayment).mockResolvedValue(tossApproval("pk_1", pending.orderNumber, pending.amount));
    vi.mocked(cancelTossPayment).mockResolvedValue({ paymentKey: "pk_1", status: "CANCELED", cancelledAmount: pending.amount, alreadyCancelled: false });

    const result = await confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount });

    expect(result.status).toBe("cancelled");
    expect(result.confirmedNow).toBe(false);
    expect(cancelTossPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentKey: "pk_1", idempotencyKey: `cancel-${pending.orderNumber}-oversold` }),
    );
    const order = await db.query.orders.findFirst({ where: eq(orders.id, pending.orderId), with: { items: true } });
    expect(order?.status).toBe("cancelled");
    expect(order?.failReason).toBe("OVERSOLD");
    expect(order?.adminMemo).toContain("재고 소진");
    expect(order?.items[0].stockDeducted).toBe(false);
    expect(await variantStock("PAROS-DS-50-1")).toBe(1);
    // 쿠폰도 돌려준다.
    expect((await db.query.coupons.findFirst({ where: eq(coupons.code, "WITHPAROS") }))?.usedCount).toBe(0);
    expect(await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, pending.orderId))).toHaveLength(0);
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, pending.orderId));
    expect(events.map((e) => `${e.fromStatus}>${e.toStatus}:${e.reason}`)).toEqual(["pending>paid:", "paid>cancelled:OVERSOLD"]);
  });

  it("keeps the order paid for manual handling when the oversell refund fails", async () => {
    const pending = await pendingOrder();
    await db.update(variants).set({ stock: 1 }).where(eq(variants.sku, "PAROS-DS-50-1"));
    vi.mocked(confirmTossPayment).mockResolvedValue(tossApproval("pk_1", pending.orderNumber, pending.amount));
    vi.mocked(cancelTossPayment).mockRejectedValue(new TossPaymentError("PROVIDER_ERROR", "일시 오류", 500));

    const result = await confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount });

    expect(result.status).toBe("paid");
    expect(await variantStock("PAROS-DS-50-1")).toBe(1);
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, pending.orderId));
    expect(items[0].stockDeducted).toBe(false);
  });

  it("records a pending→paid event on a normal confirmation", async () => {
    const pending = await pendingOrder();
    vi.mocked(confirmTossPayment).mockResolvedValue(tossApproval("pk_1", pending.orderNumber, pending.amount));
    await confirmOrder({ orderNumber: pending.orderNumber, paymentKey: "pk_1", amount: pending.amount });
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, pending.orderId));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromStatus: "pending", toStatus: "paid", actor: "customer", source: "confirm" });
  });
});

describe("failOrder", () => {
  it("cancels a pending order that has not been claimed and keeps the failure reason", async () => {
    vi.mocked(getCart).mockResolvedValue(await cartOf([{ sku: "PAROS-DS-50-1", qty: 1 }]));
    const pending = await createPendingOrder(INPUT);

    const row = await failOrder({ orderNumber: pending.orderNumber, code: "PAY_PROCESS_CANCELED", message: "사용자 취소" });

    expect(row?.status).toBe("cancelled");
    expect(row?.failReason).toBe("PAY_PROCESS_CANCELED: 사용자 취소");
    expect(row?.cancelledAt).toBeInstanceOf(Date);
  });

  it("does not cancel a pending order whose payment is being confirmed", async () => {
    vi.mocked(getCart).mockResolvedValue(await cartOf([{ sku: "PAROS-DS-50-1", qty: 1 }]));
    const pending = await createPendingOrder(INPUT);
    await db.update(orders).set({ paymentKey: "pk_inflight" }).where(eq(orders.id, pending.orderId));

    const row = await failOrder({ orderNumber: pending.orderNumber });

    expect(row?.status).toBe("pending");
    expect(row?.paymentKey).toBe("pk_inflight");
  });

  it("returns null for an unknown order number", async () => {
    expect(await failOrder({ orderNumber: "PR-20260909-ZZZZZZ" })).toBeNull();
  });
});
