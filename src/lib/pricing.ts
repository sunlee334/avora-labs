import { SHIPPING, type CouponType } from "./config";

/** 가격 계산에 필요한 최소 정보. DB 타입과 분리해 순수 함수로 유지한다. */
export interface PricingItem {
  variantId: number;
  unitPriceKrw: number;
  qty: number;
}

export interface PricingCoupon {
  type: CouponType;
  value: number;
  minSubtotalKrw: number;
}

export type ShippingReason = "none" | "threshold" | "first_order" | "coupon";

export interface PricingInput {
  items: PricingItem[];
  coupon?: PricingCoupon | null;
  /** 회원 첫 구매 여부 (배송비 면제, 제품기획안 8-5-1) */
  isFirstOrder?: boolean;
}

export interface PricingResult {
  subtotalKrw: number;
  discountKrw: number;
  shippingKrw: number;
  totalKrw: number;
  shippingReason: ShippingReason;
  /** 쿠폰이 실제로 적용되었는지 (최소 주문금액 미달이면 false) */
  couponApplied: boolean;
  /** 무료배송까지 남은 금액 (0이면 무료) */
  remainingForFreeShipping: number;
}

export function calculateSubtotal(items: PricingItem[]): number {
  return items.reduce((sum, it) => sum + it.unitPriceKrw * Math.max(0, it.qty), 0);
}

export function calculateDiscount(
  subtotal: number,
  coupon: PricingCoupon | null | undefined,
): { discount: number; applied: boolean } {
  if (!coupon || subtotal <= 0) return { discount: 0, applied: false };
  if (subtotal < coupon.minSubtotalKrw) return { discount: 0, applied: false };
  switch (coupon.type) {
    case "amount":
      return { discount: Math.min(Math.max(0, coupon.value), subtotal), applied: true };
    case "percent": {
      const pct = Math.min(Math.max(0, coupon.value), 100);
      return { discount: Math.floor((subtotal * pct) / 100), applied: true };
    }
    case "free_shipping":
      return { discount: 0, applied: true };
  }
}

export function calculateTotals(input: PricingInput): PricingResult {
  const subtotalKrw = calculateSubtotal(input.items);
  if (subtotalKrw <= 0) {
    return {
      subtotalKrw: 0,
      discountKrw: 0,
      shippingKrw: 0,
      totalKrw: 0,
      shippingReason: "none",
      couponApplied: false,
      remainingForFreeShipping: SHIPPING.freeThreshold,
    };
  }

  const { discount, applied } = calculateDiscount(subtotalKrw, input.coupon);
  const afterDiscount = subtotalKrw - discount;

  let shippingKrw: number = SHIPPING.fee;
  let shippingReason: ShippingReason = "none";
  if (afterDiscount >= SHIPPING.freeThreshold) {
    shippingKrw = 0;
    shippingReason = "threshold";
  } else if (applied && input.coupon?.type === "free_shipping") {
    shippingKrw = 0;
    shippingReason = "coupon";
  } else if (SHIPPING.firstOrderFree && input.isFirstOrder) {
    shippingKrw = 0;
    shippingReason = "first_order";
  }

  return {
    subtotalKrw,
    discountKrw: discount,
    shippingKrw,
    totalKrw: afterDiscount + shippingKrw,
    shippingReason,
    couponApplied: applied,
    remainingForFreeShipping: Math.max(0, SHIPPING.freeThreshold - afterDiscount),
  };
}
