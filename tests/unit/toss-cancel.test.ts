import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelTossPayment, formatTossLocalDateTime, isVirtualAccount, TossPaymentError } from "@/lib/payments/toss";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cancelTossPayment", () => {
  it("posts the cancel reason with basic auth and the idempotency key, and sums the cancelled amount", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        paymentKey: "pk_1",
        status: "CANCELED",
        cancels: [{ cancelAmount: 35_000, cancelStatus: "DONE" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelTossPayment({
      paymentKey: "pk_1",
      cancelReason: "고객 요청",
      idempotencyKey: "cancel-PR-1",
    });

    expect(result).toEqual({ paymentKey: "pk_1", status: "CANCELED", cancelledAmount: 35_000, alreadyCancelled: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.tosspayments.com/v1/payments/pk_1/cancel");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(headers["Idempotency-Key"]).toBe("cancel-PR-1");
    expect(JSON.parse(String(init.body))).toEqual({ cancelReason: "고객 요청" });
  });

  it("treats ALREADY_CANCELED_PAYMENT as success so an admin retry is not blocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(400, { code: "ALREADY_CANCELED_PAYMENT", message: "이미 취소된 결제 입니다." })),
    );

    const result = await cancelTossPayment({ paymentKey: "pk_2", cancelReason: "x" });
    expect(result.alreadyCancelled).toBe(true);
    expect(result.status).toBe("CANCELED");
  });

  it("surfaces other Toss error codes as TossPaymentError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(403, { code: "NOT_CANCELABLE_PAYMENT", message: "취소할 수 없는 결제입니다." })),
    );

    await expect(cancelTossPayment({ paymentKey: "pk_3", cancelReason: "x" })).rejects.toMatchObject({
      name: "TossPaymentError",
      code: "NOT_CANCELABLE_PAYMENT",
      httpStatus: 403,
    });
  });

  it("maps a network failure to NETWORK_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(cancelTossPayment({ paymentKey: "pk_4", cancelReason: "x" })).rejects.toSatisfy(
      (e) => e instanceof TossPaymentError && e.code === "NETWORK_ERROR",
    );
  });
});

describe("isVirtualAccount", () => {
  it("recognises both the API code and the Korean label", () => {
    expect(isVirtualAccount("VIRTUAL_ACCOUNT")).toBe(true);
    expect(isVirtualAccount("가상계좌")).toBe(true);
    expect(isVirtualAccount("카드")).toBe(false);
    expect(isVirtualAccount(null)).toBe(false);
  });
});

describe("formatTossLocalDateTime", () => {
  it("renders the instant in Korean local time without an offset suffix", () => {
    expect(formatTossLocalDateTime(new Date("2026-09-09T18:15:00Z"))).toBe("2026-09-10T03:15:00");
    expect(formatTossLocalDateTime(new Date("2026-09-10T00:00:00+09:00"))).toBe("2026-09-10T00:00:00");
  });
});
