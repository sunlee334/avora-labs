import { randomInt } from "node:crypto";
import type { Order, OrderItem } from "@/db/schema";
import { getContent } from "@/content";
import type { Locale } from "@/i18n/config";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 혼동 문자(0/O, 1/I) 제외

/** PR-YYYYMMDD-XXXXXX (32^6 ≈ 10억 조합/일). Toss orderId 규격(6–64자, 영문·숫자·-_) 충족. */
export function generateOrderNumber(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `PR-${y}${m}${d}-${suffix}`;
}

const ORDER_NUMBER_RE = /^PR-\d{8}-[A-Z0-9]{4,8}$/;

export function isValidOrderNumber(value: string): boolean {
  return ORDER_NUMBER_RE.test(value);
}

/** "PAROS Daily Sunscreen 본품 50ml 외 1건" 형태 (Toss orderName ≤ 100자) */
export function buildOrderName(
  items: { productName: string; variantName: string; qty: number }[],
): string {
  if (items.length === 0) return "PAROS 주문";
  const first = `${items[0].productName} ${items[0].variantName}`;
  const rest = items.length - 1;
  const name = rest > 0 ? `${first} 외 ${rest}건` : first;
  return name.length > 100 ? `${name.slice(0, 97)}...` : name;
}

/** 고객에게 내보내는 주문 품목. 내부 id 는 목록 key 용도로만 쓴다. */
export type PublicOrderItem = Pick<
  OrderItem,
  "id" | "productName" | "variantName" | "unitsPerPack" | "unitPriceKrw" | "qty" | "lineTotalKrw"
> & {
  /** 옵션 SKU. 주문 조회 시 variant 관계를 함께 읽었을 때만 채워지며, 언어별 옵션명 표시에 쓴다. */
  sku?: string | null;
};

/**
 * 비회원 주문 조회 등 고객에게 내보내는 주문 정보. `paymentKey`·관리자 메모·실패 사유·userId·couponId 처럼
 * 화면에 그리지 않는 내부 값은 서버 액션 응답(RSC 페이로드)에도 실리지 않도록 여기서 잘라낸다.
 */
export type PublicOrder = Pick<
  Order,
  | "orderNumber"
  | "status"
  | "email"
  | "customerName"
  | "phone"
  | "recipientName"
  | "recipientPhone"
  | "postalCode"
  | "address1"
  | "address2"
  | "deliveryMemo"
  | "subtotalKrw"
  | "discountKrw"
  | "shippingKrw"
  | "totalKrw"
  | "couponCode"
  | "shippingReason"
  | "paymentMethod"
  | "paidAt"
  | "trackingCarrier"
  | "trackingNumber"
  | "shippedAt"
  | "deliveredAt"
  | "cancelledAt"
  | "createdAt"
> & { items: PublicOrderItem[] };

export function toPublicOrder(
  order: Order & { items: (OrderItem & { variant?: { sku: string } | null })[] },
): PublicOrder {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    email: order.email,
    customerName: order.customerName,
    phone: order.phone,
    recipientName: order.recipientName,
    recipientPhone: order.recipientPhone,
    postalCode: order.postalCode,
    address1: order.address1,
    address2: order.address2,
    deliveryMemo: order.deliveryMemo,
    subtotalKrw: order.subtotalKrw,
    discountKrw: order.discountKrw,
    shippingKrw: order.shippingKrw,
    totalKrw: order.totalKrw,
    couponCode: order.couponCode,
    shippingReason: order.shippingReason,
    paymentMethod: order.paymentMethod,
    paidAt: order.paidAt,
    trackingCarrier: order.trackingCarrier,
    trackingNumber: order.trackingNumber,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      variantName: item.variantName,
      unitsPerPack: item.unitsPerPack,
      unitPriceKrw: item.unitPriceKrw,
      qty: item.qty,
      lineTotalKrw: item.lineTotalKrw,
      sku: item.variant?.sku ?? null,
    })),
  };
}

/** 주문 품목의 한국어 스냅샷 옵션명을 현재 언어의 카탈로그 문구로 바꾼다 (SKU 를 알 때만). 한국어는 그대로. */
export function localizeOrderItems<T extends { variantName: string; sku?: string | null }>(
  items: readonly T[],
  locale: Locale,
): T[] {
  if (locale === "ko") return [...items];
  const { CATALOG } = getContent(locale);
  return items.map((item) => {
    // sku 는 관리자 입력값이라 프로토타입 키(constructor 등)로 함수가 튀어나오지 않게 own property 만 본다.
    const name = item.sku && Object.hasOwn(CATALOG.variants, item.sku) ? CATALOG.variants[item.sku] : undefined;
    return typeof name === "string" && name ? { ...item, variantName: name } : item;
  });
}
