import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("SALES_OPEN flag", () => {
  it("is closed unless NEXT_PUBLIC_SALES_OPEN is exactly '1'", async () => {
    for (const value of [undefined, "", "0", "true", "yes"]) {
      vi.resetModules();
      if (value === undefined) vi.stubEnv("NEXT_PUBLIC_SALES_OPEN", undefined as unknown as string);
      else vi.stubEnv("NEXT_PUBLIC_SALES_OPEN", value);
      const { SALES_OPEN } = await import("@/lib/config");
      expect(SALES_OPEN, String(value)).toBe(false);
    }
  });

  it("opens with '1'", async () => {
    vi.stubEnv("NEXT_PUBLIC_SALES_OPEN", "1");
    const { SALES_OPEN } = await import("@/lib/config");
    expect(SALES_OPEN).toBe(true);
  });
});
