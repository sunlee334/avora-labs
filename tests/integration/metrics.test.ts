import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { couponRedemptions, coupons, orderItems, orders, products, users } from "@/db/schema";
import type { OrderStatus } from "@/lib/config";
import { customerSegment, loadSegmentsForUsers } from "@/lib/segments";
import { kstMonthStart, monthlySeries, repurchaseRate, repurchaseRateAllTime, salesSummary } from "@/lib/metrics";
import { installTestDb, uninstallTestDb } from "../helpers/db";

let db: Database;
let single: { id: number; productId: number; priceKrw: number; unitsPerPack: number };
let set: { id: number; productId: number; priceKrw: number; unitsPerPack: number };
let seq = 0;

async function user(email: string) {
  const [u] = await db.insert(users).values({ email, passwordHash: "x", name: email.split("@")[0] }).returning();
  return u;
}

async function order(input: {
  email: string;
  userId?: number | null;
  status?: OrderStatus;
  lines: { variant: typeof single; qty: number }[];
  paidAt?: Date;
}) {
  seq += 1;
  const subtotal = input.lines.reduce((sum, l) => sum + l.variant.priceKrw * l.qty, 0);
  const [o] = await db
    .insert(orders)
    .values({
      orderNumber: `PR-20260912-${String(seq).padStart(6, "0")}`,
      status: input.status ?? "paid",
      email: input.email,
      userId: input.userId ?? null,
      customerName: "x",
      phone: "x",
      recipientName: "x",
      recipientPhone: "x",
      postalCode: "x",
      address1: "x",
      subtotalKrw: subtotal,
      totalKrw: subtotal,
      paidAt: input.paidAt ?? new Date("2026-09-10T03:00:00Z"),
    })
    .returning();
  for (const l of input.lines) {
    await db.insert(orderItems).values({
      orderId: o.id,
      productId: l.variant.productId,
      variantId: l.variant.id,
      productName: "PAROS Daily Sunscreen",
      variantName: l.variant.unitsPerPack > 1 ? "2개 세트" : "본품",
      unitsPerPack: l.variant.unitsPerPack,
      unitPriceKrw: l.variant.priceKrw,
      qty: l.qty,
      lineTotalKrw: l.variant.priceKrw * l.qty,
    });
  }
  return o;
}

beforeEach(async () => {
  ({ db } = await installTestDb({ seed: true }));
  const product = await db.query.products.findFirst({ where: eq(products.slug, "daily-sunscreen"), with: { variants: true } });
  const pick = (units: number) => {
    const v = product!.variants.find((x) => x.unitsPerPack === units)!;
    return { id: v.id, productId: product!.id, priceKrw: v.priceKrw, unitsPerPack: v.unitsPerPack };
  };
  single = pick(1);
  set = pick(2);
  seq = 0;
});

afterEach(() => {
  uninstallTestDb();
});

describe("salesSummary / monthlySeries", () => {
  it("counts units as qty × unitsPerPack, revenue from paid+ orders only, and set share per order", async () => {
    const a = await user("a@example.com");
    await order({ email: a.email, userId: a.id, lines: [{ variant: single, qty: 1 }] }); // 1개
    await order({ email: a.email, userId: a.id, lines: [{ variant: set, qty: 2 }] }); // 4개, 세트 주문
    await order({ email: "g@example.com", lines: [{ variant: single, qty: 3 }], status: "shipped" }); // 3개
    await order({ email: "c@example.com", lines: [{ variant: set, qty: 1 }], status: "cancelled" }); // 제외
    await order({ email: "p@example.com", lines: [{ variant: single, qty: 1 }], status: "pending" }); // 제외

    const s = await salesSummary();
    expect(s.orders).toBe(3);
    expect(s.units).toBe(1 + 4 + 3);
    expect(s.revenueKrw).toBe(32_000 + 56_000 * 2 + 32_000 * 3);
    expect(s.setOrders).toBe(1);
    expect(s.setShare).toBeCloseTo(1 / 3);

    // 기간 필터: 8월 주문은 9월 요약에서 빠진다
    await order({ email: "aug@example.com", lines: [{ variant: single, qty: 5 }], paidAt: new Date("2026-08-20T00:00:00Z") });
    const now = new Date("2026-09-12T00:00:00Z");
    const sep = await salesSummary({ from: kstMonthStart(now), to: kstMonthStart(now, 1) });
    expect(sep.orders).toBe(3);
    expect(sep.units).toBe(8);

    const months = await monthlySeries(3, now);
    expect(months.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(months[0]).toMatchObject({ orders: 0, units: 0, revenueKrw: 0, setShare: null });
    expect(months[1]).toMatchObject({ orders: 1, units: 5, revenueKrw: 160_000, setShare: 0 });
    expect(months[2]).toMatchObject({ orders: 3, units: 8, setOrders: 1 });
    expect(months[2].setShare).toBeCloseTo(1 / 3);
  });

  it("returns an empty summary when nothing sold", async () => {
    const s = await salesSummary();
    expect(s).toEqual({ orders: 0, units: 0, revenueKrw: 0, setOrders: 0, setShare: null });
  });
});

describe("repurchaseRate", () => {
  it("all-time: customers with 2+ paid orders ÷ customers with 1+, keyed by user or guest email, null under 10 customers", async () => {
    const a = await user("a@example.com");
    await order({ email: a.email, userId: a.id, lines: [{ variant: single, qty: 1 }] });
    await order({ email: a.email, userId: a.id, lines: [{ variant: single, qty: 1 }] });
    await order({ email: "g@example.com", lines: [{ variant: single, qty: 1 }] });
    await order({ email: "G@example.com", lines: [{ variant: single, qty: 1 }] }); // 같은 비회원(대소문자)
    await order({ email: "once@example.com", lines: [{ variant: single, qty: 1 }] });
    await order({ email: "x@example.com", lines: [{ variant: single, qty: 1 }], status: "refunded" }); // 제외

    const r = await repurchaseRateAllTime();
    expect(r.customers).toBe(3);
    expect(r.repeated).toBe(2);
    expect(r.rate).toBeNull(); // 10명 미만 → 데이터 부족

    for (let i = 0; i < 7; i += 1) await order({ email: `n${i}@example.com`, lines: [{ variant: single, qty: 1 }] });
    const r2 = await repurchaseRateAllTime();
    expect(r2.customers).toBe(10);
    expect(r2.rate).toBeCloseTo(2 / 10);
  });

  it("period: share of earlier customers who bought again inside the window", async () => {
    const before = new Date("2026-06-01T00:00:00Z");
    const from = new Date("2026-07-01T00:00:00Z");
    const to = new Date("2026-10-01T00:00:00Z");
    for (let i = 0; i < 10; i += 1) await order({ email: `c${i}@example.com`, lines: [{ variant: single, qty: 1 }], paidAt: before });
    await order({ email: "c0@example.com", lines: [{ variant: single, qty: 1 }], paidAt: new Date("2026-08-01T00:00:00Z") });
    await order({ email: "c1@example.com", lines: [{ variant: set, qty: 1 }], paidAt: new Date("2026-09-01T00:00:00Z") });
    await order({ email: "new@example.com", lines: [{ variant: single, qty: 1 }], paidAt: new Date("2026-09-01T00:00:00Z") }); // 신규는 분모 아님
    await order({ email: "c2@example.com", lines: [{ variant: single, qty: 1 }], paidAt: new Date("2026-11-01T00:00:00Z") }); // 창 밖

    const r = await repurchaseRate({ from, to });
    expect(r.customers).toBe(10);
    expect(r.repeated).toBe(2);
    expect(r.rate).toBeCloseTo(0.2);
  });
});

describe("customer segments", () => {
  it("pure classifier follows funding > set > single > new", () => {
    expect(customerSegment({ paidOrders: 0, setOrders: 0, redeemedFundingCode: false })).toBe("new");
    expect(customerSegment({ paidOrders: 2, setOrders: 0, redeemedFundingCode: false })).toBe("single");
    expect(customerSegment({ paidOrders: 2, setOrders: 1, redeemedFundingCode: false })).toBe("set");
    expect(customerSegment({ paidOrders: 2, setOrders: 1, redeemedFundingCode: true })).toBe("funding");
    expect(customerSegment({ paidOrders: 0, setOrders: 0, redeemedFundingCode: true })).toBe("funding");
  });

  it("loads segments for a page of users with grouped queries", async () => {
    const funding = await user("funding@example.com");
    const setBuyer = await user("set@example.com");
    const singleBuyer = await user("single@example.com");
    const nobody = await user("new@example.com");
    const cancelledOnly = await user("cancelled@example.com");

    const coupon = await db.query.coupons.findFirst({ where: eq(coupons.code, "WITHPAROS") });
    const fo = await order({ email: funding.email, userId: funding.id, lines: [{ variant: single, qty: 1 }] });
    await db.insert(couponRedemptions).values({ couponId: coupon!.id, orderId: fo.id, userId: funding.id, email: funding.email });
    await order({ email: setBuyer.email, userId: setBuyer.id, lines: [{ variant: single, qty: 1 }] });
    await order({ email: setBuyer.email, userId: setBuyer.id, lines: [{ variant: set, qty: 1 }], status: "delivered" });
    await order({ email: singleBuyer.email, userId: singleBuyer.id, lines: [{ variant: single, qty: 2 }] });
    await order({ email: cancelledOnly.email, userId: cancelledOnly.id, lines: [{ variant: set, qty: 1 }], status: "cancelled" });

    const ids = [funding.id, setBuyer.id, singleBuyer.id, nobody.id, cancelledOnly.id];
    const segs = await loadSegmentsForUsers(ids);
    expect(segs.get(funding.id)).toBe("funding");
    expect(segs.get(setBuyer.id)).toBe("set");
    expect(segs.get(singleBuyer.id)).toBe("single");
    expect(segs.get(nobody.id)).toBe("new");
    expect(segs.get(cancelledOnly.id)).toBe("new");
    expect(await loadSegmentsForUsers([])).toEqual(new Map());
  });
});
