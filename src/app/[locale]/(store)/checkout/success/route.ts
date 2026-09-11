import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/i18n/config";
import { CheckoutError, confirmOrder } from "@/lib/checkout";
import { isValidOrderNumber } from "@/lib/orders";
import { TossPaymentError } from "@/lib/payments/toss";

/**
 * 토스 결제위젯 successUrl. 서버에서 결제를 승인한 뒤 /checkout/complete 로 보낸다.
 * 라우트 핸들러로 두는 이유: 승인 결과를 새 요청에서 렌더링해야 레이아웃(헤더 장바구니 수)이
 * 비워진 카트를 반영하고, 영수증 페이지는 소유 증명(쿠키 토큰·로그인)으로 접근을 제한할 수 있다.
 */
export async function GET(request: NextRequest, context: RouteContext<"/[locale]/checkout/success">) {
  const params = request.nextUrl.searchParams;
  const paymentKey = (params.get("paymentKey") ?? "").slice(0, 200);
  const orderNumber = (params.get("orderId") ?? "").slice(0, 64);
  const amount = Number.parseInt(params.get("amount") ?? "", 10);

  // 결제창으로 나갈 때 쓴 언어 접두사를 유지해 완료 화면도 같은 언어로 보여준다.
  const { locale: rawLocale } = await context.params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const complete = new URL(localizePath(locale, "/checkout/complete"), request.url);
  if (orderNumber) complete.searchParams.set("order", orderNumber);

  if (
    !paymentKey ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(paymentKey) ||
    !isValidOrderNumber(orderNumber) ||
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    complete.searchParams.set("error", "INVALID_PARAMS");
    return NextResponse.redirect(complete, 303);
  }

  try {
    await confirmOrder({ orderNumber, paymentKey, amount });
  } catch (error) {
    if (error instanceof TossPaymentError || error instanceof CheckoutError) {
      complete.searchParams.set("error", error.code);
    } else {
      console.error("[checkout] confirm failed", error);
      complete.searchParams.set("error", "UNKNOWN");
    }
  }

  return NextResponse.redirect(complete, 303);
}
