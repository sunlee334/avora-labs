import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 주문 소유 증명 토큰(순수 함수). pending 주문을 만든 브라우저에만 발급되어
 * 결제 완료 영수증 열람과 결제 실패 시 주문 취소를 그 브라우저(또는 로그인 소유자)로 제한한다.
 * 주문번호는 송장·CS 대화로 유통되는 식별자라 비밀값이 될 수 없기 때문이다.
 */
export const ORDER_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2시간

const DEV_SECRET = "paros-dev-only-secret-change-me";
const EXAMPLE_SECRET = "dev-only-paros-auth-secret-0123456789"; // .env.example 기본값

function secret(): string {
  const value = process.env.AUTH_SECRET;
  const isProd = process.env.NODE_ENV === "production";
  if (value && value.length >= 16 && !(isProd && value === EXAMPLE_SECRET)) return value;
  if (isProd) {
    throw new Error("AUTH_SECRET 환경 변수가 필요합니다 (16자 이상, 예제 기본값 사용 불가).");
  }
  return value && value.length >= 16 ? value : DEV_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signOrderToken(orderNumber: string, now = Date.now()): string {
  const expiresAt = now + ORDER_TOKEN_TTL_MS;
  const payload = `${orderNumber}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyOrderToken(
  token: string | null | undefined,
  orderNumber: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [number, expiresRaw, signature] = parts;
  if (number !== orderNumber) return false;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;
  const expected = sign(`${number}.${expiresRaw}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
