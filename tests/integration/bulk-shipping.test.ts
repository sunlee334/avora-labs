import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { notifications, orderEvents, orders } from "@/db/schema";
import { bulkMarkShipped } from "@/lib/shipping";
import { installTestDb, uninstallTestDb } from "../helpers/db";

let db: Database;

async function insertOrder(orderNumber: string, status: "paid" | "preparing" | "delivered") {
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber,
      status,
      email: "buyer@example.com",
      customerName: "홍길동",
      phone: "01012345678",
      recipientName: "홍길동",
      recipientPhone: "01012345678",
      postalCode: "04001",
      address1: "서울특별시 마포구",
      subtotalKrw: 32_000,
      totalKrw: 32_000,
      paymentKey: "pk_test",
      paymentMethod: "카드",
      paidAt: new Date(),
    })
    .returning();
  return order;
}

beforeEach(async () => {
  ({ db } = await installTestDb({ seed: true }));
});

afterEach(() => {
  uninstallTestDb();
});

describe("bulkMarkShipped (송장 CSV 일괄 등록)", () => {
  it("ships paid/preparing orders with tracking, records events, queues notifications, and skips the rest", async () => {
    await insertOrder("PR-20260912-AAAAAA", "paid");
    await insertOrder("PR-20260912-BBBBBB", "preparing");
    await insertOrder("PR-20260912-CCCCCC", "delivered");
    const now = new Date("2026-09-12T05:00:00Z");

    const result = await bulkMarkShipped(
      [
        { line: 2, orderNumber: "PR-20260912-AAAAAA", carrier: null, trackingNumber: "1111" },
        { line: 3, orderNumber: "PR-20260912-BBBBBB", carrier: "한진", trackingNumber: "2222" },
        { line: 4, orderNumber: "PR-20260912-CCCCCC", carrier: null, trackingNumber: "3333" },
        { line: 5, orderNumber: "PR-20260912-ZZZZZZ", carrier: null, trackingNumber: "4444" },
        { line: 6, orderNumber: "NOT-AN-ORDER", carrier: null, trackingNumber: "5555" },
        { line: 7, orderNumber: "PR-20260912-AAAAAA", carrier: null, trackingNumber: "6666" },
        { line: 8, orderNumber: "PR-20260912-BBBBBB", carrier: "듣도보도못한택배", trackingNumber: "7777" },
      ],
      { now, source: "admin-csv" },
    );

    expect(result.applied).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.skipped.map((s) => [s.line, s.orderNumber])).toEqual([
      [4, "PR-20260912-CCCCCC"],
      [5, "PR-20260912-ZZZZZZ"],
      [6, "NOT-AN-ORDER"],
      [7, "PR-20260912-AAAAAA"],
      [8, "PR-20260912-BBBBBB"],
    ]);
    expect(result.skipped[0].reason).toContain("delivered");
    expect(result.skipped[1].reason).toContain("찾을 수");
    expect(result.skipped[2].reason).toContain("형식");
    expect(result.skipped[3].reason).toContain("중복");

    const a = await db.query.orders.findFirst({ where: eq(orders.orderNumber, "PR-20260912-AAAAAA") });
    const b = await db.query.orders.findFirst({ where: eq(orders.orderNumber, "PR-20260912-BBBBBB") });
    const c = await db.query.orders.findFirst({ where: eq(orders.orderNumber, "PR-20260912-CCCCCC") });
    expect(a).toMatchObject({ status: "shipped", trackingCarrier: "CJ대한통운", trackingNumber: "1111" });
    expect(a?.shippedAt?.toISOString()).toBe(now.toISOString());
    expect(b).toMatchObject({ status: "shipped", trackingCarrier: "한진", trackingNumber: "2222" });
    expect(c).toMatchObject({ status: "delivered", trackingNumber: null });

    const events = await db.query.orderEvents.findMany({ where: eq(orderEvents.toStatus, "shipped") });
    expect(events.map((e) => [e.orderId, e.fromStatus, e.actor, e.source, e.reason]).sort()).toEqual(
      [
        [a!.id, "paid", "admin", "admin-csv", "CJ대한통운 1111"],
        [b!.id, "preparing", "admin", "admin-csv", "한진 2222"],
      ].sort(),
    );

    const queued = await db.query.notifications.findMany({ where: eq(notifications.template, "shipped") });
    expect(queued.map((n) => n.orderId).sort()).toEqual([a!.id, b!.id].sort());
  });
});
