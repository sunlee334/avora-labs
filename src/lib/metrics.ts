import "server-only";
import { and, count, countDistinct, gte, inArray, isNull, lt, sql, sum, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notifySignups, orderItems, orders, reviews } from "@/db/schema";
import type { OrderStatus } from "@/lib/config";

/**
 * 기획안(제품기획안 7-1 · 8-5-2) 지표용 집계 쿼리. 모두 단일 집계 SQL 이라 주문이 늘어도 응답 크기가 커지지 않는다.
 * 판매로 세는 상태: paid·preparing·shipped·delivered (pending·cancelled·refunded 제외).
 * 시각 기준은 결제 시각(paidAt), 없으면 접수 시각. 월 경계는 한국 시간.
 */
export const SOLD_STATUSES: OrderStatus[] = ["paid", "preparing", "shipped", "delivered"];

/** 제품기획안 7-1 중간 점검 목표 */
export const PLAN_TARGETS = {
  notifySignups: 1_300, // 2027-01 자사몰 출시 알림 신청자
  firstMonthUnits: 350, // 2027-05 판매 개시 첫 달
  reviews: 100, // 2027-06 리뷰 누적
  cumulativeUnits: 2_500, // 2027-09 1차 성공 기준
  repurchaseRate: 0.2, // 2027-12 재구매율
} as const;

/** 재구매율을 의미 있게 보려면 최소 이만큼의 구매 고객이 있어야 한다. */
export const REPURCHASE_MIN_CUSTOMERS = 10;

const soldAt = sql<number>`coalesce(${orders.paidAt}, ${orders.createdAt})`;

export interface DateRange {
  from?: Date;
  to?: Date;
}

function rangeWhere(range: DateRange) {
  const conds = [inArray(orders.status, SOLD_STATUSES)];
  if (range.from) conds.push(gte(soldAt, range.from.getTime()));
  if (range.to) conds.push(lt(soldAt, range.to.getTime()));
  return and(...conds);
}

export interface SalesSummary {
  orders: number;
  /** 판매 개수 = Σ qty × unitsPerPack (2개 세트는 2개로 센다) */
  units: number;
  revenueKrw: number;
  setOrders: number;
  /** 세트 라인이 포함된 주문 ÷ 판매 주문. 주문이 없으면 null */
  setShare: number | null;
}

export async function salesSummary(range: DateRange = {}): Promise<SalesSummary> {
  const where = rangeWhere(range);
  const [head, units, sets] = await Promise.all([
    db.select({ orders: count(), revenue: sum(orders.totalKrw) }).from(orders).where(where).get(),
    db
      .select({ units: sql<number>`coalesce(sum(${orderItems.qty} * ${orderItems.unitsPerPack}), 0)` })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(where)
      .get(),
    db
      .select({ c: countDistinct(orderItems.orderId) })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(where, gte(orderItems.unitsPerPack, 2)))
      .get(),
  ]);
  const orderCount = head?.orders ?? 0;
  const setOrders = sets?.c ?? 0;
  return {
    orders: orderCount,
    units: Number(units?.units ?? 0),
    revenueKrw: Number(head?.revenue ?? 0),
    setOrders,
    setShare: orderCount > 0 ? setOrders / orderCount : null,
  };
}

/** 고객 식별: 회원은 userId, 비회원은 이메일(소문자). */
const customerKey = sql<string>`coalesce(cast(${orders.userId} as text), lower(${orders.email}))`;

export interface RepurchaseRate {
  /** 기준 고객 수 (분모). */
  customers: number;
  /** 다시 구매한 고객 수 (분자). */
  repeated: number;
  /** repeated ÷ customers. 기준 고객이 REPURCHASE_MIN_CUSTOMERS 미만이면 null (데이터 부족). */
  rate: number | null;
}

/**
 * 기간 재구매율: `from` 이전에 1건 이상 산 고객 중 [from, to) 에 다시 산 고객의 비율.
 * 기획안 8-5-2 의 분기 점검 지표.
 */
export async function repurchaseRate(range: { from: Date; to: Date }): Promise<RepurchaseRate> {
  const statuses = sql.join(
    SOLD_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  );
  const row = await db.get<{ customers: number; repeated: number }>(sql`
    with prior as (
      select distinct ${customerKey} as cid from ${orders}
      where ${orders.status} in (${statuses}) and ${soldAt} < ${range.from.getTime()}
    ),
    again as (
      select distinct ${customerKey} as cid from ${orders}
      where ${orders.status} in (${statuses}) and ${soldAt} >= ${range.from.getTime()} and ${soldAt} < ${range.to.getTime()}
    )
    select (select count(*) from prior) as customers,
           (select count(*) from prior where cid in (select cid from again)) as repeated
  `);
  return finishRate(row?.customers ?? 0, row?.repeated ?? 0);
}

/** 전체 기간 단순 재구매율: 2건 이상 산 고객 ÷ 1건 이상 산 고객. 대시보드 목표 게이지용. */
export async function repurchaseRateAllTime(): Promise<RepurchaseRate> {
  const perCustomer = db
    .select({ cid: customerKey.as("cid"), c: count().as("c") })
    .from(orders)
    .where(inArray(orders.status, SOLD_STATUSES))
    .groupBy(customerKey)
    .as("per_customer");
  const [customersRow, repeatedRow] = await Promise.all([
    db.select({ c: count() }).from(perCustomer).get(),
    db.select({ c: count() }).from(perCustomer).where(gte(perCustomer.c, 2)).get(),
  ]);
  return finishRate(customersRow?.c ?? 0, repeatedRow?.c ?? 0);
}

function finishRate(customers: number, repeated: number): RepurchaseRate {
  return { customers, repeated, rate: customers >= REPURCHASE_MIN_CUSTOMERS ? repeated / customers : null };
}

export async function cumulativeUnits(): Promise<number> {
  return (await salesSummary()).units;
}

export async function reviewCount(): Promise<number> {
  const row = await db.select({ c: count() }).from(reviews).get();
  return row?.c ?? 0;
}

/** 수신 거부하지 않은 출시 알림 신청자 수 */
export async function notifySignupCount(): Promise<number> {
  const row = await db.select({ c: count() }).from(notifySignups).where(isNull(notifySignups.unsubscribedAt)).get();
  return row?.c ?? 0;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국 시간 기준 그 달의 시작(UTC Date) */
export function kstMonthStart(now: Date, monthOffset = 0): Date {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + monthOffset, 1) - KST_OFFSET_MS);
}

function kstMonthKey(d: Date): string {
  const shifted = new Date(d.getTime() + KST_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface MonthlyRow {
  /** "2026-09" (한국 시간 기준 달) */
  month: string;
  orders: number;
  units: number;
  revenueKrw: number;
  setOrders: number;
  setShare: number | null;
}

/** 최근 N개월 월별 판매 표 (비어 있는 달은 0 으로 채운다). */
export async function monthlySeries(months = 6, now: Date = new Date()): Promise<MonthlyRow[]> {
  const from = kstMonthStart(now, -(months - 1));
  const to = kstMonthStart(now, 1);
  const where = rangeWhere({ from, to });
  // 한국 시간의 달: (ms → 초) + 9시간 을 unixepoch 로 해석
  const monthExpr = sql<string>`strftime('%Y-%m', (${soldAt} / 1000) + 32400, 'unixepoch')`;
  const [heads, units, sets] = await Promise.all([
    db
      .select({ month: monthExpr, orders: count(), revenue: sum(orders.totalKrw) })
      .from(orders)
      .where(where)
      .groupBy(monthExpr),
    db
      .select({ month: monthExpr, units: sql<number>`coalesce(sum(${orderItems.qty} * ${orderItems.unitsPerPack}), 0)` })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(where)
      .groupBy(monthExpr),
    db
      .select({ month: monthExpr, c: countDistinct(orderItems.orderId) })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(where, gte(orderItems.unitsPerPack, 2)))
      .groupBy(monthExpr),
  ]);
  const byMonth = new Map<string, MonthlyRow>();
  for (let i = months - 1; i >= 0; i -= 1) {
    const key = kstMonthKey(kstMonthStart(now, -i));
    byMonth.set(key, { month: key, orders: 0, units: 0, revenueKrw: 0, setOrders: 0, setShare: null });
  }
  for (const h of heads) {
    const row = byMonth.get(h.month);
    if (row) {
      row.orders = h.orders;
      row.revenueKrw = Number(h.revenue ?? 0);
    }
  }
  for (const u of units) {
    const row = byMonth.get(u.month);
    if (row) row.units = Number(u.units ?? 0);
  }
  for (const s of sets) {
    const row = byMonth.get(s.month);
    if (row) row.setOrders = s.c;
  }
  for (const row of byMonth.values()) row.setShare = row.orders > 0 ? row.setOrders / row.orders : null;
  return [...byMonth.values()];
}

export interface GoalGauge {
  key: "notifySignups" | "cumulativeUnits" | "reviews" | "repurchaseRate";
  label: string;
  /** 기획안의 시점 */
  due: string;
  current: number | null;
  target: number;
  /** 0~1. current 가 null 이면 null */
  progress: number | null;
  /** 화면 표시용 */
  display: string;
  note?: string;
}

/** 대시보드 "기획안 목표 대비" 게이지 */
export async function goalGauges(): Promise<GoalGauge[]> {
  const [signups, units, reviewsN, repurchase] = await Promise.all([
    notifySignupCount(),
    cumulativeUnits(),
    reviewCount(),
    repurchaseRateAllTime(),
  ]);
  const gauge = (
    key: GoalGauge["key"],
    label: string,
    due: string,
    current: number,
    target: number,
    unit: string,
  ): GoalGauge => ({
    key,
    label,
    due,
    current,
    target,
    progress: Math.min(1, current / target),
    display: `${current.toLocaleString("ko-KR")}${unit} / ${target.toLocaleString("ko-KR")}${unit}`,
  });
  return [
    gauge("notifySignups", "출시 알림 신청자", "2027년 1월", signups, PLAN_TARGETS.notifySignups, "명"),
    gauge("cumulativeUnits", "누적 판매 개수", "2027년 9월", units, PLAN_TARGETS.cumulativeUnits, "개"),
    gauge("reviews", "리뷰 누적", "2027년 6월", reviewsN, PLAN_TARGETS.reviews, "건"),
    {
      key: "repurchaseRate",
      label: "재구매율",
      due: "2027년 12월",
      current: repurchase.rate,
      target: PLAN_TARGETS.repurchaseRate,
      progress: repurchase.rate === null ? null : Math.min(1, repurchase.rate / PLAN_TARGETS.repurchaseRate),
      display:
        repurchase.rate === null
          ? `데이터 부족 (구매 고객 ${repurchase.customers}명, ${REPURCHASE_MIN_CUSTOMERS}명부터 표시)`
          : `${Math.round(repurchase.rate * 1000) / 10}% / ${PLAN_TARGETS.repurchaseRate * 100}%`,
      note: "2건 이상 구매 고객 ÷ 1건 이상 구매 고객 (회원은 계정, 비회원은 이메일 기준)",
    },
  ];
}
