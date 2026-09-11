import { afterEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { orders, products, reviews, users } from "@/db/schema";
import { getProductReviewsPage, getReviewTagCounts, REVIEW_PAGE_SIZE } from "@/lib/catalog";
import { installTestDb, uninstallTestDb } from "../helpers/db";

let client: Client | undefined;

afterEach(() => {
  uninstallTestDb();
  client?.close();
  client = undefined;
});

describe("product review paging (상품 페이지 후기 상한 페이지네이션)", () => {
  it("pages newest-first, filters by tag, and counts tags without loading everything", async () => {
    const handle = await installTestDb();
    client = handle.client;
    const db = handle.db;

    const [product] = await db.insert(products).values({ slug: "daily-sunscreen", name: "PAROS Daily Sunscreen" }).returning();
    const [user] = await db
      .insert(users)
      .values({ email: "reviewer@example.com", passwordHash: "x", name: "리뷰어", role: "customer" })
      .returning();

    const total = REVIEW_PAGE_SIZE * 2 + 3; // 3 페이지
    for (let i = 0; i < total; i += 1) {
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: `PR-20270101-${String(i).padStart(6, "0")}`,
          userId: user.id,
          email: user.email,
          customerName: user.name,
          phone: "01000000000",
          recipientName: user.name,
          recipientPhone: "01000000000",
          postalCode: "04000",
          address1: "서울",
          subtotalKrw: 32_000,
          shippingKrw: 0,
          discountKrw: 0,
          totalKrw: 32_000,
          status: "delivered",
        })
        .returning();
      await db.insert(reviews).values({
        productId: product.id,
        orderId: order.id,
        userId: user.id,
        authorName: user.name,
        rating: 5,
        body: `후기 ${i}`,
        activityTag: i % 3 === 0 ? "running" : "daily",
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      });
    }

    const first = await getProductReviewsPage(product.id);
    expect(first.total).toBe(total);
    expect(first.totalPages).toBe(3);
    expect(first.rows).toHaveLength(REVIEW_PAGE_SIZE);
    // 최신순
    expect(first.rows[0].body).toBe(`후기 ${total - 1}`);

    const last = await getProductReviewsPage(product.id, { page: 3 });
    expect(last.rows).toHaveLength(3);
    expect(last.page).toBe(3);
    // 범위를 벗어난 페이지는 마지막 페이지로 조정
    expect((await getProductReviewsPage(product.id, { page: 99 })).page).toBe(3);
    expect((await getProductReviewsPage(product.id, { page: 0 })).page).toBe(1);

    const running = await getProductReviewsPage(product.id, { tag: "running" });
    const runningTotal = Math.ceil(total / 3);
    expect(running.total).toBe(runningTotal);
    expect(running.rows.every((r) => r.activityTag === "running")).toBe(true);

    const counts = await getReviewTagCounts(product.id);
    expect(Object.fromEntries(counts.map((c) => [c.tag, c.count]))).toEqual({ running: runningTotal, daily: total - runningTotal });
  });
});
