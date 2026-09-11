"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { getCart } from "@/lib/cart";
import { CheckoutError, createPendingOrder } from "@/lib/checkout";
import { setOrderTokenCookie } from "@/lib/checkout-token";
import { resolveCoupon, type CouponFailure } from "@/lib/coupons";
import { buildCheckoutSchema, type CheckoutValues } from "@/components/checkout/schema";
import type { CouponType } from "@/lib/config";
import type { Locale } from "@/i18n/config";
import { fill, formatPrice } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { getT } from "@/i18n/server";

export interface CouponActionResult {
  ok: boolean;
  coupon?: { code: string; type: CouponType; value: number; minSubtotalKrw: number };
  message: string;
}

/** 쿠폰 거절 사유 코드를 현재 언어 문구로 바꾼다. */
function couponFailureMessage(m: Messages, locale: Locale, failure: CouponFailure): string {
  if (failure.code === "minSubtotal") {
    return fill(m.actions.coupon.minSubtotal, { amount: formatPrice(failure.minSubtotalKrw ?? 0, locale) });
  }
  return m.actions.coupon[failure.code];
}

/** 쿠폰 코드 확인. 금액 조건은 현재 장바구니 합계로 검증한다. */
export async function validateCouponAction(code: string): Promise<CouponActionResult> {
  const { locale, m } = await getT();
  const ip = await clientIp();
  const limit = await rateLimit(`coupon:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!limit.ok) {
    return { ok: false, message: m.actions.generic };
  }

  if (typeof code !== "string" || code.trim().length === 0 || code.length > 40) {
    return { ok: false, message: m.actions.coupon.enter };
  }

  const [user, cart] = await Promise.all([getCurrentUser(), getCart()]);
  const result = await resolveCoupon(code, {
    userId: user?.id,
    email: user?.email,
    subtotalKrw: cart.subtotalKrw,
  });
  if (!result.ok) return { ok: false, message: couponFailureMessage(m, locale, result) };

  return {
    ok: true,
    coupon: {
      code: result.coupon.code,
      type: result.coupon.type,
      value: result.coupon.value,
      minSubtotalKrw: result.coupon.minSubtotalKrw,
    },
    message: m.actions.coupon.applied,
  };
}

export type PendingOrderActionResult =
  | {
      ok: true;
      orderNumber: string;
      amount: number;
      orderName: string;
      customerEmail: string;
      customerName: string;
      customerMobilePhone: string;
    }
  | { ok: false; message: string };

/**
 * 결제 직전 pending 주문 생성. 금액·쿠폰·재고는 모두 서버에서 다시 계산한다.
 * 클라이언트가 보낸 합계는 사용하지 않는다.
 */
export async function createPendingOrderAction(
  values: CheckoutValues,
): Promise<PendingOrderActionResult> {
  const { locale, m } = await getT();
  const ip = await clientIp();
  const limit = await rateLimit(`checkout:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!limit.ok) {
    return { ok: false, message: m.actions.tooMany };
  }

  const parsed = buildCheckoutSchema(m).safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? m.actions.invalidInput,
    };
  }

  const user = await getCurrentUser();
  const data = parsed.data;

  try {
    const order = await createPendingOrder({
      userId: user?.id ?? null,
      email: data.email,
      customerName: data.customerName,
      phone: data.phone,
      recipientName: data.recipientName,
      recipientPhone: data.recipientPhone,
      postalCode: data.postalCode,
      address1: data.address1,
      address2: data.address2,
      deliveryMemo: data.deliveryMemo,
      smsOptIn: data.smsOptIn,
      couponCode: data.couponCode || null,
    });
    // 이 브라우저가 주문 소유자임을 증명하는 토큰. 영수증 열람·실패 시 취소에 사용한다.
    await setOrderTokenCookie(order.orderNumber);
    return {
      ok: true,
      orderNumber: order.orderNumber,
      amount: order.amount,
      orderName: order.orderName,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      customerMobilePhone: order.customerMobilePhone,
    };
  } catch (error) {
    if (error instanceof CheckoutError) {
      return { ok: false, message: checkoutErrorMessage(m, locale, error) };
    }
    console.error("[checkout] createPendingOrder failed", error);
    return { ok: false, message: m.actions.checkout.createFailed };
  }
}

/** 주문 생성 실패 코드를 현재 언어 문구로 바꾼다. 알 수 없는 코드는 일반 실패 문구. */
function checkoutErrorMessage(m: Messages, locale: Locale, error: CheckoutError): string {
  switch (error.code) {
    case "EMPTY_CART":
      return m.actions.checkout.emptyCart;
    case "NOT_PURCHASABLE":
      return m.actions.checkout.notPurchasable;
    case "INVALID_AMOUNT":
      return m.actions.checkout.invalidAmount;
    case "COUPON_INVALID":
      return error.couponFailure ? couponFailureMessage(m, locale, error.couponFailure) : m.actions.coupon.invalid;
    default:
      return m.actions.checkout.createFailed;
  }
}
