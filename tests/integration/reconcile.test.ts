import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { orderEvents, orderItems, orders, variants, type Order } from "@/db/schema";
import { installTestDb, uninstallTestDb } from "../helpers/db";

vi.mock("@/lib/cart", () => ({ getCart: vi.fn(), clearCart: vi.fn(async () => {}) }));
vi.mock("@/lib/payments/toss", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/toss")>();
  return {
    ...actual,
    confirmTossPayment: vi.fn(),
    cancelTossPayment: vi.fn(),
    getTossPayment: vi.fn(),
    getTossPaymentByOrderId: vi.fn(),
    listTossTransactions: vi.fn(),
  };
});

import {
  reconcileOrderWithToss,
  reconcilePendingClaims,
  reconcileRecentTransactions,
} from "@/lib/payments/reconcile";
import {
  cancelTossPayment,
  getTossPayment,
  getTossPaymentByOrderId,
  listTossTransactions,
  type TossPaymentSnapshot,
} from "@/lib/payments/toss";

let db: Database;

function snapshot(partial: Partial<TossPaymentSnapshot> & { status: string }): TossPaymentSnapshot {
  return {
    paymentKey: "pk_x",
    orderId: "PR-20260910-AAAAAA",
    method: "카드",
    totalAmount: 32_000,
    balanceAmount: partial.status === "CANCELED" ? 0 : 32_000,
    approvedAt: "2026-09-10T10:00:00+09:00",
    cancels: [],
    ...partial,
  };
}

async function order(
  overrides: Partial<typeof orders.$inferInsert> = {},
  line: { qty: number; stockDeducted: boolean } = { qty: 1, stockDeducted: false },
): Promise<Order> {
  const variant = await db.query.variants.findFirst({ where: eq(variants.sku, "PAROS-DS-50-1"), with: { product: true } });
  const [row] = await db
    .insert(orders)
    .values({
      orderNumber: `PR-20260910-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      status: "pending",
      email: "buyer@example.com",
      customerName: "홍길동",
      phone: "01012345678",
      recipientName: "홍길동",
      recipientPhone: "01012345678",
      postalCode: "04001",
      address1: "서울특별시 마포구",
      subtotalKrw: 32_000,
      totalKrw: 32_000,
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      ...overrides,
    })
    .returning();
  await db.insert(orderItems).values({
    orderId: row.id,
    productId: variant!.productId,
    variantId: variant!.id,
    productName: variant!.product.name,
    variantName: variant!.name,
    unitsPerPack: 1,
    unitPriceKrw: 32_000,
    qty: line.qty,
    lineTotalKrw: 32_000 * line.qty,
    stockDeducted: line.stockDeducted,
  });
  if (line.stockDeducted) {
    await db.update(variants).set({ stock: variant!.stock - line.qty }).where(eq(variants.id, variant!.id));
  }
  return row;
}

async function stock(): Promise<number> {
  return (await db.query.variants.findFirst({ where: eq(variants.sku, "PAROS-DS-50-1") }))!.stock;
}

beforeEach(async () => {
  ({ db } = await installTestDb({ seed: true }));
  vi.mocked(getTossPayment).mockReset();
  vi.mocked(getTossPaymentByOrderId).mockReset();
  vi.mocked(listTossTransactions).mockReset();
  vi.mocked(cancelTossPayment).mockReset();
});

afterEach(() => {
  uninstallTestDb();
});

describe("reconcileOrderWithToss", () => {
  it("marks a pending order paid (with stock and event) when Toss reports DONE", async () => {
    const row = await order({ paymentKey: "pk_x", failReason: "PAYMENT_NOT_DONE:WAITING_FOR_DEPOSIT" });
    vi.mocked(getTossPayment).mockResolvedValue(snapshot({ status: "DONE", orderId: row.orderNumber, method: "가상계좌" }));

    const result = await reconcileOrderWithToss(row.orderNumber, { source: "webhook" });

    expect(result.outcome).toBe("marked_paid");
    const updated = await db.query.orders.findFirst({ where: eq(orders.id, row.id), with: { items: true } });
    expect(updated).toMatchObject({ status: "paid", paymentMethod: "가상계좌", failReason: null });
    expect(updated?.items[0].stockDeducted).toBe(true);
    expect(await stock()).toBe(1_999);
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, row.id));
    expect(events[0]).toMatchObject({ fromStatus: "pending", toStatus: "paid", actor: "toss", source: "webhook" });
  });

  it("is a no-op when Toss and the order already agree", async () => {
    const row = await order({ status: "paid", paymentKey: "pk_x", paidAt: new Date() }, { qty: 1, stockDeducted: true });
    vi.mocked(getTossPayment).mockResolvedValue(snapshot({ status: "DONE", orderId: row.orderNumber }));

    expect((await reconcileOrderWithToss(row.orderNumber, { source: "cron" })).outcome).toBe("in_sync");
    expect(await stock()).toBe(1_999);
    expect(await db.select().from(orderEvents)).toHaveLength(0);
  });

  it("cancels a paid order and restores stock when Toss reports the payment was cancelled elsewhere", async () => {
    const row = await order({ status: "paid", paymentKey: "pk_x", paidAt: new Date() }, { qty: 1, stockDeducted: true });
    vi.mocked(getTossPayment).mockResolvedValue(snapshot({ status: "CANCELED", orderId: row.orderNumber }));

    const result = await reconcileOrderWithToss(row.orderNumber, { source: "daily" });

    expect(result.outcome).toBe("cancelled");
    expect(cancelTossPayment).not.toHaveBeenCalled();
    const updated = await db.query.orders.findFirst({ where: eq(orders.id, row.id) });
    expect(updated?.status).toBe("cancelled");
    expect(updated?.adminMemo).toContain("[토스]");
    expect(await stock()).toBe(2_000);
  });

  it("refunds (without restocking) a shipped order that was cancelled at Toss", async () => {
    const row = await order({ status: "shipped", paymentKey: "pk_x", paidAt: new Date(), shippedAt: new Date() }, { qty: 1, stockDeducted: true });
    vi.mocked(getTossPayment).mockResolvedValue(snapshot({ status: "CANCELED", orderId: row.orderNumber }));

    const result = await reconcileOrderWithToss(row.orderNumber, { source: "webhook" });

    expect(result.outcome).toBe("refunded");
    expect((await db.query.orders.findFirst({ where: eq(orders.id, row.id) }))?.status).toBe("refunded");
    expect(await stock()).toBe(1_999);
  });

  it("closes a pending order when Toss says the payment expired", async () => {
    const row = await order({ paymentKey: "pk_x" });
    vi.mocked(getTossPayment).mockResolvedValue(snapshot({ status: "EXPIRED", orderId: row.orderNumber }));

    expect((await reconcileOrderWithToss(row.orderNumber, { source: "cron" })).outcome).toBe("expired");
    const updated = await db.query.orders.findFirst({ where: eq(orders.id, row.id) });
    expect(updated).toMatchObject({ status: "cancelled", failReason: "TOSS_EXPIRED" });
  });

  it("leaves a pending order alone while Toss is still waiting, and falls back to lookup by orderId", async () => {
    const row = await order({ paymentKey: null });
    vi.mocked(getTossPaymentByOrderId).mockResolvedValue(snapshot({ status: "WAITING_FOR_DEPOSIT", orderId: row.orderNumber }));

    expect((await reconcileOrderWithToss(row.orderNumber, { source: "cron" })).outcome).toBe("waiting");
    expect(getTossPayment).not.toHaveBeenCalled();
    expect((await db.query.orders.findFirst({ where: eq(orders.id, row.id) }))?.status).toBe("pending");
  });

  it("refunds a closed order whose money is still captured at Toss, and flags it when the refund fails", async () => {
    const row = await order({ status: "cancelled", paymentKey: "pk_x", cancelledAt: new Date() });
    vi.mocked(getTossPayment).mockResolvedValue(snapshot({ status: "DONE", orderId: row.orderNumber, balanceAmount: 32_000 }));
    vi.mocked(cancelTossPayment).mockResolvedValueOnce({ paymentKey: "pk_x", status: "CANCELED", cancelledAmount: 32_000, alreadyCancelled: false });

    const ok = await reconcileOrderWithToss(row.orderNumber, { source: "daily" });
    expect(ok).toMatchObject({ outcome: "cancelled", detail: "captured_on_closed_refunded" });
    expect(cancelTossPayment).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `cancel-${row.orderNumber}-closed` }));
    expect((await db.query.orders.findFirst({ where: eq(orders.id, row.id) }))?.status).toBe("cancelled");

    vi.mocked(cancelTossPayment).mockRejectedValueOnce(new Error("network"));
    const failed = await reconcileOrderWithToss(row.orderNumber, { source: "daily" });
    expect(failed).toMatchObject({ outcome: "needs_attention", detail: "captured_but_order_closed" });
  });

  it("reports no_payment when Toss has nothing for the order", async () => {
    const row = await order({ paymentKey: "pk_x" });
    vi.mocked(getTossPayment).mockResolvedValue(null);
    vi.mocked(getTossPaymentByOrderId).mockResolvedValue(null);
    expect((await reconcileOrderWithToss(row.orderNumber, { source: "admin" })).outcome).toBe("no_payment");
    expect((await reconcileOrderWithToss("PR-20260910-ZZZZZZ", { source: "admin" })).outcome).toBe("not_found");
  });
});

describe("reconcilePendingClaims", () => {
  it("only touches pending orders that hold a paymentKey and have been idle long enough", async () => {
    const stale = await order({ paymentKey: "pk_stale" });
    await order({ paymentKey: "pk_fresh", updatedAt: new Date() });
    await order({ paymentKey: null });
    vi.mocked(getTossPayment).mockImplementation(async (key) =>
      key === "pk_stale" ? snapshot({ status: "DONE", paymentKey: key, orderId: stale.orderNumber }) : null,
    );

    const summary = await reconcilePendingClaims();

    expect(summary.checked).toBe(1);
    expect(summary.changed.map((r) => r.outcome)).toEqual(["marked_paid"]);
    expect(getTossPayment).toHaveBeenCalledTimes(1);
  });
});

describe("reconcileRecentTransactions", () => {
  it("reconciles only the orders whose Toss status disagrees with the DB", async () => {
    const paidAtToss = await order({ paymentKey: "pk_a" });
    const cancelledAtToss = await order({ status: "paid", paymentKey: "pk_b", paidAt: new Date() }, { qty: 1, stockDeducted: true });
    const inSync = await order({ status: "paid", paymentKey: "pk_c", paidAt: new Date() }, { qty: 1, stockDeducted: true });
    vi.mocked(listTossTransactions).mockResolvedValue({
      truncated: false,
      transactions: [
        { transactionKey: "t1", paymentKey: "pk_a", orderId: paidAtToss.orderNumber, status: "DONE", transactionAt: "2026-09-10T10:00:00+09:00", amount: 32_000 },
        // 취소 거래가 승인 거래보다 먼저 와도 시각이 늦은 취소가 현재 상태다.
        { transactionKey: "t2b", paymentKey: "pk_b", orderId: cancelledAtToss.orderNumber, status: "CANCELED", transactionAt: "2026-09-10T11:00:00+09:00", amount: 32_000 },
        { transactionKey: "t2a", paymentKey: "pk_b", orderId: cancelledAtToss.orderNumber, status: "DONE", transactionAt: "2026-09-10T10:30:00+09:00", amount: 32_000 },
        { transactionKey: "t3", paymentKey: "pk_c", orderId: inSync.orderNumber, status: "DONE", transactionAt: "2026-09-10T10:00:00+09:00", amount: 32_000 },
        { transactionKey: "t4", paymentKey: "pk_other", orderId: "PR-20260910-OTHER1", status: "DONE", transactionAt: "2026-09-10T10:00:00+09:00", amount: 1 },
      ],
    });
    vi.mocked(getTossPayment).mockImplementation(async (key) => {
      if (key === "pk_a") return snapshot({ status: "DONE", paymentKey: key, orderId: paidAtToss.orderNumber });
      if (key === "pk_b") return snapshot({ status: "CANCELED", paymentKey: key, orderId: cancelledAtToss.orderNumber });
      return null;
    });

    const summary = await reconcileRecentTransactions();

    expect(summary.checked).toBe(3);
    expect(summary.changed.map((r) => `${r.orderNumber}:${r.outcome}`).sort()).toEqual(
      [`${paidAtToss.orderNumber}:marked_paid`, `${cancelledAtToss.orderNumber}:cancelled`].sort(),
    );
    expect(getTossPayment).toHaveBeenCalledTimes(2);
    expect((await db.query.orders.findFirst({ where: eq(orders.id, inSync.id) }))?.status).toBe("paid");
  });
});
