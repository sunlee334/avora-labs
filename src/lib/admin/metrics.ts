import "server-only";
import { and, avg, count, countDistinct, desc, eq, gte, inArray, isNotNull, isNull, sql, sum } from "drizzle-orm";
import { db } from "@/db/client";
import {
  carts,
  cartItems,
  notifySignups,
  orderItems,
  orders,
  products,
  reviews,
  variants,
} from "@/db/schema";
import { type OrderStatus } from "@/lib/config";
import { buildOrderName } from "@/lib/orders";

/** 결제가 완료된(취소·환불되지 않은) 주문 상태. 매출·구매 지표 계산 기준. */
const PAID_PLUS: OrderStatus[] = ["paid", "preparing", "shipped", "delivered"];

export interface VariantStockRow {
  variantId: number;
  productName: string;
  variantName: string;
  stock: number;
}

export interface RecentOrderRow {
  id: number;
  orderNumber: string;
  createdAt: Date | null;
  customerName: string;
  summary: string;
  totalKrw: number;
  status: OrderStatus;
}

export interface AdminDashboardMetrics {
  today: { orders: number; salesKrw: number };
  month: { orders: number; salesKrw: number };
  awaitingShipment: number;
  stock: { total: number; variants: VariantStockRow[] };
  reviews: { count: number; average: number };
  notifySignups: number;
  activeCarts: number;
  /** paid+ 주문 중 세트(unitsPerPack>1) 라인이 포함된 비율. paid+ 주문이 없으면 null */
  setShareRatio: number | null;
  /** paid+ 주문이 2건 이상인 회원 / 1건 이상인 회원. 대상 회원이 없으면 null */
  repeatPurchaseRatio: number | null;
  /** 근사치: 최근 30일 아이템이 담긴 카트 중 같은 기간 생성된 주문으로 이어지지 않은 비율 */
  cartAbandonmentRatio: number | null;
  recentOrders: RecentOrderRow[];
}

/** 매출은 결제 시각 기준으로 센다 (paidAt 이 없는 옛 행은 접수 시각). */
async function salesSince(since: Date): Promise<{ orders: number; salesKrw: number }> {
  const row = await db
    .select({ orders: count(), sales: sum(orders.totalKrw) })
    .from(orders)
    .where(
      and(
        inArray(orders.status, PAID_PLUS),
        gte(sql`coalesce(${orders.paidAt}, ${orders.createdAt})`, since.getTime()),
      ),
    )
    .get();
  return { orders: row?.orders ?? 0, salesKrw: Number(row?.sales ?? 0) };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Worker 의 로컬 시각은 UTC 다. "오늘"·"이번 달" 경계는 한국 시간으로 잡는다. */
function kstStartOfDay(now: Date): Date {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - KST_OFFSET_MS);
}

function kstStartOfMonth(now: Date): Date {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - KST_OFFSET_MS);
}

export async function getAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  const now = new Date();
  const startOfToday = kstStartOfDay(now);
  const startOfMonth = kstStartOfMonth(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [today, month, awaitingShipmentRow, stockRows, reviewRow, notifyRow, activeCartRows] =
    await Promise.all([
      salesSince(startOfToday),
      salesSince(startOfMonth),
      db
        .select({ c: count() })
        .from(orders)
        .where(inArray(orders.status, ["paid", "preparing"]))
        .get(),
      db
        .select({
          variantId: variants.id,
          productName: products.name,
          variantName: variants.name,
          stock: variants.stock,
        })
        .from(variants)
        .innerJoin(products, eq(variants.productId, products.id))
        .where(eq(variants.isActive, true))
        .orderBy(products.sortOrder, variants.sortOrder),
      db.select({ c: count(), avgRating: avg(reviews.rating) }).from(reviews).get(),
      db
        .select({ c: count() })
        .from(notifySignups)
        .where(isNull(notifySignups.unsubscribedAt))
        .get(),
      // 행을 가져와 세지 않고 DB 에서 한 값으로 센다 (데이터가 늘어도 응답이 커지지 않도록).
      db
        .select({ c: countDistinct(carts.id) })
        .from(carts)
        .innerJoin(cartItems, eq(cartItems.cartId, carts.id))
        .where(gte(carts.updatedAt, sevenDaysAgo))
        .get(),
    ]);

  // 세트 구매 비중
  const [paidPlusCountRow, setOrderRow] = await Promise.all([
    db.select({ c: count() }).from(orders).where(inArray(orders.status, PAID_PLUS)).get(),
    db
      .select({ c: countDistinct(orderItems.orderId) })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(inArray(orders.status, PAID_PLUS), gte(orderItems.unitsPerPack, 2)))
      .get(),
  ]);
  const paidPlusCount = paidPlusCountRow?.c ?? 0;
  const setShareRatio = paidPlusCount > 0 ? (setOrderRow?.c ?? 0) / paidPlusCount : null;

  // 재구매율 (회원 주문만 집계, 비회원 주문 제외): 구매 회원 수와 2회 이상 구매 회원 수를 각각 한 값으로 센다.
  const memberOrderCounts = db
    .select({ userId: orders.userId, c: count().as("c") })
    .from(orders)
    .where(and(inArray(orders.status, PAID_PLUS), isNotNull(orders.userId)))
    .groupBy(orders.userId)
    .as("member_orders");
  const [membersWithOrderRow, membersWithRepeatRow] = await Promise.all([
    db.select({ c: count() }).from(memberOrderCounts).get(),
    db.select({ c: count() }).from(memberOrderCounts).where(gte(memberOrderCounts.c, 2)).get(),
  ]);
  const membersWithOrder = membersWithOrderRow?.c ?? 0;
  const membersWithRepeat = membersWithRepeatRow?.c ?? 0;
  const repeatPurchaseRatio = membersWithOrder > 0 ? membersWithRepeat / membersWithOrder : null;

  // 장바구니 이탈률 (근사치): 최근 30일 담긴 장바구니 대비 결제 완료 주문.
  const [cartsLast30Row, ordersLast30Row] = await Promise.all([
    db
      .select({ c: countDistinct(carts.id) })
      .from(carts)
      .innerJoin(cartItems, eq(cartItems.cartId, carts.id))
      .where(gte(carts.createdAt, thirtyDaysAgo))
      .get(),
    db
      .select({ c: count() })
      .from(orders)
      .where(and(inArray(orders.status, PAID_PLUS), gte(orders.createdAt, thirtyDaysAgo)))
      .get(),
  ]);
  const cartsLast30 = cartsLast30Row?.c ?? 0;
  const cartAbandonmentRatio =
    cartsLast30 > 0 ? Math.max(0, Math.min(1, 1 - (ordersLast30Row?.c ?? 0) / cartsLast30)) : null;

  const recentOrderRows = await db.query.orders.findMany({
    orderBy: [desc(orders.createdAt)],
    limit: 10,
    with: { items: true },
  });

  return {
    today,
    month,
    awaitingShipment: awaitingShipmentRow?.c ?? 0,
    stock: {
      total: stockRows.reduce((sum2, r) => sum2 + r.stock, 0),
      variants: stockRows,
    },
    reviews: {
      count: reviewRow?.c ?? 0,
      average: reviewRow?.avgRating ? Number(reviewRow.avgRating) : 0,
    },
    notifySignups: notifyRow?.c ?? 0,
    activeCarts: activeCartRows?.c ?? 0,
    setShareRatio,
    repeatPurchaseRatio,
    cartAbandonmentRatio,
    recentOrders: recentOrderRows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      customerName: o.customerName,
      summary: buildOrderName(o.items),
      totalKrw: o.totalKrw,
      status: o.status,
    })),
  };
}

export function formatPercent(ratio: number | null): string {
  if (ratio === null) return "-";
  return `${Math.round(ratio * 1000) / 10}%`;
}
