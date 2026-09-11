import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("analytics gtag queue", () => {
  it("does nothing without a measurement id", async () => {
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ID", "");
    const win: Record<string, unknown> = {};
    vi.stubGlobal("window", win);
    const { track } = await import("@/lib/analytics");
    track("view_item", { value: 1 });
    expect(win.dataLayer).toBeUndefined();
  });

  it("queues config before the first event and pushes Arguments objects (not arrays)", async () => {
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ID", "G-TEST123");
    const win: { dataLayer?: unknown[]; gtag?: unknown } = {};
    vi.stubGlobal("window", win);
    const { track } = await import("@/lib/analytics");
    track("view_item", { value: 32000 });
    const layer = win.dataLayer ?? [];
    expect(layer).toHaveLength(3);
    // gtag.js 는 배열이 아니라 arguments 객체만 명령으로 처리한다
    for (const entry of layer) expect(Array.isArray(entry)).toBe(false);
    const commands = layer.map((entry) => Array.from(entry as ArrayLike<unknown>));
    expect(commands[0][0]).toBe("js");
    expect(commands[1].slice(0, 2)).toEqual(["config", "G-TEST123"]);
    expect(commands[2]).toEqual(["event", "view_item", { value: 32000 }]);
    // 두 번째 호출은 다시 초기화하지 않는다
    track("add_to_cart", {});
    expect(layer).toHaveLength(4);
  });
});
