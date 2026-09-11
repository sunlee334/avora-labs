import { afterEach, describe, expect, it, vi } from "vitest";
import { isTurnstileEnabled, verifyTurnstileToken } from "@/lib/turnstile";

function mockFetch(payload: unknown, ok = true) {
  const fn = vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => payload }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("verifyTurnstileToken", () => {
  it("is disabled (always passes, no network) when either key is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const fetchMock = mockFetch({ success: false });
    expect(isTurnstileEnabled()).toBe(false);
    expect(await verifyTurnstileToken(null, "1.2.3.4")).toBe(true);
    expect(await verifyTurnstileToken("anything", "1.2.3.4")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    expect(isTurnstileEnabled()).toBe(false);
    expect(await verifyTurnstileToken("anything", "1.2.3.4")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a token once enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = mockFetch({ success: true });
    expect(isTurnstileEnabled()).toBe(true);
    expect(await verifyTurnstileToken(null, "1.2.3.4")).toBe(false);
    expect(await verifyTurnstileToken("", "1.2.3.4")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts when siteverify says success and sends secret, token and ip", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = mockFetch({ success: true });
    expect(await verifyTurnstileToken("tok", "1.2.3.4")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; body: URLSearchParams }];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.method).toBe("POST");
    expect(init.body.get("secret")).toBe("secret");
    expect(init.body.get("response")).toBe("tok");
    expect(init.body.get("remoteip")).toBe("1.2.3.4");
  });

  it("omits remoteip for the local placeholder", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = mockFetch({ success: true });
    await verifyTurnstileToken("tok", "local");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }];
    expect(init.body.has("remoteip")).toBe(false);
  });

  it("rejects when siteverify says failure, returns non-2xx, or throws", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockFetch({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await verifyTurnstileToken("tok", "1.2.3.4")).toBe(false);

    mockFetch({ success: true }, false);
    expect(await verifyTurnstileToken("tok", "1.2.3.4")).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect(await verifyTurnstileToken("tok", "1.2.3.4")).toBe(false);

    // 로그에 토큰·시크릿이 남지 않는다
    for (const call of warn.mock.calls) {
      const line = String(call[0]);
      expect(line).not.toContain("tok");
      expect(line).not.toContain("secret");
    }
    warn.mockRestore();
  });
});
