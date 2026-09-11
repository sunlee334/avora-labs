import { describe, expect, it } from "vitest";
import { ALLOWED_TRANSITIONS } from "@/app/admin/orders/shared";
import { ORDER_STATUS, type OrderStatus } from "@/lib/config";

describe("ALLOWED_TRANSITIONS", () => {
  it("covers every order status exactly once and only points at valid statuses", () => {
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual([...ORDER_STATUS].sort());
    for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
      for (const t of targets) expect(ORDER_STATUS).toContain(t);
    }
  });

  it("never allows a status to transition to itself", () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(targets).not.toContain(from as OrderStatus);
    }
  });

  it("treats cancelled and refunded as terminal", () => {
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
    expect(ALLOWED_TRANSITIONS.refunded).toEqual([]);
  });

  it("only lets an unpaid order be cancelled", () => {
    expect(ALLOWED_TRANSITIONS.pending).toEqual(["cancelled"]);
  });

  it("moves fulfilment forward one step at a time", () => {
    expect(ALLOWED_TRANSITIONS.paid).toContain("preparing");
    expect(ALLOWED_TRANSITIONS.paid).not.toContain("shipped");
    expect(ALLOWED_TRANSITIONS.preparing).toContain("shipped");
    expect(ALLOWED_TRANSITIONS.preparing).not.toContain("delivered");
    expect(ALLOWED_TRANSITIONS.shipped).toContain("delivered");
  });

  it("uses cancelled before shipment and refunded after shipment", () => {
    const cancellable = ORDER_STATUS.filter((s) => ALLOWED_TRANSITIONS[s].includes("cancelled"));
    const refundable = ORDER_STATUS.filter((s) => ALLOWED_TRANSITIONS[s].includes("refunded"));
    expect(cancellable.sort()).toEqual(["paid", "pending", "preparing"]);
    expect(refundable.sort()).toEqual(["delivered", "shipped"]);
  });
});
