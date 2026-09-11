import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { seedBase } from "@/db/seed";
import { coupons, products, users, variants } from "@/db/schema";
import { withTestDb } from "../helpers/db";

let client: Client | undefined;

afterEach(() => {
  client?.close();
  client = undefined;
});

describe("seedBase", () => {
  it("creates 4 products spanning stages 1-4", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    await seedBase(db);

    const rows = await db.select().from(products);
    expect(rows).toHaveLength(4);
    const stages = rows.map((p) => p.stage).sort();
    expect(stages).toEqual([1, 2, 3, 4]);
  });

  it("gives daily-sunscreen 2 variants: 32,000/1-pack and 56,000/2-pack with compareAt 64,000", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    await seedBase(db);

    const product = await db.query.products.findFirst({
      where: eq(products.slug, "daily-sunscreen"),
      with: { variants: true },
    });
    expect(product).toBeTruthy();
    expect(product!.variants).toHaveLength(2);

    const single = product!.variants.find((v) => v.unitsPerPack === 1);
    const twoSet = product!.variants.find((v) => v.unitsPerPack === 2);

    expect(single).toBeTruthy();
    expect(single!.priceKrw).toBe(32_000);

    expect(twoSet).toBeTruthy();
    expect(twoSet!.priceKrw).toBe(56_000);
    expect(twoSet!.compareAtKrw).toBe(64_000);
  });

  it("creates an admin user with role admin", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    await seedBase(db);

    const admin = await db.query.users.findFirst({
      where: eq(users.email, "admin@avoralabs.co"),
    });
    expect(admin).toBeTruthy();
    expect(admin!.role).toBe("admin");
  });

  it("creates the WITHPAROS free_shipping coupon", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    await seedBase(db);

    const coupon = await db.query.coupons.findFirst({
      where: eq(coupons.code, "WITHPAROS"),
    });
    expect(coupon).toBeTruthy();
    expect(coupon!.type).toBe("free_shipping");
  });

  it("is idempotent: running seedBase twice does not create duplicates", async () => {
    const { db, client: c } = await withTestDb();
    client = c;
    await seedBase(db);
    await seedBase(db);

    const allProducts = await db.select().from(products);
    expect(allProducts).toHaveLength(4);

    const allVariants = await db.select().from(variants);
    // daily-sunscreen has 2 variants, other 3 products have 0
    expect(allVariants).toHaveLength(2);

    const admins = await db.select().from(users).where(eq(users.email, "admin@avoralabs.co"));
    expect(admins).toHaveLength(1);

    const withparosCoupons = await db.select().from(coupons).where(eq(coupons.code, "WITHPAROS"));
    expect(withparosCoupons).toHaveLength(1);
  });
});
