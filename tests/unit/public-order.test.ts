import { describe, expect, it } from "vitest";
import type { Order, OrderItem } from "@/db/schema";
import { localizeOrderItems, toPublicOrder } from "@/lib/orders";
import { getContent } from "@/content";

const now = new Date("2026-09-10T00:00:00Z");

const order: Order & { items: OrderItem[] } = {
  id: 7,
  orderNumber: "PR-20260910-ABCDEF",
  userId: 3,
  status: "paid",
  email: "buyer@example.com",
  customerName: "홍길동",
  phone: "01012345678",
  recipientName: "홍길동",
  recipientPhone: "01012345678",
  postalCode: "04001",
  address1: "서울특별시 마포구",
  address2: "",
  deliveryMemo: "",
  subtotalKrw: 32_000,
  discountKrw: 0,
  shippingKrw: 3_000,
  totalKrw: 35_000,
  couponId: 9,
  couponCode: null,
  shippingReason: "none",
  smsOptIn: false,
  paymentProvider: "toss",
  paymentKey: "tgen_secret",
  paymentMethod: "카드",
  paidAt: now,
  failReason: "internal note",
  trackingCarrier: null,
  trackingNumber: null,
  shippedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  adminMemo: "[자동] 내부 메모",
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 1,
      orderId: 7,
      productId: 1,
      variantId: 1,
      productName: "PAROS Daily Sunscreen",
      variantName: "본품 50ml",
      unitsPerPack: 1,
      unitPriceKrw: 32_000,
      qty: 1,
      lineTotalKrw: 32_000,
      stockDeducted: true,
    },
  ],
};

describe("toPublicOrder", () => {
  it("strips internal fields that must never reach the customer payload", () => {
    const pub = toPublicOrder(order) as unknown as Record<string, unknown>;
    for (const key of ["id", "userId", "couponId", "paymentKey", "failReason", "adminMemo", "smsOptIn", "paymentProvider", "updatedAt"]) {
      expect(pub).not.toHaveProperty(key);
    }
    const item = (pub.items as Record<string, unknown>[])[0];
    for (const key of ["orderId", "productId", "variantId", "stockDeducted"]) {
      expect(item).not.toHaveProperty(key);
    }
  });

  it("keeps what the order detail screen renders", () => {
    const pub = toPublicOrder(order);
    expect(pub).toMatchObject({
      orderNumber: "PR-20260910-ABCDEF",
      status: "paid",
      totalKrw: 35_000,
      paymentMethod: "카드",
      recipientName: "홍길동",
    });
    expect(pub.items[0]).toEqual({
      id: 1,
      productName: "PAROS Daily Sunscreen",
      variantName: "본품 50ml",
      unitsPerPack: 1,
      unitPriceKrw: 32_000,
      qty: 1,
      lineTotalKrw: 32_000,
      sku: null,
    });
  });

  it("carries the variant SKU when the relation was loaded, and localizes the option name by SKU", () => {
    const withSku = { ...order, items: [{ ...order.items[0], variant: { sku: "PAROS-DS-50-1" } }] };
    const pub = toPublicOrder(withSku);
    expect(pub.items[0].sku).toBe("PAROS-DS-50-1");
    // 한국어는 저장된 스냅샷 그대로
    expect(localizeOrderItems(pub.items, "ko")[0].variantName).toBe("본품 50ml");
    // 다른 언어는 카탈로그 문구로 덮어쓴다
    expect(localizeOrderItems(pub.items, "en")[0].variantName).toBe(getContent("en").CATALOG.variants["PAROS-DS-50-1"]);
    expect(localizeOrderItems(pub.items, "th")[0].variantName).not.toMatch(/[가-힣]/);
    // 모르는 SKU 는 그대로 둔다
    const unknown = [{ ...pub.items[0], sku: "NOPE" }];
    expect(localizeOrderItems(unknown, "en")[0].variantName).toBe("본품 50ml");
    // 프로토타입 키를 sku 로 넣어도 함수가 이름이 되지 않는다
    for (const sku of ["constructor", "toString", "__proto__"]) {
      expect(localizeOrderItems([{ ...pub.items[0], sku }], "en")[0].variantName).toBe("본품 50ml");
    }
  });
});
