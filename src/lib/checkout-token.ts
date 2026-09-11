import "server-only";
import { cookies } from "next/headers";
import { ORDER_TOKEN_TTL_MS, signOrderToken, verifyOrderToken } from "@/lib/order-token";

const ORDER_TOKEN_COOKIE = "paros_order_token";

/** 서버 액션·라우트 핸들러에서만 호출 가능 (쿠키 쓰기). pending 주문 생성 직후 발급한다. */
export async function setOrderTokenCookie(orderNumber: string): Promise<void> {
  const store = await cookies();
  store.set(ORDER_TOKEN_COOKIE, signOrderToken(orderNumber), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ORDER_TOKEN_TTL_MS / 1000,
  });
}

/** 현재 요청의 쿠키가 해당 주문의 소유 토큰인지 확인한다. */
export async function hasOrderToken(orderNumber: string): Promise<boolean> {
  const store = await cookies();
  return verifyOrderToken(store.get(ORDER_TOKEN_COOKIE)?.value, orderNumber);
}
