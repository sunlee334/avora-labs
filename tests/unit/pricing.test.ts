import { describe, expect, it } from "vitest";
import { calculateDiscount, calculateSubtotal, calculateTotals } from "@/lib/pricing";
import { SHIPPING } from "@/lib/config";

const item = (unitPriceKrw: number, qty: number, variantId = 1) => ({
  variantId,
  unitPriceKrw,
  qty,
});

describe("calculateSubtotal", () => {
  it("sums unit price * qty across items", () => {
    expect(calculateSubtotal([item(10_000, 2), item(5_000, 3)])).toBe(35_000);
  });

  it("returns 0 for an empty cart", () => {
    expect(calculateSubtotal([])).toBe(0);
  });

  it("ignores negative qty by clamping to 0", () => {
    expect(calculateSubtotal([item(10_000, -5)])).toBe(0);
  });
});

describe("calculateDiscount", () => {
  it("returns not applied when there is no coupon", () => {
    expect(calculateDiscount(30_000, null)).toEqual({ discount: 0, applied: false });
    expect(calculateDiscount(30_000, undefined)).toEqual({ discount: 0, applied: false });
  });

  it("returns not applied when subtotal is 0 or less", () => {
    expect(
      calculateDiscount(0, { type: "amount", value: 5_000, minSubtotalKrw: 0 }),
    ).toEqual({ discount: 0, applied: false });
  });

  it("does not apply when subtotal is below minSubtotalKrw", () => {
    const result = calculateDiscount(20_000, {
      type: "amount",
      value: 5_000,
      minSubtotalKrw: 30_000,
    });
    expect(result).toEqual({ discount: 0, applied: false });
  });

  it("applies amount discount capped at the subtotal", () => {
    const result = calculateDiscount(10_000, {
      type: "amount",
      value: 50_000,
      minSubtotalKrw: 0,
    });
    expect(result).toEqual({ discount: 10_000, applied: true });
  });

  it("applies amount discount at face value when under the subtotal", () => {
    const result = calculateDiscount(50_000, {
      type: "amount",
      value: 5_000,
      minSubtotalKrw: 0,
    });
    expect(result).toEqual({ discount: 5_000, applied: true });
  });

  it("applies percent discount, floored, and caps the percent at 100", () => {
    const result = calculateDiscount(33_000, {
      type: "percent",
      value: 10,
      minSubtotalKrw: 0,
    });
    // 33_000 * 10 / 100 = 3_300 exactly, use an odd value to check flooring
    expect(result).toEqual({ discount: 3_300, applied: true });

    const oddResult = calculateDiscount(10_001, {
      type: "percent",
      value: 33,
      minSubtotalKrw: 0,
    });
    expect(oddResult.applied).toBe(true);
    expect(oddResult.discount).toBe(Math.floor((10_001 * 33) / 100));

    const overCapped = calculateDiscount(10_000, {
      type: "percent",
      value: 150,
      minSubtotalKrw: 0,
    });
    expect(overCapped).toEqual({ discount: 10_000, applied: true });
  });

  it("free_shipping coupon type applies with 0 amount discount", () => {
    const result = calculateDiscount(10_000, {
      type: "free_shipping",
      value: 0,
      minSubtotalKrw: 0,
    });
    expect(result).toEqual({ discount: 0, applied: true });
  });

  it("clamps negative amount discount to 0", () => {
    const result = calculateDiscount(10_000, {
      type: "amount",
      value: -5_000,
      minSubtotalKrw: 0,
    });
    expect(result).toEqual({ discount: 0, applied: true });
  });
});

describe("calculateTotals", () => {
  it("returns all zeros for an empty cart, with full free-shipping threshold remaining", () => {
    const result = calculateTotals({ items: [] });
    expect(result).toEqual({
      subtotalKrw: 0,
      discountKrw: 0,
      shippingKrw: 0,
      totalKrw: 0,
      shippingReason: "none",
      couponApplied: false,
      remainingForFreeShipping: SHIPPING.freeThreshold,
    });
  });

  it("charges shipping when subtotal is under the free-shipping threshold", () => {
    const result = calculateTotals({ items: [item(10_000, 1)] });
    expect(result.shippingKrw).toBe(SHIPPING.fee);
    expect(result.shippingReason).toBe("none");
    expect(result.totalKrw).toBe(10_000 + SHIPPING.fee);
    expect(result.remainingForFreeShipping).toBe(SHIPPING.freeThreshold - 10_000);
  });

  it("grants free shipping once subtotal (after discount) meets the threshold", () => {
    const result = calculateTotals({ items: [item(SHIPPING.freeThreshold, 1)] });
    expect(result.shippingKrw).toBe(0);
    expect(result.shippingReason).toBe("threshold");
    expect(result.remainingForFreeShipping).toBe(0);
  });

  it("grants free shipping via a free_shipping coupon below the threshold", () => {
    const result = calculateTotals({
      items: [item(20_000, 1)],
      coupon: { type: "free_shipping", value: 0, minSubtotalKrw: 0 },
    });
    expect(result.shippingKrw).toBe(0);
    expect(result.shippingReason).toBe("coupon");
    expect(result.couponApplied).toBe(true);
  });

  it("grants free shipping for a first order below the threshold", () => {
    const result = calculateTotals({ items: [item(20_000, 1)], isFirstOrder: true });
    expect(result.shippingKrw).toBe(0);
    expect(result.shippingReason).toBe("first_order");
  });

  it("threshold reason takes precedence over coupon and first_order", () => {
    const result = calculateTotals({
      items: [item(SHIPPING.freeThreshold, 1)],
      coupon: { type: "free_shipping", value: 0, minSubtotalKrw: 0 },
      isFirstOrder: true,
    });
    expect(result.shippingReason).toBe("threshold");
  });

  it("coupon reason takes precedence over first_order when threshold is not met", () => {
    const result = calculateTotals({
      items: [item(20_000, 1)],
      coupon: { type: "free_shipping", value: 0, minSubtotalKrw: 0 },
      isFirstOrder: true,
    });
    expect(result.shippingReason).toBe("coupon");
  });

  it("does not apply the coupon when minSubtotalKrw is not met, so shipping is charged normally", () => {
    const result = calculateTotals({
      items: [item(10_000, 1)],
      coupon: { type: "amount", value: 5_000, minSubtotalKrw: 50_000 },
    });
    expect(result.couponApplied).toBe(false);
    expect(result.discountKrw).toBe(0);
    expect(result.shippingKrw).toBe(SHIPPING.fee);
    expect(result.totalKrw).toBe(10_000 + SHIPPING.fee);
  });

  it("computes total as subtotal - discount + shipping", () => {
    const result = calculateTotals({
      items: [item(40_000, 1)],
      coupon: { type: "amount", value: 10_000, minSubtotalKrw: 0 },
    });
    expect(result.subtotalKrw).toBe(40_000);
    expect(result.discountKrw).toBe(10_000);
    // afterDiscount = 30_000, below threshold, no coupon free_shipping/first_order → shipping charged
    expect(result.shippingKrw).toBe(SHIPPING.fee);
    expect(result.totalKrw).toBe(30_000 + SHIPPING.fee);
  });
});
