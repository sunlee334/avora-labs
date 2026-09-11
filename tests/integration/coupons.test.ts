import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { couponRedemptions, coupons, orders, users } from "@/db/schema";
import { resolveCoupon } from "@/lib/coupons";
import { installTestDb, uninstallTestDb } from "../helpers/db";

let db: Database;

async function setCoupon(patch: Partial<typeof coupons.$inferInsert>) {
  await db.update(coupons).set(patch).where(eq(coupons.code, "WITHPAROS"));
}

async function redeemedBy(email: string, userId: number | null = null) {
  const coupon = await db.query.coupons.findFirst({ where: eq(coupons.code, "WITHPAROS") });
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `PR-20260909-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      status: "paid",
      email,
      userId,
      customerName: "x",
      phone: "x",
      recipientName: "x",
      recipientPhone: "x",
      postalCode: "x",
      address1: "x",
      subtotalKrw: 32_000,
      totalKrw: 32_000,
    })
    .returning();
  await db.insert(couponRedemptions).values({ couponId: coupon!.id, orderId: order.id, userId, email });
}

beforeEach(async () => {
  ({ db } = await installTestDb({ seed: true }));
});

afterEach(() => {
  uninstallTestDb();
});

describe("resolveCoupon", () => {
  it("accepts the seeded code regardless of case and surrounding whitespace", async () => {
    const result = await resolveCoupon("  withParos ", { email: "a@example.com", subtotalKrw: 32_000 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.coupon).toMatchObject({ code: "WITHPAROS", type: "free_shipping" });
  });

  it("members-only coupons are refused for guests and accepted for members", async () => {
    await setCoupon({ membersOnly: true });
    expect(await resolveCoupon("WITHPAROS", { email: "guest@example.com", subtotalKrw: 32_000 })).toEqual({ ok: false, code: "membersOnly" });
    const [user] = await db.insert(users).values({ email: "member@example.com", passwordHash: "x", name: "회원" }).returning();
    const result = await resolveCoupon("WITHPAROS", { userId: user.id, email: user.email, subtotalKrw: 32_000 });
    expect(result.ok).toBe(true);
  });

  it("rejects an empty, unknown or inactive code", async () => {
    expect(await resolveCoupon("   ")).toEqual({ ok: false, code: "enter" });
    expect(await resolveCoupon("NOPE")).toEqual({ ok: false, code: "invalid" });
    await setCoupon({ isActive: false });
    expect(await resolveCoupon("WITHPAROS")).toEqual({ ok: false, code: "invalid" });
  });

  it("enforces the validity window", async () => {
    await setCoupon({ startsAt: new Date(Date.now() + 86_400_000) });
    expect(await resolveCoupon("WITHPAROS")).toMatchObject({ ok: false, code: "notYet" });

    await setCoupon({ startsAt: null, endsAt: new Date(Date.now() - 86_400_000) });
    expect(await resolveCoupon("WITHPAROS")).toMatchObject({ ok: false, code: "expired" });
  });

  it("stops at the global usage limit", async () => {
    await setCoupon({ maxUses: 2, usedCount: 2 });
    expect(await resolveCoupon("WITHPAROS")).toMatchObject({ ok: false, code: "exhausted" });

    await setCoupon({ maxUses: 3 });
    expect((await resolveCoupon("WITHPAROS")).ok).toBe(true);
  });

  it("applies the per-user limit by email for guests and by user id or email for members", async () => {
    await redeemedBy("guest@example.com");
    expect(await resolveCoupon("WITHPAROS", { email: "Guest@Example.com" })).toMatchObject({
      ok: false,
      code: "used",
    });
    expect((await resolveCoupon("WITHPAROS", { email: "other@example.com" })).ok).toBe(true);

    const [member] = await db
      .insert(users)
      .values({ email: "member@example.com", passwordHash: "x", name: "회원" })
      .returning();
    await redeemedBy("member@example.com", member.id);
    expect((await resolveCoupon("WITHPAROS", { userId: member.id, email: "new-mail@example.com" })).ok).toBe(false);
    expect((await resolveCoupon("WITHPAROS", { email: "member@example.com" })).ok).toBe(false);
  });

  it("allows repeated use when perUserLimit is 0 or when no identity is known", async () => {
    await redeemedBy("guest@example.com");
    expect((await resolveCoupon("WITHPAROS")).ok).toBe(true);

    await setCoupon({ perUserLimit: 0 });
    expect((await resolveCoupon("WITHPAROS", { email: "guest@example.com" })).ok).toBe(true);
  });

  it("requires the minimum subtotal and returns the amount", async () => {
    await setCoupon({ minSubtotalKrw: 50_000 });
    expect(await resolveCoupon("WITHPAROS", { subtotalKrw: 32_000 })).toMatchObject({
      ok: false,
      code: "minSubtotal",
      minSubtotalKrw: 50_000,
    });
    expect((await resolveCoupon("WITHPAROS", { subtotalKrw: 50_000 })).ok).toBe(true);
    // 금액을 넘기지 않으면 금액 조건은 건너뛴다 (장바구니 밖 코드 확인용).
    expect((await resolveCoupon("WITHPAROS")).ok).toBe(true);
  });
});
