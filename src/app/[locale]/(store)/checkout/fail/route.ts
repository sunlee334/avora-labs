import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth/session";
import { failOrder } from "@/lib/checkout";
import { hasOrderToken } from "@/lib/checkout-token";
import { isValidOrderNumber } from "@/lib/orders";

/**
 * 토스 결제위젯 failUrl(결제창에서 취소·실패). 페이지 렌더링 중에 주문을 바꾸지 않도록 라우트 핸들러에서
 * 처리하고 /checkout/complete 로 보낸다. 새로고침·프리페치로 취소가 반복 실행되는 일이 없다.
 * 토스가 넘긴 자유 텍스트(message)는 화면에 그리지 않는다 (코드→문구 매핑만 사용).
 */
export async function GET(request: NextRequest, context: RouteContext<"/[locale]/checkout/fail">) {
  // 토스 결제창에서 돌아오는 것은 최상위 탐색(document)이다. <img src> 같은 서브리소스 요청으로 남의 사이트에서
  // 이 URL 을 불러 결제 대기 주문을 취소시키는 것을 막는다 (헤더가 없는 구형 브라우저는 통과).
  const dest = request.headers.get("sec-fetch-dest");
  if (dest && dest !== "document") {
    return new NextResponse(null, { status: 403 });
  }
  const params = request.nextUrl.searchParams;
  // 코드 형식을 통과한 값만 쓴다. 토스의 자유 텍스트(message)는 화면에도 DB(failReason)에도 넣지 않는다 —
  // 고객이 자기 주문에 임의 문구를 심어 관리자에게 보이게 할 수 있기 때문이다.
  const rawCode = (params.get("code") ?? "").slice(0, 60);
  const code = /^[A-Z0-9_]{1,60}$/.test(rawCode) ? rawCode : "PAYMENT_FAILED";
  const orderNumber = (params.get("orderId") ?? "").slice(0, 64);

  const { locale: rawLocale } = await context.params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const complete = new URL(localizePath(locale, "/checkout/complete"), request.url);
  complete.searchParams.set("error", code);
  complete.searchParams.set("retry", "1");

  // 결제 대기 주문 취소는 그 주문을 만든 브라우저(소유 토큰) 또는 로그인한 주문자만 할 수 있다.
  if (isValidOrderNumber(orderNumber)) {
    complete.searchParams.set("order", orderNumber);
    try {
      const [order, user, tokenOk] = await Promise.all([
        db.query.orders.findFirst({ where: eq(orders.orderNumber, orderNumber) }),
        getCurrentUser(),
        hasOrderToken(orderNumber),
      ]);
      const owned = Boolean(order) && (tokenOk || (user !== null && order?.userId === user.id));
      if (owned) {
        const row = await failOrder({ orderNumber, code });
        if (row?.status === "cancelled") complete.searchParams.set("cancelled", "1");
      }
    } catch (error) {
      console.error("[checkout] fail handling error", error);
    }
  }

  return NextResponse.redirect(complete, 303);
}
