/**
 * 토스 `method` 값(한국어)을 언어 중립 키로 바꾼다. 고객 화면(클라이언트 컴포넌트 포함)에서 쓰므로 server-only 가 아니다.
 * 라벨은 사전 `complete.receipt.methods` 에서 찾는다.
 */
export type PaymentMethodKey = "CARD" | "VIRTUAL_ACCOUNT" | "TRANSFER" | "MOBILE_PHONE" | "EASY_PAY" | "GIFT_CERTIFICATE";

const TOSS_METHOD_KEY: Record<string, PaymentMethodKey> = {
  CARD: "CARD",
  카드: "CARD",
  VIRTUAL_ACCOUNT: "VIRTUAL_ACCOUNT",
  가상계좌: "VIRTUAL_ACCOUNT",
  TRANSFER: "TRANSFER",
  계좌이체: "TRANSFER",
  MOBILE_PHONE: "MOBILE_PHONE",
  휴대폰: "MOBILE_PHONE",
  EASY_PAY: "EASY_PAY",
  간편결제: "EASY_PAY",
  GIFT_CERTIFICATE: "GIFT_CERTIFICATE",
  상품권: "GIFT_CERTIFICATE",
};

export function paymentMethodKey(method: string | null | undefined): PaymentMethodKey | null {
  if (!method) return null;
  return Object.hasOwn(TOSS_METHOD_KEY, method) ? TOSS_METHOD_KEY[method] : null;
}
