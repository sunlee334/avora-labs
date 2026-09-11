/**
 * 사이트 전역 상수. 회사·법정 표시, 배송 정책, CS 정보.
 * 출처: AVORA LABS 사업기획서 v04 (1장, 7-2, 7-5), PAROS 제품기획안 v09 (6장, 8-4, 8-5-1).
 * 사용자에게 보이는 문구(사이트 설명, 주소, CS 채널·시간, 인허가, 출고 안내)는 언어별 사전 `src/i18n/messages` 에 있다.
 */

export const SITE = {
  name: "PAROS",
  fullName: "PAROS by AVORA LABS",
  tagline: "FOR EVERY MOVEMENT",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;

export const COMPANY = {
  name: "아보라랩스",
  nameEn: "AVORA LABS",
  domain: "avoralabs.co",
  ceo: "이영규",
  businessNumber: "392-32-01888",
  mailOrderNumber: "2026-서울마포-2263",
  phone: "010-2173-6358",
  csChannelUrl: process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL ?? "https://pf.kakao.com/",
} as const;

/** 배송·가격 정책 (제품기획안 6-1, 8-4, 8-5-1, 10-2) */
export const SHIPPING = {
  /** 기본 배송비 (원) */
  fee: 3_000,
  /** 무료배송 기준 금액 (원). 2개 세트(56,000원)가 무료가 되도록 설정 */
  freeThreshold: 50_000,
  /** 회원 첫 구매 배송비 면제 */
  firstOrderFree: true,
  carrierDefault: "CJ대한통운",
} as const;

/**
 * 배송비 사유 라벨. 고객 화면과 관리자 화면이 같은 문구를 쓴다.
 * `none`(기본 배송비)은 고객 화면에서는 표시하지 않는다.
 */
export const SHIPPING_REASON_LABEL: Record<string, string> = {
  none: "기본 배송비",
  threshold: "5만원 이상 무료배송",
  first_order: "첫 구매 배송비 면제",
  coupon: "쿠폰 적용",
};

/**
 * 배송 메모 고정 선택지. 주문에는 언어와 무관한 키(door 등)를 저장하고, 고객 화면은 사전으로, 관리자 화면은 아래 한국어 라벨로 보여준다.
 * (번역 문구를 그대로 저장하면 창고에 태국어 메모가 도착한다.)
 */
export const DELIVERY_MEMO_KEYS = ["door", "security", "call", "locker"] as const;
export type DeliveryMemoKey = (typeof DELIVERY_MEMO_KEYS)[number];
export const DELIVERY_MEMO_LABEL: Record<DeliveryMemoKey, string> = {
  door: "부재 시 문 앞에 놓아 주세요",
  security: "부재 시 경비실에 맡겨 주세요",
  call: "배송 전에 연락해 주세요",
  locker: "택배함에 넣어 주세요",
};

/** 저장된 배송 메모(키 또는 예전 자유 문구)를 관리자용 한국어로 보여준다. */
export function deliveryMemoLabel(memo: string | null | undefined): string {
  if (!memo) return "";
  return Object.hasOwn(DELIVERY_MEMO_LABEL, memo) ? DELIVERY_MEMO_LABEL[memo as DeliveryMemoKey] : memo;
}

/** 장바구니 라인당 최대 수량 */
export const MAX_QTY_PER_LINE = 10;

export const CART_COOKIE = "paros_cart";
export const SESSION_COOKIE = "paros_session";
export const SESSION_DAYS = 30;

export const ORDER_STATUS = [
  "pending",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

/** 고객이 스스로 취소할 수 있는 상태: 출고 전. 관리자 전이 규칙(ALLOWED_TRANSITIONS)의 부분집합이다. 클라이언트에서도 쓴다. */
export const CUSTOMER_CANCELLABLE = ["paid", "preparing"] as const;

export function isCustomerCancellable(status: string): boolean {
  return (CUSTOMER_CANCELLABLE as readonly string[]).includes(status);
}

/** 고객 셀프 취소 사유. 서버 액션(검증)과 클라이언트 폼(선택지)이 같은 목록을 쓴다 — "use client" 파일에서 가져오면 서버에서는 값이 아니라 참조가 되므로 여기 둔다. */
export const CANCEL_REASONS = {
  change_of_mind: "단순 변심",
  mistake: "잘못 주문했어요 (옵션·수량·주소)",
  delivery: "배송이 너무 늦어요",
  other: "기타",
} as const;
export type CancelReason = keyof typeof CANCEL_REASONS;
export const CANCEL_REASON_KEYS = Object.keys(CANCEL_REASONS) as [CancelReason, ...CancelReason[]];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "결제 대기",
  paid: "결제 완료",
  preparing: "상품 준비 중",
  shipped: "배송 중",
  delivered: "배송 완료",
  cancelled: "주문 취소",
  refunded: "환불 완료",
};

export const PRODUCT_STATUS = ["on_sale", "upcoming", "sold_out"] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  on_sale: "판매 중",
  upcoming: "출시 예정",
  sold_out: "일시 품절",
};

export const COUPON_TYPES = ["free_shipping", "amount", "percent"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

/** 리뷰 활동 태그 (제품기획안 10-4 활동 상황 리뷰) */
export const ACTIVITY_TAGS = {
  running: "러닝",
  gym: "헬스",
  climbing: "클라이밍",
  surfing: "서핑",
  golf: "라운딩",
  hiking: "등산",
  travel: "여행",
  daily: "일상",
} as const;
export type ActivityTag = keyof typeof ACTIVITY_TAGS;

export function formatKrw(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}
