import "dotenv/config";
import { eq } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { hashPassword } from "@/lib/auth/password";
import { createDb, type Database } from "./client";
import { runMigrations } from "./migrate";
import {
  coupons,
  notifySignups,
  orderItems,
  orders,
  products,
  reviews,
  users,
  variants,
} from "./schema";

/**
 * 기본 시드: 카탈로그(로드맵 4단계), 관리자 계정, 펀딩 참여자 재구매 코드.
 * --demo: 데모 고객·주문·리뷰·알림 신청을 추가해 관리자 화면과 리뷰 UI를 확인할 수 있게 한다.
 */
export async function seedBase(db: Database, options: { adminPassword?: string } = {}) {
  // ---- 카탈로그 (사업기획서 3-1 브랜드 로드맵)
  const catalog = [
    {
      slug: "daily-sunscreen",
      name: "PAROS Daily Sunscreen",
      subtitle: "움직이는 하루 전체를 위한 데일리 선크림 50ml",
      description:
        "SPF50+ / PA++++. 무향, 무톤업. 무엇을 포기하지 않을지 먼저 정하고 그 기준으로 고른 처방.",
      stage: 1,
      code: "SUN · MOVE",
      status: "on_sale" as const,
      launchLabel: "2027 상반기 출시",
      image: "/visuals/product-tube.svg",
      sortOrder: 1,
      variants: [
        {
          sku: "PAROS-DS-50-1",
          name: "본품 50ml",
          unitsPerPack: 1,
          priceKrw: 32_000,
          compareAtKrw: null,
          stock: 2_000,
          isDefault: true,
          sortOrder: 1,
        },
        {
          sku: "PAROS-DS-50-2SET",
          name: "2개 세트 (자사몰 전용)",
          unitsPerPack: 2,
          priceKrw: 56_000,
          compareAtKrw: 64_000,
          stock: 500,
          isDefault: false,
          sortOrder: 2,
        },
      ],
    },
    {
      slug: "mini",
      name: "PAROS Mini",
      subtitle: "핸드폰 케이스에 끼우는 휴대용 재도포 사이즈",
      description:
        "재도포는 휴대할 수 있어야 성립합니다. 러닝이나 야외 활동 시 가방 없이 챙기는 납작한 형태.",
      stage: 2,
      code: "REAPPLY",
      status: "upcoming" as const,
      launchLabel: "2028 상반기 예정",
      image: "/visuals/product-mini.svg",
      sortOrder: 2,
      variants: [],
    },
    {
      slug: "after-care",
      name: "PAROS After Care",
      subtitle: "활동 후 케어 — 샴푸 · 바디워시",
      description: "땀 흘린 뒤 씻어내는 순간. 선케어의 계절성을 보완하는 연중 라인.",
      stage: 3,
      code: "SWEAT · RESET",
      status: "upcoming" as const,
      launchLabel: "2028 하반기 이후",
      image: "/visuals/product-aftercare.svg",
      sortOrder: 3,
      variants: [],
    },
    {
      slug: "deodorant",
      name: "PAROS Deodorant",
      subtitle: "활동 중 냄새 관리",
      description: "타깃의 사용 맥락과 가장 직접적으로 연결되는 품목. 3단계 이후 검토.",
      stage: 4,
      code: "SWEAT",
      status: "upcoming" as const,
      launchLabel: "3단계 이후",
      image: "/visuals/product-deodorant.svg",
      sortOrder: 4,
      variants: [],
    },
  ];

  for (const item of catalog) {
    const { variants: vs, ...productData } = item;
    const existing = await db.query.products.findFirst({
      where: eq(products.slug, productData.slug),
    });
    let productId: number;
    if (existing) {
      productId = existing.id;
    } else {
      const [inserted] = await db.insert(products).values(productData).returning();
      productId = inserted.id;
    }
    for (const v of vs) {
      const existingVariant = await db.query.variants.findFirst({
        where: eq(variants.sku, v.sku),
      });
      if (!existingVariant) {
        await db.insert(variants).values({ ...v, productId });
      }
    }
  }

  // ---- 관리자 계정
  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@avoralabs.co").toLowerCase();
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD;
  const existingAdmin = await db.query.users.findFirst({
    where: eq(users.email, adminEmail),
  });
  if (!existingAdmin) {
    // 기본 비밀번호는 두지 않는다. 알려진 값으로 만들어진 관리자 계정이 운영에 들어가는 사고를 막는다.
    if (!adminPassword || adminPassword.length < 12) {
      throw new Error("ADMIN_PASSWORD(12자 이상) 환경 변수가 필요합니다. .env 를 확인하세요.");
    }
    await db.insert(users).values({
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      name: "AVORA LABS",
      role: "admin",
      consentAt: new Date(),
    });
    console.log(`[seed] admin created: ${adminEmail}`);
  }

  // ---- 펀딩 참여자 전용 재구매 코드 (제품기획안 10-2)
  const existingCoupon = await db.query.coupons.findFirst({
    where: eq(coupons.code, "WITHPAROS"),
  });
  if (!existingCoupon) {
    await db.insert(coupons).values({
      code: "WITHPAROS",
      type: "free_shipping",
      value: 0,
      minSubtotalKrw: 0,
      maxUses: 500,
      perUserLimit: 1,
      isActive: true,
      note: "펀딩 참여자 전용 재구매 코드. 리워드 발송 시 동봉.",
    });
  }
}

async function seedDemo(db: Database) {
  const product = await db.query.products.findFirst({
    where: eq(products.slug, "daily-sunscreen"),
    with: { variants: true },
  });
  if (!product) throw new Error("base seed required before demo seed");
  const single = product.variants.find((v) => v.unitsPerPack === 1)!;
  const twoSet = product.variants.find((v) => v.unitsPerPack === 2)!;

  const demoUsers = [
    { email: "runner@example.com", name: "김서준", phone: "01011112222" },
    { email: "climber@example.com", name: "이하은", phone: "01033334444" },
    { email: "golfer@example.com", name: "박지호", phone: "01055556666" },
  ];
  const userIds: number[] = [];
  for (const u of demoUsers) {
    const existing = await db.query.users.findFirst({ where: eq(users.email, u.email) });
    if (existing) {
      userIds.push(existing.id);
      continue;
    }
    const [row] = await db
      .insert(users)
      .values({
        ...u,
        passwordHash: await hashPassword("demo-password-1234"),
        marketingEmailOptIn: true,
        marketingSmsOptIn: true,
        consentAt: new Date(),
      })
      .returning();
    userIds.push(row.id);
  }

  const alreadySeeded = await db.query.orders.findFirst({
    where: eq(orders.orderNumber, "PR-20270512-DEMO1"),
  });
  if (alreadySeeded) return;

  const address = {
    postalCode: "04001",
    address1: "서울특별시 마포구 월드컵북로 1",
    address2: "101호",
  };
  const demoOrders = [
    {
      orderNumber: "PR-20270512-DEMO1",
      userId: userIds[0],
      user: demoUsers[0],
      variant: single,
      qty: 1,
      status: "delivered" as const,
      shippingKrw: 0,
      shippingReason: "first_order",
      daysAgo: 40,
    },
    {
      orderNumber: "PR-20270520-DEMO2",
      userId: userIds[1],
      user: demoUsers[1],
      variant: twoSet,
      qty: 1,
      status: "delivered" as const,
      shippingKrw: 0,
      shippingReason: "threshold",
      daysAgo: 30,
    },
    {
      orderNumber: "PR-20270601-DEMO3",
      userId: userIds[2],
      user: demoUsers[2],
      variant: single,
      qty: 1,
      status: "shipped" as const,
      shippingKrw: 3_000,
      shippingReason: "none",
      daysAgo: 5,
    },
    {
      orderNumber: "PR-20270605-DEMO4",
      userId: userIds[0],
      user: demoUsers[0],
      variant: twoSet,
      qty: 1,
      status: "paid" as const,
      shippingKrw: 0,
      shippingReason: "threshold",
      daysAgo: 1,
    },
  ];

  const orderIds: number[] = [];
  for (const o of demoOrders) {
    const createdAt = new Date(Date.now() - o.daysAgo * 86_400_000);
    const subtotal = o.variant.priceKrw * o.qty;
    const [row] = await db
      .insert(orders)
      .values({
        orderNumber: o.orderNumber,
        userId: o.userId,
        status: o.status,
        email: o.user.email,
        customerName: o.user.name,
        phone: o.user.phone,
        recipientName: o.user.name,
        recipientPhone: o.user.phone,
        ...address,
        subtotalKrw: subtotal,
        discountKrw: 0,
        shippingKrw: o.shippingKrw,
        totalKrw: subtotal + o.shippingKrw,
        shippingReason: o.shippingReason,
        paymentKey: `demo_${o.orderNumber}`,
        paymentMethod: "카드",
        paidAt: createdAt,
        shippedAt: ["shipped", "delivered"].includes(o.status) ? createdAt : null,
        deliveredAt: o.status === "delivered" ? createdAt : null,
        trackingCarrier: ["shipped", "delivered"].includes(o.status) ? "CJ대한통운" : null,
        trackingNumber: ["shipped", "delivered"].includes(o.status)
          ? `6${String(createdAt.getTime()).slice(-11)}`
          : null,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();
    orderIds.push(row.id);
    await db.insert(orderItems).values({
      orderId: row.id,
      productId: product.id,
      variantId: o.variant.id,
      productName: product.name,
      variantName: o.variant.name,
      unitsPerPack: o.variant.unitsPerPack,
      unitPriceKrw: o.variant.priceKrw,
      qty: o.qty,
      lineTotalKrw: subtotal,
    });
  }

  await db.insert(reviews).values([
    {
      productId: product.id,
      orderId: orderIds[0],
      userId: userIds[0],
      authorName: "김서준",
      rating: 5,
      activityTag: "running",
      body: "한강 10km 뛰고 나서도 눈이 따갑지 않았어요. 땀이 흘러도 얼굴에서 밀리는 느낌이 없고, 바르고 나면 금방 마른 느낌이라 출근길에도 쓰고 있습니다.",
      disclosure: false,
      adminReply:
        "첫 러닝 후기를 남겨주셔서 감사합니다. 재도포는 2시간 간격을 권장드려요. 다음 러닝도 가볍게 다녀오세요.",
      adminRepliedAt: new Date(Date.now() - 20 * 86_400_000),
      createdAt: new Date(Date.now() - 25 * 86_400_000),
    },
    {
      productId: product.id,
      orderId: orderIds[1],
      userId: userIds[1],
      authorName: "이하은",
      rating: 4,
      activityTag: "climbing",
      body: "실내 암장에서는 땀이 많이 나는데 끈적임이 적어서 홀드 잡을 때 거슬리지 않았습니다. 무향이라 남자친구와 같이 쓰기 좋아요. 향이 아예 없는 게 처음엔 낯설었지만 익숙해지니 이게 더 편합니다.",
      disclosure: false,
      createdAt: new Date(Date.now() - 12 * 86_400_000),
    },
  ]);

  await db
    .insert(notifySignups)
    .values([
      { email: "surf@example.com", interest: "mini", marketingOptIn: true, source: "site" },
      { email: "trail@example.com", interest: "all", marketingOptIn: true, source: "instagram" },
      { email: "hello@example.com", interest: "after-care", marketingOptIn: true, source: "site" },
    ])
    .onConflictDoNothing();

  console.log("[seed] demo data created (3 customers, 4 orders, 2 reviews, 3 signups)");
}

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./data/paros.db";
  if (url.startsWith("file:")) {
    mkdirSync(path.dirname(url.replace(/^file:/, "")), { recursive: true });
  }
  const wantsDemo = process.argv.includes("--demo");
  if (wantsDemo && !url.startsWith("file:") && url !== ":memory:") {
    throw new Error(`데모 시드는 로컬 파일 DB 에서만 실행할 수 있습니다 (DATABASE_URL=${url}).`);
  }
  const { db, client } = createDb(url);
  await runMigrations(db);
  await seedBase(db);
  if (wantsDemo) {
    await seedDemo(db);
  }
  console.log("[seed] done");
  client.close();
}

const isDirectRun =
  typeof process.argv[1] === "string" && /seed\.ts$/.test(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
