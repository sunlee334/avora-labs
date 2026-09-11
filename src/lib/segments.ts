import "server-only";
import { and, count, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { couponRedemptions, coupons, orders } from "@/db/schema";
import { SOLD_STATUSES } from "@/lib/metrics";

/**
 * 고객 세그먼트 (사업기획서 7-5 의 4구분). 재구매 문안·필터의 기준이 된다.
 * 우선순위: funding(펀딩 참여 코드 사용) > set(세트 구매 이력) > single(단품만 구매) > new(구매 없음).
 * 한 고객이 여러 조건에 걸리면 앞선 것을 쓴다 — 펀딩 참여자는 무엇을 샀든 '펀딩 참여' 로 관리한다.
 */
export type CustomerSegment = "funding" | "set" | "single" | "new";

export const SEGMENT_LABEL: Record<CustomerSegment, string> = {
  funding: "펀딩 참여",
  set: "세트 구매",
  single: "단품 구매",
  new: "미구매",
};

export const SEGMENTS = Object.keys(SEGMENT_LABEL) as CustomerSegment[];

/** 펀딩 참여자에게 리워드와 함께 보내는 자사몰 재구매 코드 (시드) */
export const FUNDING_COUPON_CODE = "WITHPAROS";

export function isCustomerSegment(value: string): value is CustomerSegment {
  return Object.hasOwn(SEGMENT_LABEL, value);
}

export function customerSegment(input: { paidOrders: number; setOrders: number; redeemedFundingCode: boolean }): CustomerSegment {
  if (input.redeemedFundingCode) return "funding";
  if (input.setOrders > 0) return "set";
  if (input.paidOrders > 0) return "single";
  return "new";
}

/**
 * 회원 목록 한 페이지의 세그먼트를 두 번의 그룹 쿼리로 계산한다 (회원 수만큼 쿼리하지 않는다).
 * 목록에 없는 회원은 Map 에 없으므로 `?? "new"` 로 읽는다.
 */
export async function loadSegmentsForUsers(userIds: number[]): Promise<Map<number, CustomerSegment>> {
  const result = new Map<number, CustomerSegment>();
  if (userIds.length === 0) return result;

  const [orderRows, fundingRows] = await Promise.all([
    db
      .select({
        userId: orders.userId,
        paidOrders: count(),
        // 주의: select 목록 안에서 ${orders.id} 는 테이블 한정자 없이 "id" 로 렌더링돼 서브쿼리의 oi.id 로 묶인다. 이름을 직접 쓴다.
        setOrders: sql<number>`sum(case when exists (select 1 from order_items oi where oi.order_id = orders.id and oi.units_per_pack > 1) then 1 else 0 end)`,
      })
      .from(orders)
      .where(and(inArray(orders.userId, userIds), inArray(orders.status, SOLD_STATUSES), isNotNull(orders.userId)))
      .groupBy(orders.userId),
    db
      .selectDistinct({ userId: couponRedemptions.userId })
      .from(couponRedemptions)
      .innerJoin(coupons, eq(couponRedemptions.couponId, coupons.id))
      .where(and(eq(coupons.code, FUNDING_COUPON_CODE), inArray(couponRedemptions.userId, userIds))),
  ]);

  const funding = new Set(fundingRows.map((r) => r.userId).filter((id): id is number => id !== null));
  const stats = new Map<number, { paidOrders: number; setOrders: number }>();
  for (const r of orderRows) {
    if (r.userId !== null) stats.set(r.userId, { paidOrders: r.paidOrders, setOrders: Number(r.setOrders ?? 0) });
  }
  for (const id of userIds) {
    const s = stats.get(id) ?? { paidOrders: 0, setOrders: 0 };
    result.set(id, customerSegment({ ...s, redeemedFundingCode: funding.has(id) }));
  }
  return result;
}
