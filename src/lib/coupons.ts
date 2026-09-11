import "server-only";
import { and, count, eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { couponRedemptions, coupons } from "@/db/schema";
import type { CouponType } from "@/lib/config";

/** 결제·주문에 필요한 최소 쿠폰 정보. `calculateTotals`의 PricingCoupon과 호환된다. */
export interface ResolvedCoupon {
  id: number;
  code: string;
  type: CouponType;
  value: number;
  minSubtotalKrw: number;
}

/** 쿠폰 거절 사유. 고객 문구는 호출부(서버 액션)가 현재 언어 사전 `actions.coupon[code]` 로 만든다. */
export type CouponFailureCode = "enter" | "invalid" | "notYet" | "expired" | "exhausted" | "used" | "minSubtotal" | "membersOnly";

export interface CouponFailure {
  code: CouponFailureCode;
  /** `minSubtotal` 일 때 최소 주문금액 */
  minSubtotalKrw?: number;
}

export type CouponResult = ({ ok: true; coupon: ResolvedCoupon } | ({ ok: false } & CouponFailure));

export interface CouponContext {
  userId?: number | null;
  email?: string | null;
  /** 상품 합계. 최소 주문금액 검증용. 생략하면 금액 조건은 건너뛴다. */
  subtotalKrw?: number;
}

function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * 쿠폰 코드를 검증한다. 유효기간·활성 여부·전체 사용 한도·인당 사용 한도·최소 주문금액을 모두 확인한다.
 * 실패 사유는 코드로 돌려준다 — 문구는 언어별로 호출부가 만든다.
 */
export async function resolveCoupon(
  code: string,
  ctx: CouponContext = {},
): Promise<CouponResult> {
  const normalized = normalizeCouponCode(code);
  if (!normalized) {
    return { ok: false, code: "enter" };
  }

  const row = await db.query.coupons.findFirst({
    where: eq(coupons.code, normalized),
  });
  if (!row || !row.isActive) {
    return { ok: false, code: "invalid" };
  }

  const now = new Date();
  if (row.startsAt && row.startsAt > now) {
    return { ok: false, code: "notYet" };
  }
  if (row.endsAt && row.endsAt < now) {
    return { ok: false, code: "expired" };
  }
  if (row.maxUses !== null && row.usedCount >= row.maxUses) {
    return { ok: false, code: "exhausted" };
  }
  if (row.membersOnly && !ctx.userId) {
    return { ok: false, code: "membersOnly" };
  }

  if (row.perUserLimit > 0) {
    const used = await countRedemptions(row.id, ctx);
    if (used !== null && used >= row.perUserLimit) {
      return { ok: false, code: "used" };
    }
  }

  if (typeof ctx.subtotalKrw === "number" && ctx.subtotalKrw < row.minSubtotalKrw) {
    return { ok: false, code: "minSubtotal", minSubtotalKrw: row.minSubtotalKrw };
  }

  return {
    ok: true,
    coupon: {
      id: row.id,
      code: row.code,
      type: row.type,
      value: row.value,
      minSubtotalKrw: row.minSubtotalKrw,
    },
  };
}

/** 회원이면 userId, 비회원이면 이메일 기준으로 사용 횟수를 센다. 식별자가 없으면 null. */
async function countRedemptions(couponId: number, ctx: CouponContext): Promise<number | null> {
  const email = ctx.email?.trim().toLowerCase();
  const identity =
    ctx.userId && email
      ? or(eq(couponRedemptions.userId, ctx.userId), eq(couponRedemptions.email, email))
      : ctx.userId
        ? eq(couponRedemptions.userId, ctx.userId)
        : email
          ? eq(couponRedemptions.email, email)
          : null;
  if (!identity) return null;

  const row = await db
    .select({ used: count() })
    .from(couponRedemptions)
    .where(and(eq(couponRedemptions.couponId, couponId), identity))
    .get();
  return row?.used ?? 0;
}
