import { describe, expect, it } from "vitest";
import { buildOrderName, generateOrderNumber, isValidOrderNumber } from "@/lib/orders";

const TOSS_ORDER_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

describe("generateOrderNumber", () => {
  it("matches the PR-YYYYMMDD-XXXXXX format", () => {
    const now = new Date(2027, 4, 12); // 2027-05-12 (local time, month is 0-indexed)
    const orderNumber = generateOrderNumber(now);
    expect(orderNumber).toMatch(/^PR-20270512-[A-Z0-9]{6}$/);
  });

  it("satisfies Toss orderId constraints (6-64 chars, [A-Za-z0-9_-])", () => {
    const orderNumber = generateOrderNumber();
    expect(orderNumber.length).toBeGreaterThanOrEqual(6);
    expect(orderNumber.length).toBeLessThanOrEqual(64);
    expect(orderNumber).toMatch(TOSS_ORDER_ID_RE);
  });

  // 접미사 알파벳 32자 * 6자리 = 32^6 ≈ 10.7억 조합/일. 1000번 생성 시 충돌 기대값은
  // 약 4.7e-4건이므로 "충돌 0건"을 단정해도 flake 확률이 무시할 수준이다.
  it("generates unique order numbers across 1000 generations", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      set.add(generateOrderNumber());
    }
    expect(set.size).toBe(1000);
  });

  it("pads month and day with leading zeros", () => {
    const now = new Date(2027, 0, 5); // 2027-01-05
    const orderNumber = generateOrderNumber(now);
    expect(orderNumber.startsWith("PR-20270105-")).toBe(true);
  });
});

describe("isValidOrderNumber", () => {
  it("accepts a well-formed order number", () => {
    expect(isValidOrderNumber("PR-20270512-AB12")).toBe(true);
    expect(isValidOrderNumber("PR-20270512-AB1234")).toBe(true);
  });

  it("accepts every order number this module generates", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isValidOrderNumber(generateOrderNumber())).toBe(true);
    }
  });

  it("rejects malformed order numbers", () => {
    expect(isValidOrderNumber("PR-2027512-AB12")).toBe(false); // wrong date length
    expect(isValidOrderNumber("PR-20270512-A")).toBe(false); // suffix too short
    expect(isValidOrderNumber("XX-20270512-AB12")).toBe(false); // wrong prefix
    expect(isValidOrderNumber("PR-20270512-ab12")).toBe(false); // lowercase not allowed
    expect(isValidOrderNumber("")).toBe(false);
  });
});

describe("buildOrderName", () => {
  it("returns a fallback name for an empty item list", () => {
    expect(buildOrderName([])).toBe("PAROS 주문");
  });

  it("returns 'product variant' for a single item", () => {
    const name = buildOrderName([
      { productName: "PAROS Daily Sunscreen", variantName: "본품 50ml", qty: 1 },
    ]);
    expect(name).toBe("PAROS Daily Sunscreen 본품 50ml");
  });

  it("appends '외 N건' for multiple items, counting extras beyond the first", () => {
    const name = buildOrderName([
      { productName: "PAROS Daily Sunscreen", variantName: "본품 50ml", qty: 1 },
      { productName: "PAROS Daily Sunscreen", variantName: "2개 세트", qty: 1 },
      { productName: "PAROS Mini", variantName: "기본", qty: 2 },
    ]);
    expect(name).toBe("PAROS Daily Sunscreen 본품 50ml 외 2건");
  });

  it("truncates to at most 100 characters, ending in '...'", () => {
    const longProductName = "가".repeat(100);
    const name = buildOrderName([
      { productName: longProductName, variantName: "본품", qty: 1 },
    ]);
    expect(name.length).toBe(100);
    expect(name.endsWith("...")).toBe(true);
  });

  it("does not truncate when the name is exactly at the limit or under", () => {
    const name = buildOrderName([
      { productName: "PAROS", variantName: "본품 50ml", qty: 1 },
    ]);
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name).toBe("PAROS 본품 50ml");
  });
});
