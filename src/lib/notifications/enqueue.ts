import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications, users, type Order } from "@/db/schema";
import type { Locale } from "@/i18n/config";
import { isUniqueViolation } from "@/lib/db-errors";
import type { NotificationTemplate, TemplatePayload } from "./templates";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface EnqueueInput {
  channel: "email" | "sms";
  template: NotificationTemplate;
  recipient: string;
  locale?: Locale;
  payload?: TemplatePayload;
  /** 같은 키가 이미 있으면 넣지 않는다 (예: order:123:shipped). */
  dedupeKey?: string;
  orderId?: number | null;
  userId?: number | null;
  /** 이 시각 이후에 발송한다. 기본 즉시. */
  sendAfter?: Date;
}

/** 대기열에 한 건 넣는다. dedupe_key 충돌이면 "duplicate" 를 돌려주고 throw 하지 않는다. */
export async function enqueueNotification(input: EnqueueInput): Promise<"queued" | "duplicate"> {
  try {
    await db.insert(notifications).values({
      channel: input.channel,
      template: input.template,
      recipient: input.recipient,
      locale: input.locale ?? "ko",
      payload: JSON.stringify(input.payload ?? {}),
      dedupeKey: input.dedupeKey ?? null,
      orderId: input.orderId ?? null,
      userId: input.userId ?? null,
      sendAfter: input.sendAfter ?? new Date(),
    });
    return "queued";
  } catch (error) {
    if (input.dedupeKey && isUniqueViolation(error, "notifications.dedupe_key")) return "duplicate";
    throw error;
  }
}

/** 주문 알림에 필요한 최소 필드. 전체 Order 행도 그대로 넘길 수 있다. */
export type OrderForNotification = Pick<
  Order,
  "id" | "orderNumber" | "email" | "userId" | "status" | "totalKrw" | "trackingCarrier" | "trackingNumber"
>;

export type OrderNotificationEvent = "paid" | "shipped" | "delivered";

/**
 * 주문 상태 전이에 맞춰 알림을 예약한다 (제품기획안 10-2·10-4).
 * - paid: 주문 확인(즉시)
 * - shipped: 송장 안내(즉시)
 * - delivered: 3주 뒤 리뷰 요청, 6주·9주 재구매 리마인드 — 재구매 메시지는 마케팅 수신에 동의한 회원에게만
 * 취소·환불된 주문에는 아무것도 넣지 않는다. 주문 언어 컬럼이 없으므로 한국어로 보낸다.
 */
export async function enqueueOrderNotifications(
  order: OrderForNotification,
  event: OrderNotificationEvent,
  opts: { now?: Date } = {},
): Promise<Array<"queued" | "duplicate">> {
  if (order.status === "cancelled" || order.status === "refunded") return [];
  const now = opts.now ?? new Date();
  const locale: Locale = "ko";
  const base = { channel: "email" as const, recipient: order.email, locale, orderId: order.id, userId: order.userId ?? null };
  const results: Array<"queued" | "duplicate"> = [];

  if (event === "paid") {
    results.push(
      await enqueueNotification({
        ...base,
        template: "order_confirmed",
        dedupeKey: `order:${order.id}:order_confirmed`,
        payload: { orderNumber: order.orderNumber, totalKrw: order.totalKrw },
        sendAfter: now,
      }),
    );
    return results;
  }

  if (event === "shipped") {
    results.push(
      await enqueueNotification({
        ...base,
        template: "shipped",
        dedupeKey: `order:${order.id}:shipped`,
        payload: {
          orderNumber: order.orderNumber,
          carrier: order.trackingCarrier ?? "",
          trackingNumber: order.trackingNumber ?? "",
        },
        sendAfter: now,
      }),
    );
    return results;
  }

  // delivered
  results.push(
    await enqueueNotification({
      ...base,
      template: "review_request",
      dedupeKey: `order:${order.id}:review_request`,
      payload: { orderNumber: order.orderNumber },
      sendAfter: new Date(now.getTime() + 21 * DAY_MS),
    }),
  );

  const optedIn = order.userId ? await hasMarketingEmailConsent(order.userId) : false;
  if (!optedIn) return results;

  results.push(
    await enqueueNotification({
      ...base,
      template: "repurchase_6w",
      dedupeKey: `order:${order.id}:repurchase_6w`,
      payload: { orderNumber: order.orderNumber },
      sendAfter: new Date(now.getTime() + 42 * DAY_MS),
    }),
    await enqueueNotification({
      ...base,
      template: "repurchase_9w",
      dedupeKey: `order:${order.id}:repurchase_9w`,
      payload: { orderNumber: order.orderNumber },
      sendAfter: new Date(now.getTime() + 63 * DAY_MS),
    }),
  );
  return results;
}

async function hasMarketingEmailConsent(userId: number): Promise<boolean> {
  const row = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { marketingEmailOptIn: true } });
  return Boolean(row?.marketingEmailOptIn);
}
