import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import type { Database } from "@/db/client";
import { cartItems, carts, orderEvents, orders, rateLimits, sessions, users, variants } from "@/db/schema";
import {
  expireStalePendingOrders,
  findStuckPaymentClaims,
  GUEST_CART_TTL_MS,
  PENDING_ORDER_TTL_MS,
  purgeAbandonedGuestCarts,
  purgeExpiredRateLimits,
  purgeExpiredSessions,
  STUCK_CLAIM_ALERT_WINDOW_MS,
  STUCK_CLAIM_TTL_MS,
} from "@/lib/order-maintenance";
import { withTestDb } from "../helpers/db";

const NOW = new Date("2026-09-09T12:00:00Z");
const HOUR = 60 * 60 * 1000;

let client: Client | undefined;

afterEach(() => {
  client?.close();
  client = undefined;
});

async function insertOrder(
  db: Database,
  overrides: Partial<typeof orders.$inferInsert> & { orderNumber: string },
) {
  const [row] = await db
    .insert(orders)
    .values({
      email: "buyer@example.com",
      customerName: "홍길동",
      phone: "01012345678",
      recipientName: "홍길동",
      recipientPhone: "01012345678",
      postalCode: "04001",
      address1: "서울특별시 마포구",
      subtotalKrw: 32_000,
      totalKrw: 35_000,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    })
    .returning();
  return row;
}

describe("expireStalePendingOrders", () => {
  it("cancels only unclaimed pending orders older than the TTL", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    const old = new Date(NOW.getTime() - PENDING_ORDER_TTL_MS - HOUR);
    await insertOrder(db, { orderNumber: "PR-1-STALE", createdAt: old });
    await insertOrder(db, { orderNumber: "PR-2-FRESH", createdAt: new Date(NOW.getTime() - HOUR) });
    await insertOrder(db, { orderNumber: "PR-3-CLAIMED", createdAt: old, paymentKey: "pk_inflight" });
    await insertOrder(db, { orderNumber: "PR-4-PAID", createdAt: old, status: "paid", paymentKey: "pk_paid" });

    const result = await expireStalePendingOrders(db, { now: NOW });

    expect(result.expired).toEqual(["PR-1-STALE"]);
    const stale = await db.query.orders.findFirst({ where: eq(orders.orderNumber, "PR-1-STALE") });
    expect(stale).toMatchObject({ status: "cancelled", failReason: "EXPIRED" });
    expect(stale?.cancelledAt?.getTime()).toBe(NOW.getTime());
    for (const n of ["PR-2-FRESH", "PR-3-CLAIMED"]) {
      const row = await db.query.orders.findFirst({ where: eq(orders.orderNumber, n) });
      expect(row?.status).toBe("pending");
    }
    const paid = await db.query.orders.findFirst({ where: eq(orders.orderNumber, "PR-4-PAID") });
    expect(paid?.status).toBe("paid");
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, stale!.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromStatus: "pending", toStatus: "cancelled", actor: "system", reason: "EXPIRED", source: "cron" });
  });

  it("is a no-op when nothing qualifies", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    expect(await expireStalePendingOrders(db, { now: NOW })).toEqual({ expired: [] });
  });
});

describe("findStuckPaymentClaims", () => {
  it("lists pending orders that still hold a paymentKey past the claim TTL", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    const stuckAt = new Date(NOW.getTime() - STUCK_CLAIM_TTL_MS - 30 * 60 * 1000);
    await insertOrder(db, { orderNumber: "PR-STUCK", paymentKey: "pk_stuck", updatedAt: stuckAt });
    await insertOrder(db, { orderNumber: "PR-RECENT", paymentKey: "pk_recent", updatedAt: new Date(NOW.getTime() - 5 * 60 * 1000) });
    await insertOrder(db, { orderNumber: "PR-NOKEY", updatedAt: stuckAt });

    const stuck = await findStuckPaymentClaims(db, { now: NOW });

    expect(stuck.alerts).toEqual([{ orderNumber: "PR-STUCK", paymentKey: "pk_stuck", ageMinutes: 90 }]);
    expect(stuck.stuckTotal).toBe(1);
    expect(stuck.awaitingConfirmation).toBe(0);
  });

  it("stops alerting for a claim once it is older than the alert window but keeps counting it", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    const old = new Date(NOW.getTime() - STUCK_CLAIM_TTL_MS - STUCK_CLAIM_ALERT_WINDOW_MS - HOUR);
    await insertOrder(db, { orderNumber: "PR-OLD-STUCK", paymentKey: "pk_old", updatedAt: old });

    const stuck = await findStuckPaymentClaims(db, { now: NOW });

    expect(stuck.alerts).toEqual([]);
    expect(stuck.stuckTotal).toBe(1);
  });

  it("counts deposit-waiting orders separately instead of alerting", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    const stuckAt = new Date(NOW.getTime() - STUCK_CLAIM_TTL_MS - 30 * 60 * 1000);
    await insertOrder(db, {
      orderNumber: "PR-VA",
      paymentKey: "pk_va",
      updatedAt: stuckAt,
      failReason: "PAYMENT_NOT_DONE:WAITING_FOR_DEPOSIT",
    });

    const stuck = await findStuckPaymentClaims(db, { now: NOW });

    expect(stuck.alerts).toEqual([]);
    expect(stuck.stuckTotal).toBe(0);
    expect(stuck.awaitingConfirmation).toBe(1);
  });
});

describe("purgeExpiredRateLimits", () => {
  it("deletes only counters whose window has passed", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    await db.insert(rateLimits).values([
      { key: "login:1.1.1.1", count: 3, resetAt: new Date(NOW.getTime() - 1000) },
      { key: "login:2.2.2.2", count: 1, resetAt: new Date(NOW.getTime() + 60_000) },
    ]);

    expect(await purgeExpiredRateLimits(db, NOW)).toBe(1);
    const remaining = await db.select().from(rateLimits);
    expect(remaining.map((r) => r.key)).toEqual(["login:2.2.2.2"]);
  });
});

describe("purgeExpiredSessions", () => {
  it("removes only sessions whose expiry has passed", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    const [user] = await db.insert(users).values({ email: "u@example.com", passwordHash: "x", name: "u" }).returning();
    await db.insert(sessions).values([
      { token: "expired", userId: user.id, expiresAt: new Date(NOW.getTime() - 1000) },
      { token: "live", userId: user.id, expiresAt: new Date(NOW.getTime() + HOUR) },
    ]);

    expect(await purgeExpiredSessions(db, NOW)).toBe(1);
    expect((await db.select().from(sessions)).map((s) => s.token)).toEqual(["live"]);
  });
});

describe("purgeAbandonedGuestCarts", () => {
  it("deletes stale guest carts with their items but keeps member carts and fresh guest carts", async () => {
    const { db, client: c } = await withTestDb({ seed: true });
    client = c;
    const [user] = await db.insert(users).values({ email: "m@example.com", passwordHash: "x", name: "m" }).returning();
    const variant = await db.query.variants.findFirst({ where: eq(variants.sku, "PAROS-DS-50-1") });
    const stale = new Date(NOW.getTime() - GUEST_CART_TTL_MS - HOUR);
    await db.insert(carts).values([
      { id: "guest-stale", userId: null, createdAt: stale, updatedAt: stale },
      { id: "guest-fresh", userId: null, createdAt: NOW, updatedAt: NOW },
      { id: "member-stale", userId: user.id, createdAt: stale, updatedAt: stale },
    ]);
    await db.insert(cartItems).values({ cartId: "guest-stale", variantId: variant!.id, qty: 1 });

    expect(await purgeAbandonedGuestCarts(db, { now: NOW })).toBe(1);
    expect((await db.select().from(carts)).map((r) => r.id).sort()).toEqual(["guest-fresh", "member-stale"]);
    expect(await db.select().from(cartItems)).toHaveLength(0);
  });
});
