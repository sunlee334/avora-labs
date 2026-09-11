"use server";

import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import type { Messages } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { rateLimit } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { transitionOrder } from "@/lib/order-admin";
import { CANCEL_REASON_KEYS, CANCEL_REASONS, isCustomerCancellable } from "@/lib/config";
import { isValidOrderNumber, localizeOrderItems, toPublicOrder, type PublicOrder } from "@/lib/orders";
import type { CustomerCancelState } from "@/components/orders/CustomerCancelForm";

export interface LookupState {
  status: "idle" | "success" | "error";
  message?: string;
  order?: PublicOrder;
}

/** 스키마는 요청 언어의 문구로 매번 만든다. */
function buildLookupSchema(m: Messages) {
  return z.object({
    orderNumber: z.string().refine(isValidOrderNumber, { message: m.actions.lookup.orderNumberFormat }),
    email: z.email({ message: m.actions.auth.emailInvalid }).max(254),
  });
}

export async function lookupOrder(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const { locale, m } = await getT();
  const notFound: LookupState = { status: "error", message: m.actions.lookup.notFound };
  const ip = await clientIp();
  const limit = await rateLimit(`order-lookup:${ip}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!limit.ok) {
    return { status: "error", message: m.actions.generic };
  }
  // 봇 확인(Turnstile, 키가 있을 때만). 주문 테이블을 읽기 전에 거른다.
  if (!(await verifyTurnstileToken(String(formData.get("cf-turnstile-response") ?? "") || null, ip))) {
    return { status: "error", message: m.actions.botCheckFailed };
  }

  const parsed = buildLookupSchema(m).safeParse({
    orderNumber: String(formData.get("orderNumber") ?? "").trim().toUpperCase(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? notFound.message };
  }

  try {
    const order = await db.query.orders.findFirst({
      where: eq(orders.orderNumber, parsed.data.orderNumber),
      with: { items: { with: { variant: { columns: { sku: true } } } } },
    });
    if (!order || order.email.toLowerCase() !== parsed.data.email) {
      return notFound;
    }
    // 화면에 그리는 값만 내보낸다 (paymentKey·관리자 메모 등은 제외).
    const publicOrder = toPublicOrder(order);
    publicOrder.items = localizeOrderItems(publicOrder.items, locale);
    return { status: "success", order: publicOrder };
  } catch (error) {
    console.error("[orders] lookup failed", error);
    return { status: "error", message: m.actions.lookup.failed };
  }
}

function buildGuestCancelSchema(m: Messages) {
  return buildLookupSchema(m).extend({
    reason: z.enum(CANCEL_REASON_KEYS),
    confirm: z.literal("on", { message: m.actions.cancel.confirmRequired }),
  });
}

/**
 * 비회원 셀프 취소. 조회와 같은 증명(주문번호 + 주문 이메일)으로 출고 전 주문만 취소한다.
 * 환불은 원결제수단으로만 돌아가므로 제3자가 얻을 이득은 없고, 조회와 같은 IP 제한을 둔다.
 */
export async function cancelGuestOrder(_prev: CustomerCancelState, formData: FormData): Promise<CustomerCancelState> {
  const { m } = await getT();
  const ip = await clientIp();
  const limit = await rateLimit(`order-cancel:${ip}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!limit.ok) return { error: m.actions.cancel.tooMany };

  const parsed = buildGuestCancelSchema(m).safeParse({
    orderNumber: String(formData.get("orderNumber") ?? "").trim().toUpperCase(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    reason: formData.get("reason"),
    confirm: formData.get("confirm") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? m.actions.invalidInput };
  }

  // 주문번호 단위로도 제한한다 (분산 IP 로 한 주문을 반복 공격하지 못하게).
  const perOrder = await rateLimit(`order-cancel:order:${parsed.data.orderNumber}`, { limit: 3, windowMs: 60 * 60_000 });
  if (!perOrder.ok) return { error: m.actions.cancel.tooMany };

  try {
    const order = await db.query.orders.findFirst({ where: eq(orders.orderNumber, parsed.data.orderNumber) });
    if (!order || order.email.toLowerCase() !== parsed.data.email) return { error: m.actions.lookup.notFound };
    // 회원 주문은 비회원 경로로 취소할 수 없다 (주문번호·이메일이 새어도 로그인 없이는 못 건드리도록).
    if (order.userId !== null) {
      return { error: m.actions.cancel.memberOrder };
    }
    if (!isCustomerCancellable(order.status)) {
      return { error: m.actions.cancel.shipped };
    }
    // 관리자 화면·감사 이력에 남는 사유는 한국어로 고정한다 (운영 데이터).
    const result = await transitionOrder({
      orderId: order.id,
      next: "cancelled",
      reason: `고객 취소(비회원): ${CANCEL_REASONS[parsed.data.reason]}`,
      actor: "customer",
      source: "customer-ui",
    });
    if (!result.ok) {
      // 내부 사유(토스 오류 코드 등)는 로그에만 남기고 고객에게는 안내만 보여준다.
      console.error(JSON.stringify({ level: "warn", event: "customer_cancel.refused", detail: result.message.slice(0, 200) }));
      return { error: m.actions.cancel.failed };
    }
    revalidatePath("/[locale]/orders/lookup", "page");
    return { success: m.actions.cancel.successGuest };
  } catch (error) {
    console.error("[orders] guest cancel failed", error);
    return { error: m.actions.cancel.retry };
  }
}
