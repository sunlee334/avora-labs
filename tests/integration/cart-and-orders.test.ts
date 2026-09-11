import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import type { Database } from "@/db/client";
import {
  cartItems,
  carts,
  couponRedemptions,
  coupons,
  orderItems,
  orders,
  products,
  reviews,
  users,
  variants,
} from "@/db/schema";
import { withTestDb } from "../helpers/db";

let client: Client | undefined;

afterEach(() => {
  client?.close();
  client = undefined;
});

async function seedProductAndVariant(db: Database) {
  const [product] = await db
    .insert(products)
    .values({ slug: "daily-sunscreen", name: "PAROS Daily Sunscreen" })
    .returning();
  const [variant] = await db
    .insert(variants)
    .values({ productId: product.id, sku: "PAROS-DS-50-1", name: "본품 50ml", priceKrw: 32_000 })
    .returning();
  return { product, variant };
}

async function seedUser(db: Database, email = "customer@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "x", name: "테스트고객" })
    .returning();
  return user;
}

async function insertOrder(
  db: Database,
  overrides: Partial<typeof orders.$inferInsert> = {},
) {
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: overrides.orderNumber ?? `PR-20270101-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      email: "customer@example.com",
      customerName: "테스트고객",
      phone: "01000000000",
      recipientName: "테스트고객",
      recipientPhone: "01000000000",
      postalCode: "04001",
      address1: "서울특별시 마포구",
      subtotalKrw: 32_000,
      totalKrw: 32_000,
      ...overrides,
    })
    .returning();
  return order;
}

describe("cart_items unique index on (cart_id, variant_id)", () => {
  it("rejects inserting the same variant into the same cart twice", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    const { variant } = await seedProductAndVariant(db);
    const [cart] = await db.insert(carts).values({ id: "cart-1" }).returning();

    await db.insert(cartItems).values({ cartId: cart.id, variantId: variant.id, qty: 1 });

    await expect(
      db.insert(cartItems).values({ cartId: cart.id, variantId: variant.id, qty: 2 }),
    ).rejects.toThrow();
  });

  it("allows the same variant in different carts", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    const { variant } = await seedProductAndVariant(db);
    const [cartA] = await db.insert(carts).values({ id: "cart-a" }).returning();
    const [cartB] = await db.insert(carts).values({ id: "cart-b" }).returning();

    await db.insert(cartItems).values({ cartId: cartA.id, variantId: variant.id, qty: 1 });
    await expect(
      db.insert(cartItems).values({ cartId: cartB.id, variantId: variant.id, qty: 1 }),
    ).resolves.toBeDefined();
  });
});

describe("orders.orderNumber unique constraint", () => {
  it("rejects a duplicate order number", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    await insertOrder(db, { orderNumber: "PR-20270101-DUPE" });
    await expect(insertOrder(db, { orderNumber: "PR-20270101-DUPE" })).rejects.toThrow();
  });
});

describe("cascade deletes", () => {
  it("deleting a cart cascades its cart_items", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    const { variant } = await seedProductAndVariant(db);
    const [cart] = await db.insert(carts).values({ id: "cart-cascade" }).returning();
    await db.insert(cartItems).values({ cartId: cart.id, variantId: variant.id, qty: 1 });

    await db.delete(carts).where(eq(carts.id, cart.id));

    const remaining = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id));
    expect(remaining).toHaveLength(0);
  });

  it("deleting an order cascades order_items and coupon_redemptions", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    const { product, variant } = await seedProductAndVariant(db);
    const order = await insertOrder(db);
    await db.insert(orderItems).values({
      orderId: order.id,
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      variantName: variant.name,
      unitPriceKrw: variant.priceKrw,
      qty: 1,
      lineTotalKrw: variant.priceKrw,
    });
    const [coupon] = await db
      .insert(coupons)
      .values({ code: "TESTCODE", type: "free_shipping" })
      .returning();
    await db.insert(couponRedemptions).values({
      couponId: coupon.id,
      orderId: order.id,
      email: "customer@example.com",
    });

    await db.delete(orders).where(eq(orders.id, order.id));

    const remainingItems = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(remainingItems).toHaveLength(0);

    const remainingRedemptions = await db
      .select()
      .from(couponRedemptions)
      .where(eq(couponRedemptions.orderId, order.id));
    expect(remainingRedemptions).toHaveLength(0);

    // the coupon itself should NOT be deleted (only orderId cascades, coupon stays)
    const couponStillThere = await db.select().from(coupons).where(eq(coupons.id, coupon.id));
    expect(couponStillThere).toHaveLength(1);
  });
});

describe("reviews unique constraint on (orderId, productId)", () => {
  it("rejects a second review for the same order and product", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    const { product } = await seedProductAndVariant(db);
    const user = await seedUser(db);
    const order = await insertOrder(db);

    await db.insert(reviews).values({
      productId: product.id,
      orderId: order.id,
      userId: user.id,
      authorName: user.name,
      rating: 5,
      body: "좋아요",
    });

    await expect(
      db.insert(reviews).values({
        productId: product.id,
        orderId: order.id,
        userId: user.id,
        authorName: user.name,
        rating: 4,
        body: "다시 씁니다",
      }),
    ).rejects.toThrow();
  });

  it("allows reviews for the same product from different orders", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    const { product } = await seedProductAndVariant(db);
    const user = await seedUser(db);
    const orderA = await insertOrder(db, { orderNumber: "PR-20270101-AAAA" });
    const orderB = await insertOrder(db, { orderNumber: "PR-20270101-BBBB" });

    await db.insert(reviews).values({
      productId: product.id,
      orderId: orderA.id,
      userId: user.id,
      authorName: user.name,
      rating: 5,
      body: "좋아요",
    });
    await expect(
      db.insert(reviews).values({
        productId: product.id,
        orderId: orderB.id,
        userId: user.id,
        authorName: user.name,
        rating: 4,
        body: "다시 씁니다",
      }),
    ).resolves.toBeDefined();
  });
});
