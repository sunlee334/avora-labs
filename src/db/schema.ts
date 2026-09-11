import { relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

const bool = (name: string) => integer(name, { mode: "boolean" });

// ---------------------------------------------------------------- users
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    role: text("role", { enum: ["customer", "admin"] })
      .notNull()
      .default("customer"),
    marketingEmailOptIn: bool("marketing_email_opt_in").notNull().default(false),
    marketingSmsOptIn: bool("marketing_sms_opt_in").notNull().default(false),
    consentAt: integer("consent_at", { mode: "timestamp_ms" }),
    /** 임시 비밀번호로 로그인한 뒤 새 비밀번호를 정할 때까지 true. 계정 화면·관리자 화면은 비밀번호 변경 화면으로 보낸다. */
    passwordResetRequired: bool("password_reset_required").notNull().default(false),
    /** 임시 비밀번호 만료 시각. 지나면 로그인 자체를 거부한다 (새로 발급받아야 함). */
    tempPasswordExpiresAt: integer("temp_password_expires_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** 쿠키 토큰의 sha256(base64url). 원문은 쿠키에만 있다 — DB 읽기 권한만으로 세션을 탈취할 수 없게. */
    token: text("token").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: timestamp("created_at"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

// ------------------------------------------------------------- catalog
export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    description: text("description").notNull().default(""),
    /** 브랜드 로드맵 단계 (1: Daily Sunscreen, 2: 미니, 3: 샴푸·바디워시, 4: 데오드란트) */
    stage: integer("stage").notNull().default(1),
    /** 하루의 구간 코드. 예: "SUN · MOVE" */
    code: text("code").notNull().default(""),
    status: text("status", { enum: ["on_sale", "upcoming", "sold_out"] })
      .notNull()
      .default("upcoming"),
    launchLabel: text("launch_label").notNull().default(""),
    image: text("image").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [uniqueIndex("products_slug_uq").on(t.slug)],
);

export const variants = sqliteTable(
  "variants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    /** 구성 수량 (본품 1개 = 1, 2개 세트 = 2) */
    unitsPerPack: integer("units_per_pack").notNull().default(1),
    priceKrw: integer("price_krw").notNull(),
    /** 개별 구매 시 합계(정가 기준). 세트 할인 표시용 */
    compareAtKrw: integer("compare_at_krw"),
    stock: integer("stock").notNull().default(0),
    isDefault: bool("is_default").notNull().default(false),
    isActive: bool("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("variants_sku_uq").on(t.sku),
    index("variants_product_idx").on(t.productId),
  ],
);

// ---------------------------------------------------------------- cart
export const carts = sqliteTable(
  "carts",
  {
    /** 쿠키에 저장되는 추측 불가능한 UUID */
    id: text("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [index("carts_user_idx").on(t.userId)],
);

export const cartItems = sqliteTable(
  "cart_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: integer("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    qty: integer("qty").notNull().default(1),
    createdAt: timestamp("created_at"),
  },
  (t) => [uniqueIndex("cart_items_cart_variant_uq").on(t.cartId, t.variantId)],
);

// -------------------------------------------------------------- orders
export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** 고객 노출용 주문번호. Toss orderId로도 사용 (6–64자) */
    orderNumber: text("order_number").notNull(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: [
        "pending",
        "paid",
        "preparing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
    })
      .notNull()
      .default("pending"),

    email: text("email").notNull(),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),

    recipientName: text("recipient_name").notNull(),
    recipientPhone: text("recipient_phone").notNull(),
    postalCode: text("postal_code").notNull(),
    address1: text("address1").notNull(),
    address2: text("address2").notNull().default(""),
    deliveryMemo: text("delivery_memo").notNull().default(""),

    subtotalKrw: integer("subtotal_krw").notNull(),
    discountKrw: integer("discount_krw").notNull().default(0),
    shippingKrw: integer("shipping_krw").notNull().default(0),
    totalKrw: integer("total_krw").notNull(),
    couponId: integer("coupon_id").references(() => coupons.id, {
      onDelete: "set null",
    }),
    couponCode: text("coupon_code"),
    shippingReason: text("shipping_reason").notNull().default("none"),

    /** 주문 단계에서 별도 수집하는 문자·알림톡 수신 동의 (사업기획서 7-5) */
    smsOptIn: bool("sms_opt_in").notNull().default(false),

    paymentProvider: text("payment_provider").notNull().default("toss"),
    paymentKey: text("payment_key"),
    paymentMethod: text("payment_method"),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    failReason: text("fail_reason"),

    trackingCarrier: text("tracking_carrier"),
    trackingNumber: text("tracking_number"),
    shippedAt: integer("shipped_at", { mode: "timestamp_ms" }),
    deliveredAt: integer("delivered_at", { mode: "timestamp_ms" }),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    adminMemo: text("admin_memo").notNull().default(""),

    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [
    uniqueIndex("orders_number_uq").on(t.orderNumber),
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
    index("orders_email_idx").on(t.email),
    index("orders_created_idx").on(t.createdAt),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    variantId: integer("variant_id")
      .notNull()
      .references(() => variants.id),
    productName: text("product_name").notNull(),
    variantName: text("variant_name").notNull(),
    unitsPerPack: integer("units_per_pack").notNull().default(1),
    unitPriceKrw: integer("unit_price_krw").notNull(),
    qty: integer("qty").notNull(),
    lineTotalKrw: integer("line_total_krw").notNull(),
    /** 결제 승인 시 재고가 실제로 차감됐는지. 취소·환불 시 이 값이 true 인 품목만 복원한다. */
    stockDeducted: bool("stock_deducted").notNull().default(false),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/** 주문 상태 변경 이력. adminMemo 문자열 대신 누가·언제·왜 바꿨는지 구조화해 남긴다 (대사·감사용). */
export const orderEvents = sqliteTable(
  "order_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    /** customer | admin | toss | system */
    actor: text("actor").notNull(),
    reason: text("reason").notNull().default(""),
    /** confirm | fail-url | admin-ui | customer-ui | webhook | cron | daily | reconcile */
    source: text("source"),
    createdAt: timestamp("created_at"),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)],
);

// ------------------------------------------------------------- coupons
export const coupons = sqliteTable(
  "coupons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** 대문자 저장 */
    code: text("code").notNull(),
    type: text("type", { enum: ["free_shipping", "amount", "percent"] }).notNull(),
    /** amount: 원, percent: %, free_shipping: 0 */
    value: integer("value").notNull().default(0),
    minSubtotalKrw: integer("min_subtotal_krw").notNull().default(0),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    perUserLimit: integer("per_user_limit").notNull().default(1),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }),
    isActive: bool("is_active").notNull().default(true),
    /** 회원 전용: 비회원 주문에서는 거부한다 (이메일만 바꿔 반복 사용하는 것을 막는 용도). */
    membersOnly: bool("members_only").notNull().default(false),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at"),
  },
  (t) => [uniqueIndex("coupons_code_uq").on(t.code)],
);

export const couponRedemptions = sqliteTable(
  "coupon_redemptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    couponId: integer("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    createdAt: timestamp("created_at"),
  },
  (t) => [
    index("coupon_redemptions_coupon_idx").on(t.couponId),
    index("coupon_redemptions_email_idx").on(t.email),
    index("coupon_redemptions_user_idx").on(t.userId),
    /** 같은 주문에 같은 쿠폰이 두 번 적립되지 않게 (승인 부수효과가 중복 실행되는 경로 방어) */
    uniqueIndex("coupon_redemptions_order_coupon_uq").on(t.orderId, t.couponId),
  ],
);

// ------------------------------------------------------------- reviews
export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    rating: integer("rating").notNull(),
    body: text("body").notNull(),
    activityTag: text("activity_tag").notNull().default("daily"),
    /** JSON 배열 문자열: ["/api/uploads/reviews/xxx.jpg"] */
    photos: text("photos").notNull().default("[]"),
    /** 경제적 대가 제공 후기 표시 (표시광고법) */
    disclosure: bool("disclosure").notNull().default(false),
    adminReply: text("admin_reply"),
    adminRepliedAt: integer("admin_replied_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at"),
  },
  (t) => [
    uniqueIndex("reviews_order_product_uq").on(t.orderId, t.productId),
    index("reviews_product_idx").on(t.productId),
  ],
);

// ------------------------------------------------------ notify signups
export const notifySignups = sqliteTable(
  "notify_signups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    /** 'all' 또는 제품 slug */
    interest: text("interest").notNull().default("all"),
    marketingOptIn: bool("marketing_opt_in").notNull().default(true),
    source: text("source").notNull().default("site"),
    createdAt: timestamp("created_at"),
    unsubscribedAt: integer("unsubscribed_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("notify_email_interest_uq").on(t.email, t.interest)],
);

// ---------------------------------------------------------- rate limits
/** 요청 제한 카운터. Workers 는 isolate 별 메모리라 인메모리 제한이 무의미하므로 DB 에 둔다. */
export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    resetAt: integer("reset_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("rate_limits_reset_idx").on(t.resetAt)],
);

// ----------------------------------------------------------- relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  orders: many(orders),
  reviews: many(reviews),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const productsRelations = relations(products, ({ many }) => ({
  variants: many(variants),
  reviews: many(reviews),
}));

export const variantsRelations = relations(variants, ({ one }) => ({
  product: one(products, {
    fields: [variants.productId],
    references: [products.id],
  }),
}));

export const cartsRelations = relations(carts, ({ many, one }) => ({
  items: many(cartItems),
  user: one(users, { fields: [carts.userId], references: [users.id] }),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  variant: one(variants, {
    fields: [cartItems.variantId],
    references: [variants.id],
  }),
}));

export const ordersRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  coupon: one(coupons, { fields: [orders.couponId], references: [coupons.id] }),
  reviews: many(reviews),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  variant: one(variants, {
    fields: [orderItems.variantId],
    references: [variants.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const couponsRelations = relations(coupons, ({ many }) => ({
  redemptions: many(couponRedemptions),
}));

export const couponRedemptionsRelations = relations(
  couponRedemptions,
  ({ one }) => ({
    coupon: one(coupons, {
      fields: [couponRedemptions.couponId],
      references: [coupons.id],
    }),
    order: one(orders, {
      fields: [couponRedemptions.orderId],
      references: [orders.id],
    }),
  }),
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
  order: one(orders, { fields: [reviews.orderId], references: [orders.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
}));

// --------------------------------------------------------------- types
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Variant = typeof variants.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type NotifySignup = typeof notifySignups.$inferSelect;
