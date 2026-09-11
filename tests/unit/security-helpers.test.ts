import { describe, expect, it } from "vitest";
import { safeRelativePath } from "@/lib/auth/safe-path";
import { signOrderToken, verifyOrderToken, ORDER_TOKEN_TTL_MS } from "@/lib/order-token";

describe("safeRelativePath (open redirect guard)", () => {
  const fb = "/account";
  it("accepts plain same-origin paths", () => {
    expect(safeRelativePath("/admin/orders?page=2#top", fb)).toBe("/admin/orders?page=2#top");
    expect(safeRelativePath("/", fb)).toBe("/");
  });
  it("rejects protocol-relative, backslash, and absolute URLs", () => {
    expect(safeRelativePath("//evil.com", fb)).toBe(fb);
    expect(safeRelativePath("/\\evil.com", fb)).toBe(fb);
    expect(safeRelativePath("\\\\evil.com", fb)).toBe(fb);
    expect(safeRelativePath("https://evil.com", fb)).toBe(fb);
    expect(safeRelativePath("javascript:alert(1)", fb)).toBe(fb);
  });
  it("rejects control characters and overlong values", () => {
    expect(safeRelativePath("/a\nb", fb)).toBe(fb);
    expect(safeRelativePath("/" + "a".repeat(600), fb)).toBe(fb);
    expect(safeRelativePath("", fb)).toBe(fb);
  });
});

describe("order token (ownership proof)", () => {
  it("verifies a freshly signed token for the same order", () => {
    const token = signOrderToken("PR-20270512-ABCDEF");
    expect(verifyOrderToken(token, "PR-20270512-ABCDEF")).toBe(true);
  });
  it("rejects other orders, tampering, and expiry", () => {
    const now = 1_800_000_000_000;
    const token = signOrderToken("PR-20270512-ABCDEF", now);
    expect(verifyOrderToken(token, "PR-20270512-ZZZZZZ", now)).toBe(false);
    expect(verifyOrderToken(token.slice(0, -2) + "xx", "PR-20270512-ABCDEF", now)).toBe(false);
    expect(verifyOrderToken(token, "PR-20270512-ABCDEF", now + ORDER_TOKEN_TTL_MS + 1)).toBe(false);
    expect(verifyOrderToken(undefined, "PR-20270512-ABCDEF", now)).toBe(false);
    expect(verifyOrderToken("a.b", "PR-20270512-ABCDEF", now)).toBe(false);
  });
});
