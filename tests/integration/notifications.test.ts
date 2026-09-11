import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { notifications, orders, users } from "@/db/schema";
import { runNotificationDispatch } from "@/lib/notifications/dispatch";
import { enqueueNotification, enqueueOrderNotifications } from "@/lib/notifications/enqueue";
import { renderTemplate } from "@/lib/notifications/templates";
import { installTestDb, uninstallTestDb } from "../helpers/db";

let db: Database;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-12T00:00:00Z");

async function insertUser(email: string, marketingEmailOptIn: boolean) {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "x", name: "테스트", marketingEmailOptIn })
    .returning();
  return user;
}

async function insertOrder(overrides: Partial<typeof orders.$inferInsert> = {}) {
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `PR-20260912-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      status: "delivered",
      email: "buyer@example.com",
      customerName: "구매자",
      phone: "01000000000",
      recipientName: "구매자",
      recipientPhone: "01000000000",
      postalCode: "04000",
      address1: "서울",
      subtotalKrw: 32_000,
      totalKrw: 35_000,
      ...overrides,
    })
    .returning();
  return order;
}

beforeEach(async () => {
  ({ db } = await installTestDb({ seed: true }));
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  uninstallTestDb();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("enqueueNotification", () => {
  it("dedupes on dedupe_key and returns 'duplicate' instead of throwing", async () => {
    const first = await enqueueNotification({ channel: "email", template: "season", recipient: "a@example.com", dedupeKey: "season:2027:a" });
    const second = await enqueueNotification({ channel: "email", template: "season", recipient: "a@example.com", dedupeKey: "season:2027:a" });
    expect(first).toBe("queued");
    expect(second).toBe("duplicate");
    expect(await db.query.notifications.findMany()).toHaveLength(1);
  });
});

describe("enqueueOrderNotifications", () => {
  it("schedules review + two repurchase reminders for an opted-in member on delivery", async () => {
    const member = await insertUser("member@example.com", true);
    const order = await insertOrder({ userId: member.id, email: member.email });
    const results = await enqueueOrderNotifications(order, "delivered", { now: NOW });
    expect(results).toEqual(["queued", "queued", "queued"]);
    const rows = await db.query.notifications.findMany({ where: eq(notifications.orderId, order.id) });
    const byTemplate = Object.fromEntries(rows.map((r) => [r.template, r]));
    expect(Object.keys(byTemplate).sort()).toEqual(["repurchase_6w", "repurchase_9w", "review_request"]);
    expect(byTemplate.review_request.sendAfter.getTime()).toBe(NOW.getTime() + 21 * DAY);
    expect(byTemplate.repurchase_6w.sendAfter.getTime()).toBe(NOW.getTime() + 42 * DAY);
    expect(byTemplate.repurchase_9w.sendAfter.getTime()).toBe(NOW.getTime() + 63 * DAY);
    expect(rows.every((r) => r.recipient === member.email && r.channel === "email" && r.status === "queued")).toBe(true);
    // 같은 전이가 두 번 실행돼도 중복으로 쌓이지 않는다
    expect(await enqueueOrderNotifications(order, "delivered", { now: NOW })).toEqual(["duplicate", "duplicate", "duplicate"]);
  });

  it("schedules only the review request for a guest, and nothing for a member without marketing consent", async () => {
    const guest = await insertOrder({ userId: null, email: "guest@example.com" });
    expect(await enqueueOrderNotifications(guest, "delivered", { now: NOW })).toEqual(["queued"]);
    const guestRows = await db.query.notifications.findMany({ where: eq(notifications.orderId, guest.id) });
    expect(guestRows.map((r) => r.template)).toEqual(["review_request"]);

    const quiet = await insertUser("quiet@example.com", false);
    const order = await insertOrder({ userId: quiet.id, email: quiet.email });
    expect(await enqueueOrderNotifications(order, "delivered", { now: NOW })).toEqual(["queued"]);
  });

  it("paid → order_confirmed immediately with the amount; shipped → tracking payload; closed orders get nothing", async () => {
    const order = await insertOrder({ status: "paid" });
    await enqueueOrderNotifications(order, "paid", { now: NOW });
    const confirmed = await db.query.notifications.findFirst({ where: eq(notifications.orderId, order.id) });
    expect(confirmed?.template).toBe("order_confirmed");
    expect(confirmed?.sendAfter.getTime()).toBe(NOW.getTime());
    expect(JSON.parse(confirmed!.payload)).toMatchObject({ orderNumber: order.orderNumber, totalKrw: 35_000 });

    const shipped = await insertOrder({ status: "shipped", trackingCarrier: "CJ대한통운", trackingNumber: "1234567890" });
    await enqueueOrderNotifications(shipped, "shipped", { now: NOW });
    const row = await db.query.notifications.findFirst({ where: eq(notifications.orderId, shipped.id) });
    expect(JSON.parse(row!.payload)).toMatchObject({ carrier: "CJ대한통운", trackingNumber: "1234567890" });

    const cancelled = await insertOrder({ status: "cancelled" });
    expect(await enqueueOrderNotifications(cancelled, "paid", { now: NOW })).toEqual([]);
  });
});

describe("runNotificationDispatch", () => {
  it("without a provider marks due rows skipped and leaves future rows queued", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await enqueueNotification({ channel: "email", template: "season", recipient: "a@example.com", sendAfter: new Date(NOW.getTime() - 1000) });
    await enqueueNotification({ channel: "email", template: "season", recipient: "b@example.com", sendAfter: new Date(NOW.getTime() + DAY) });

    const summary = await runNotificationDispatch({ now: NOW });
    expect(summary).toEqual({ picked: 1, sent: 0, skipped: 1, failed: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
    const rows = await db.query.notifications.findMany();
    const due = rows.find((r) => r.recipient === "a@example.com")!;
    const future = rows.find((r) => r.recipient === "b@example.com")!;
    expect(due.status).toBe("skipped");
    expect(due.lastError).toBe("no_provider");
    expect(due.attempts).toBe(1);
    expect(future.status).toBe("queued");
    expect(future.attempts).toBe(0);
  });

  it("with Resend configured sends the rendered email and marks the row sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("NOTIFY_FROM_EMAIL", "PAROS <hello@avoralabs.co>");
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await enqueueNotification({
      channel: "email",
      template: "order_confirmed",
      recipient: "buyer@example.com",
      payload: { orderNumber: "PR-20260912-ABCDEF", totalKrw: 35_000 },
      sendAfter: NOW,
    });

    const summary = await runNotificationDispatch({ now: NOW });
    expect(summary).toEqual({ picked: 1, sent: 1, skipped: 0, failed: 0 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(["buyer@example.com"]);
    expect(body.subject).toContain("PR-20260912-ABCDEF");
    expect(body.text).toContain("35,000원");
    const row = (await db.query.notifications.findMany())[0];
    expect(row.status).toBe("sent");
    expect(row.sentAt?.getTime()).toBe(NOW.getTime());
  });

  it("retryable failure keeps the row queued with backoff, then fails after the attempt limit", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("NOTIFY_FROM_EMAIL", "hello@avoralabs.co");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    await enqueueNotification({ channel: "email", template: "season", recipient: "a@example.com", sendAfter: NOW });

    const first = await runNotificationDispatch({ now: NOW });
    expect(first).toEqual({ picked: 1, sent: 0, skipped: 0, failed: 0 });
    let row = (await db.query.notifications.findMany())[0];
    expect(row.status).toBe("queued");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("resend_http_503");
    expect(row.sendAfter.getTime()).toBe(NOW.getTime() + 30 * 60 * 1000);

    // 시도 횟수를 상한 직전으로 올려 두고 한 번 더 돌리면 failed 로 닫힌다
    await db.update(notifications).set({ attempts: 4, sendAfter: NOW }).where(eq(notifications.id, row.id));
    const last = await runNotificationDispatch({ now: NOW });
    expect(last).toEqual({ picked: 1, sent: 0, skipped: 0, failed: 1 });
    row = (await db.query.notifications.findMany())[0];
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(5);
  });

  it("non-retryable provider errors fail immediately without retry", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("NOTIFY_FROM_EMAIL", "hello@avoralabs.co");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 422 })));
    await enqueueNotification({ channel: "email", template: "season", recipient: "a@example.com", sendAfter: NOW });
    expect(await runNotificationDispatch({ now: NOW })).toEqual({ picked: 1, sent: 0, skipped: 0, failed: 1 });
    expect((await db.query.notifications.findMany())[0].status).toBe("failed");
  });
});

describe("renderTemplate", () => {
  it("fills variables, formats the amount per locale, and appends the opt-out line only to marketing templates", () => {
    const ko = renderTemplate("order_confirmed", "ko", { orderNumber: "PR-1", totalKrw: 35_000 });
    expect(ko.subject).toContain("PR-1");
    expect(ko.text).toContain("35,000원");
    expect(ko.text).not.toContain("수신 설정");

    const en = renderTemplate("repurchase_9w", "en", {});
    expect(en.text).toContain("Manage preferences");
    // th/vi/zh 는 영어로
    expect(renderTemplate("repurchase_6w", "th", {}).subject).toBe(renderTemplate("repurchase_6w", "en", {}).subject);
  });
});
