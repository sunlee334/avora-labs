"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { orderItems, orders, products, reviews } from "@/db/schema";
import { fill } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getCurrentUser } from "@/lib/auth/session";
import { ACTIVITY_TAGS, CANCEL_REASON_KEYS, CANCEL_REASONS, isCustomerCancellable, type ActivityTag } from "@/lib/config";
import { isUniqueViolation } from "@/lib/db-errors";
import { zodFieldErrors } from "@/lib/forms";
import { transitionOrder } from "@/lib/order-admin";
import { saveImage } from "@/lib/uploads";
import type { CustomerCancelState } from "@/components/orders/CustomerCancelForm";

export interface ReviewState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const MAX_PHOTOS = 3;
const activityKeys = Object.keys(ACTIVITY_TAGS) as [ActivityTag, ...ActivityTag[]];

/** 스키마는 요청 언어의 문구로 매번 만든다. */
function buildReviewSchema(m: Messages) {
  const r = m.actions.review;
  return z.object({
    orderId: z.coerce.number().int().positive(),
    productId: z.coerce.number().int().positive(),
    rating: z.coerce.number().int().min(1, { message: r.ratingRequired }).max(5),
    activityTag: z.enum(activityKeys, { message: r.activityRequired }),
    body: z.string().min(20, { message: r.bodyMin }).max(1000, { message: r.bodyMax }),
    disclosure: z.literal("on").optional(),
  });
}

function uploadErrorMessage(m: Messages, code: string): string {
  const r = m.actions.review;
  switch (code) {
    case "UPLOADS_UNAVAILABLE":
      return r.uploadsUnavailable;
    case "UNSUPPORTED_TYPE":
      return r.unsupportedType;
    case "FILE_TOO_LARGE":
      return r.fileTooLarge;
    default:
      return r.uploadFailed;
  }
}

export async function createReviewAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const { m } = await getT();
  const user = await getCurrentUser();
  if (!user) return { error: m.actions.loginAgain };

  const parsed = buildReviewSchema(m).safeParse({
    orderId: formData.get("orderId"),
    productId: formData.get("productId"),
    rating: formData.get("rating"),
    activityTag: formData.get("activityTag"),
    body: String(formData.get("body") ?? "").trim(),
    // 체크하지 않은 체크박스는 null 이므로 optional literal 이 통과하도록 undefined 로 바꾼다.
    disclosure: formData.get("disclosure") ?? undefined,
  });
  if (!parsed.success) {
    return { error: m.actions.invalidInput, fieldErrors: zodFieldErrors(parsed.error) };
  }
  const { orderId, productId, rating, activityTag, body, disclosure } = parsed.data;

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.userId, user.id)),
  });
  if (!order || order.status !== "delivered") {
    return { error: m.actions.review.notEligible };
  }

  const item = await db.query.orderItems.findFirst({
    where: and(eq(orderItems.orderId, orderId), eq(orderItems.productId, productId)),
  });
  if (!item) {
    return { error: m.actions.review.notInOrder };
  }

  // 사진을 디스크에 쓰기 전에 중복 작성 여부를 먼저 확인한다 (고아 파일 방지).
  const duplicate = await db.query.reviews.findFirst({
    where: and(eq(reviews.orderId, orderId), eq(reviews.productId, productId)),
  });
  if (duplicate) {
    return { error: m.actions.review.duplicate };
  }

  const photos = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > MAX_PHOTOS) {
    const message = fill(m.actions.review.tooManyPhotos, { n: MAX_PHOTOS });
    return { error: message, fieldErrors: { photos: message } };
  }

  const photoUrls: string[] = [];
  for (const file of photos) {
    try {
      const { url } = await saveImage("reviews", file);
      photoUrls.push(url);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const message = uploadErrorMessage(m, code);
      return { error: message, fieldErrors: { photos: message } };
    }
  }

  try {
    await db.insert(reviews).values({
      productId,
      orderId,
      userId: user.id,
      authorName: user.name,
      rating,
      body,
      activityTag,
      photos: JSON.stringify(photoUrls),
      disclosure: disclosure === "on",
    });
  } catch (error) {
    if (isUniqueViolation(error, "reviews")) {
      return { error: m.actions.review.duplicate };
    }
    console.error("[review] insert failed", error);
    return { error: m.actions.review.saveFailed };
  }

  const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (product) revalidatePath("/[locale]/products/[slug]", "page");
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/account/orders/[id]", "page");

  return {};
}

function buildCancelSchema(m: Messages) {
  return z.object({
    orderId: z.coerce.number().int().positive(),
    reason: z.enum(CANCEL_REASON_KEYS),
    confirm: z.literal("on", { message: m.actions.cancel.confirmRequired }),
  });
}

/** 회원 셀프 취소. 본인 주문 + 출고 전 상태만 허용하고, 실제 처리는 관리자 취소와 같은 transitionOrder 를 탄다. */
export async function cancelMyOrderAction(
  _prev: CustomerCancelState,
  formData: FormData,
): Promise<CustomerCancelState> {
  const { m } = await getT();
  const user = await getCurrentUser();
  if (!user) return { error: m.actions.loginAgain };

  const limit = await rateLimit(`order-cancel:user:${user.id}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!limit.ok) return { error: m.actions.cancel.tooMany };

  const parsed = buildCancelSchema(m).safeParse({
    orderId: formData.get("orderId"),
    reason: formData.get("reason"),
    confirm: formData.get("confirm") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? m.actions.invalidInput };
  }

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, parsed.data.orderId), eq(orders.userId, user.id)),
  });
  if (!order) return { error: m.actions.cancel.notFound };
  if (!isCustomerCancellable(order.status)) {
    return { error: m.actions.cancel.shipped };
  }

  // 관리자 화면·감사 이력에 남는 사유는 한국어로 고정한다 (운영 데이터).
  const result = await transitionOrder({
    orderId: order.id,
    next: "cancelled",
    reason: `고객 취소: ${CANCEL_REASONS[parsed.data.reason]}`,
    actor: "customer",
    source: "customer-ui",
  });
  if (!result.ok) {
    // 내부 사유(토스 오류 코드 등)는 로그에만 남기고 고객에게는 안내만 보여준다.
    console.error(JSON.stringify({ level: "warn", event: "customer_cancel.refused", detail: result.message.slice(0, 200) }));
    return { error: m.actions.cancel.failed };
  }

  revalidatePath("/[locale]/account", "page");
  revalidatePath("/[locale]/account/orders/[id]", "page");
  return { success: m.actions.cancel.success };
}
