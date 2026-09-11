import "server-only";
import { and, eq, gte, inArray, not, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { affectedRows } from "@/db/affected";
import { db } from "@/db/client";
import {
  couponRedemptions,
  coupons,
  orderItems,
  orders,
  variants,
  type Order,
  type OrderItem,
} from "@/db/schema";
import { clearCart, getCart } from "@/lib/cart";
import { isUniqueViolation } from "@/lib/db-errors";
import { enqueueOrderNotifications } from "@/lib/notifications/enqueue";
import { restoreCouponForOrder, restoreDeductedStock } from "@/lib/order-admin";
import { recordOrderEvent, type OrderEventActor } from "@/lib/order-events";
import { opsAlert } from "@/lib/ops-alert";
import { buildOrderName, generateOrderNumber } from "@/lib/orders";
import { cancelTossPayment, confirmTossPayment, isVirtualAccount, TossPaymentError } from "@/lib/payments/toss";
import { calculateTotals } from "@/lib/pricing";
import { resolveCoupon, type CouponFailure, type ResolvedCoupon } from "@/lib/coupons";

export type OrderWithItems = Order & { items: OrderItem[] };
/** confirmOrder 결과. confirmedNow: 이번 호출에서 pending→paid 로 바뀌었는지 */
export type ConfirmedOrder = OrderWithItems & { confirmedNow: boolean };

export class CheckoutError extends Error {
  readonly code: string;
  /** `COUPON_INVALID` 일 때 거절 사유. 서버 액션이 현재 언어 문구로 바꾼다. */
  readonly couponFailure?: CouponFailure;

  constructor(code: string, message: string, options?: { couponFailure?: CouponFailure }) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
    this.couponFailure = options?.couponFailure;
  }
}

/** 결제 대기 주문 생성 입력. 금액은 받지 않는다 — 서버가 DB에서 다시 계산한다. */
export interface CreatePendingOrderInput {
  userId?: number | null;
  email: string;
  customerName: string;
  phone: string;
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  address1: string;
  address2?: string;
  deliveryMemo?: string;
  smsOptIn?: boolean;
  couponCode?: string | null;
}

/** Toss 위젯 requestPayment에 그대로 넘길 수 있는 값들. */
export interface PendingOrderResult {
  orderId: number;
  orderNumber: string;
  amount: number;
  orderName: string;
  customerEmail: string;
  customerName: string;
  customerMobilePhone: string;
}

/**
 * 회원 첫 구매 여부. 결제 대기·취소 주문은 구매로 세지 않는다 (제품기획안 8-5-1 배송비 면제).
 */
export async function isFirstOrderForUser(userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(
      and(
        eq(orders.userId, userId),
        not(inArray(orders.status, ["pending", "cancelled"])),
      ),
    )
    .get();
  return (row?.n ?? 0) === 0;
}

/**
 * 장바구니를 기준으로 pending 주문을 만든다.
 * 금액·쿠폰·재고를 모두 서버에서 다시 검증하므로 클라이언트 값은 신뢰하지 않는다.
 */
export async function createPendingOrder(
  input: CreatePendingOrderInput,
): Promise<PendingOrderResult> {
  const cart = await getCart();
  if (cart.lines.length === 0) {
    throw new CheckoutError("EMPTY_CART", "장바구니가 비어 있습니다.");
  }
  if (!cart.purchasable) {
    throw new CheckoutError(
      "NOT_PURCHASABLE",
      "장바구니에 구매할 수 없는 상품이 있습니다. 장바구니를 확인해 주세요.",
    );
  }

  const email = input.email.trim().toLowerCase();
  const pricingItems = cart.lines.map((line) => ({
    variantId: line.variantId,
    unitPriceKrw: line.variant.priceKrw,
    qty: line.qty,
  }));
  const subtotalKrw = pricingItems.reduce((sum, it) => sum + it.unitPriceKrw * it.qty, 0);

  let coupon: ResolvedCoupon | null = null;
  if (input.couponCode?.trim()) {
    const result = await resolveCoupon(input.couponCode, {
      userId: input.userId,
      email,
      subtotalKrw,
    });
    if (!result.ok) {
      throw new CheckoutError("COUPON_INVALID", `coupon rejected: ${result.code}`, {
        couponFailure: { code: result.code, minSubtotalKrw: result.minSubtotalKrw },
      });
    }
    coupon = result.coupon;
  }

  const isFirstOrder = await isFirstOrderForUser(input.userId);
  const totals = calculateTotals({ items: pricingItems, coupon, isFirstOrder });

  if (totals.totalKrw <= 0) {
    throw new CheckoutError("INVALID_AMOUNT", "결제 금액을 계산하지 못했습니다.");
  }

  const items = cart.lines.map((line) => ({
    productId: line.variant.productId,
    variantId: line.variantId,
    productName: line.variant.product.name,
    variantName: line.variant.name,
    unitsPerPack: line.variant.unitsPerPack,
    unitPriceKrw: line.variant.priceKrw,
    qty: line.qty,
    lineTotalKrw: line.variant.priceKrw * line.qty,
  }));
  const orderName = buildOrderName(items);

  const order = await insertOrderWithRetry({
    input,
    email,
    coupon,
    totals,
    items,
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: order.totalKrw,
    orderName,
    customerEmail: order.email,
    customerName: order.customerName,
    customerMobilePhone: order.phone,
  };
}

type InsertOrderArgs = {
  input: CreatePendingOrderInput;
  email: string;
  coupon: ResolvedCoupon | null;
  totals: ReturnType<typeof calculateTotals>;
  items: {
    productId: number;
    variantId: number;
    productName: string;
    variantName: string;
    unitsPerPack: number;
    unitPriceKrw: number;
    qty: number;
    lineTotalKrw: number;
  }[];
};

/** 주문번호는 랜덤이라 충돌 가능성이 매우 낮지만, unique 위반 시 몇 번 다시 시도한다. */
async function insertOrderWithRetry(args: InsertOrderArgs): Promise<Order> {
  const { input, email, coupon, totals, items } = args;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNumber = generateOrderNumber();
    try {
      // D1 은 BEGIN/COMMIT 트랜잭션을 지원하지 않는다. 주문 → 품목 순서로 넣고,
      // 품목 삽입이 실패하면 주문을 지워 고아 주문이 남지 않게 한다.
      const [row] = await db
        .insert(orders)
        .values({
            orderNumber,
            userId: input.userId ?? null,
            status: "pending",
            email,
            customerName: input.customerName.trim(),
            phone: input.phone.trim(),
            recipientName: input.recipientName.trim(),
            recipientPhone: input.recipientPhone.trim(),
            postalCode: input.postalCode.trim(),
            address1: input.address1.trim(),
            address2: input.address2?.trim() ?? "",
            deliveryMemo: input.deliveryMemo?.trim() ?? "",
            subtotalKrw: totals.subtotalKrw,
            discountKrw: totals.discountKrw,
            shippingKrw: totals.shippingKrw,
            totalKrw: totals.totalKrw,
            couponId: coupon?.id ?? null,
            couponCode: coupon?.code ?? null,
            shippingReason: totals.shippingReason,
            smsOptIn: Boolean(input.smsOptIn),
          })
        .returning();
      try {
        // D1 은 쿼리당 바인딩 파라미터 100개 제한이 있다 (행당 9개). 10행씩 나눠 넣는다.
        const rows = items.map((item) => ({ ...item, orderId: row.id }));
        for (let i = 0; i < rows.length; i += 10) {
          await db.insert(orderItems).values(rows.slice(i, i + 10));
        }
      } catch (error) {
        try {
          await db.delete(orders).where(eq(orders.id, row.id));
        } catch (cleanupError) {
          await opsAlert("checkout.orphan_cleanup_failed", { order: orderNumber, cause: cleanupError });
        }
        throw error;
      }
      return row;
    } catch (error) {
      if (isUniqueViolation(error, "order_number")) {
        if (attempt < 4) continue;
        throw new CheckoutError("ORDER_NUMBER_COLLISION", "주문번호를 생성하지 못했습니다.");
      }
      throw error;
    }
  }
  throw new CheckoutError("ORDER_NUMBER_COLLISION", "주문번호를 생성하지 못했습니다.");
}

/** 승인 요청 결과를 알 수 없는 오류 코드. 이 경우 선점을 풀지 않는다 (돈이 움직였을 수 있다). */
const AMBIGUOUS_CONFIRM_CODES = new Set(["TIMEOUT", "NETWORK_ERROR", "INVALID_RESPONSE"]);

export interface ConfirmOrderInput {
  orderNumber: string;
  paymentKey: string;
  amount: number;
}

/**
 * 결제 승인. 같은 주문에 여러 번 호출해도 안전하다(이미 paid면 그대로 반환).
 * 금액은 클라이언트가 보낸 값이 아니라 DB에 저장된 주문 금액과 대조한다.
 */
export async function confirmOrder(input: ConfirmOrderInput): Promise<ConfirmedOrder> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.orderNumber, input.orderNumber),
    with: { items: true },
  });
  if (!order) {
    throw new CheckoutError("ORDER_NOT_FOUND", "주문을 찾을 수 없습니다.");
  }
  if (order.status === "paid") {
    // 이미 승인된 주문은 같은 paymentKey 로 다시 온 요청(새로고침·재시도)에만 응답한다.
    if (order.paymentKey !== input.paymentKey) {
      throw new CheckoutError("ORDER_NOT_FOUND", "주문을 찾을 수 없습니다.");
    }
    return { ...order, confirmedNow: false };
  }
  if (order.status !== "pending") {
    throw new CheckoutError("ORDER_NOT_PENDING", "이미 처리된 주문입니다.");
  }
  if (input.amount !== order.totalKrw) {
    await db
      .update(orders)
      .set({ failReason: "AMOUNT_MISMATCH", updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    throw new CheckoutError("AMOUNT_MISMATCH", "결제 금액이 주문 금액과 일치하지 않습니다.");
  }

  // 쿠폰 한도는 pending 생성 시점에 검사했지만, 결제 전에 같은 쿠폰으로 여러 pending 주문을 만들 수 있으므로
  // 실제 승인(캡처) 직전에 한 번 더 확인한다. 초과면 돈이 움직이기 전에 멈춘다.
  if (order.couponId) {
    const coupon = await db.query.coupons.findFirst({ where: eq(coupons.id, order.couponId) });
    const exhausted =
      !coupon ||
      !coupon.isActive ||
      (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) ||
      (coupon.perUserLimit > 0 &&
        (await countCouponRedemptions(coupon.id, order.userId, order.email)) >= coupon.perUserLimit);
    if (exhausted) {
      throw new CheckoutError("COUPON_EXHAUSTED", "쿠폰 사용 한도가 초과되었습니다. 장바구니에서 다시 주문해 주세요.");
    }
  }

  // 승인 선점: pending 이고 아직 paymentKey 가 없는 주문에만 이 paymentKey 를 기록한다.
  // 동시에 두 요청이 들어와도 한쪽만 rowsAffected=1 이 되어 Toss 승인·재고 차감이 한 번만 일어난다.
  const claim = await db
    .update(orders)
    .set({ paymentKey: input.paymentKey, updatedAt: new Date() })
    .where(
      and(
        eq(orders.id, order.id),
        eq(orders.status, "pending"),
        sql`(${orders.paymentKey} IS NULL OR ${orders.paymentKey} = ${input.paymentKey})`,
      ),
    )
    .run();
  if (affectedRows(claim) === 0) {
    const latest = await db.query.orders.findFirst({ where: eq(orders.id, order.id), with: { items: true } });
    if (latest?.status === "paid") return { ...latest, confirmedNow: false };
    throw new CheckoutError("ORDER_IN_PROGRESS", "결제 승인이 진행 중입니다. 잠시 후 주문 조회에서 확인해 주세요.");
  }

  let payment: Awaited<ReturnType<typeof confirmTossPayment>>;
  try {
    payment = await confirmTossPayment({
      paymentKey: input.paymentKey,
      orderId: order.orderNumber,
      amount: order.totalKrw,
      // 같은 주문·같은 paymentKey 재시도는 같은 키를 쓴다 (중복 승인 방지).
      idempotencyKey: `confirm-${order.orderNumber}`,
    });
  } catch (error) {
    // 토스가 명시적으로 거절한 경우(카드사 거절 등)에만 선점을 해제해 다른 결제수단으로 다시 시도할 수 있게 한다.
    // 타임아웃·네트워크·응답 해석 실패는 토스 쪽에서 승인이 끝났을 수도 있는 "결과 불명"이므로 선점(paymentKey)을 유지한다.
    // 그래야 같은 paymentKey 의 재시도만 허용되고, cron 의 pending 만료 대상에서 빠지며, 승인 중단 알림이 잡는다.
    const outcomeUnknown =
      !(error instanceof TossPaymentError) || AMBIGUOUS_CONFIRM_CODES.has(error.code);
    await db
      .update(orders)
      .set({
        ...(outcomeUnknown ? {} : { paymentKey: null }),
        failReason: error instanceof TossPaymentError ? `${error.code}: ${error.message}`.slice(0, 300) : "CONFIRM_FAILED",
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")));
    if (outcomeUnknown) {
      await opsAlert("checkout.confirm_outcome_unknown", {
        order: order.orderNumber,
        paymentKey: input.paymentKey,
        cause: error,
      });
    }
    throw error;
  }

  // 승인 응답이 DONE 이 아니면(가상계좌 입금 대기 등) 돈이 아직 들어오지 않은 것이다. paid 로 넘기지 않고
  // 선점은 유지한다 — 같은 paymentKey 로만 재시도되고, cron 만료 대상에서 빠지며, 승인 중단 알림이 사람을 부른다.
  if (payment.status !== "DONE") {
    await db
      .update(orders)
      .set({ failReason: `PAYMENT_NOT_DONE:${payment.status}`.slice(0, 300), updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")));
    await opsAlert(
      "checkout.confirm_not_done",
      { order: order.orderNumber, paymentKey: payment.paymentKey, status: payment.status, method: payment.method },
      { level: "warn" },
    );
    throw new CheckoutError("PAYMENT_NOT_DONE", "결제가 아직 확정되지 않았습니다. 입금이 확인되면 주문이 확정됩니다.");
  }

  const result = await applyPaidTransition(
    order,
    {
      paymentKey: payment.paymentKey,
      method: payment.method,
      totalAmount: payment.totalAmount,
      approvedAt: payment.approvedAt,
    },
    { source: "confirm", actor: "customer" },
  );

  // 오버셀로 자동 취소된 주문은 장바구니를 남겨 둔다 (고객이 재입고 후 다시 결제할 수 있게).
  if (!result.oversold) {
    try {
      await clearCart();
    } catch (error) {
      await opsAlert("checkout.cart_clear_failed", { order: order.orderNumber, cause: error }, { level: "warn" });
    }
  }

  return { ...result.order, confirmedNow: result.confirmedNow };
}

/** 토스에서 승인이 끝난 결제. confirm 응답과 조회(대사) 응답 양쪽에서 만든다. */
export interface PaidPaymentInfo {
  paymentKey: string;
  method: string | null;
  totalAmount: number;
  approvedAt: string | null;
}

export interface PaidTransitionResult {
  order: OrderWithItems;
  /** 이번 호출에서 pending → paid 로 바뀌었는지 (이미 paid 였거나 복구 경로면 false) */
  confirmedNow: boolean;
  /** 재고가 모자라 자동 취소(환불)까지 간 경우 */
  oversold: boolean;
}

/**
 * 돈이 이미 들어온 주문을 paid 로 만들고 부수효과(재고 차감·쿠폰 적립)를 한 번만 적용한다.
 * confirmOrder(승인 직후)와 토스 대사(웹훅·cron 이 DONE 을 확인한 경우)가 공유한다.
 * 이 아래에서 무엇이 실패하든 주문은 paid 로 남기고 알림만 남긴다 — 고객에게 오류를 보여주면 재결제로 이어진다.
 */
export async function applyPaidTransition(
  order: OrderWithItems,
  payment: PaidPaymentInfo,
  ctx: { source: string; actor: OrderEventActor },
): Promise<PaidTransitionResult> {
  const paidAt = payment.approvedAt ? new Date(payment.approvedAt) : new Date();
  // Toss 가 승인한 금액을 주문 금액과 대조한다. 승인 API 가 이미 검증하지만 기록으로 남긴다.
  const capturedMismatch = payment.totalAmount !== order.totalKrw;
  if (capturedMismatch) {
    await opsAlert("checkout.captured_amount_mismatch", {
      order: order.orderNumber,
      expected: order.totalKrw,
      captured: payment.totalAmount,
    });
  }

  // 1) 결제 완료 전환. pending 인 경우에만 바뀐다 (같은 paymentKey 로 동시에 들어온 요청 중 한쪽만 성공).
  const paidUpdate = await db
    .update(orders)
    .set({
      status: "paid",
      paymentKey: payment.paymentKey,
      paymentMethod: payment.method,
      paidAt,
      failReason: capturedMismatch ? `AMOUNT_MISMATCH_CAPTURED:${payment.totalAmount}` : null,
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, order.id), eq(orders.status, "pending")))
    .run();

  const finalOrder: OrderWithItems = {
    ...order,
    status: "paid",
    paymentKey: payment.paymentKey,
    paymentMethod: payment.method,
    paidAt,
    // DB 에 쓴 값과 같은 값을 돌려준다 (호출부가 반환값만 보고 금액 불일치를 알 수 있도록).
    failReason: capturedMismatch ? `AMOUNT_MISMATCH_CAPTURED:${payment.totalAmount}` : null,
  };
  const confirmedNow = true;

  if (affectedRows(paidUpdate) === 0) {
    // 선점 이후 상태가 바뀐 경우. 같은 paymentKey 의 동시 요청이 이미 paid 로 바꿨으면 그대로 돌려준다.
    const latest = await db.query.orders.findFirst({ where: eq(orders.id, order.id), with: { items: true } });
    if (!latest || latest.status === "pending") {
      // 조건부 갱신이 0행인데 여전히 pending 이면 설명되지 않는 상태다. 돈은 캡처됐으므로 반드시 사람이 본다.
      await opsAlert("checkout.paid_update_missed", {
        order: order.orderNumber,
        paymentKey: payment.paymentKey,
        status: latest?.status ?? "missing",
      });
      return { order: latest ?? order, confirmedNow: false, oversold: false };
    }
    if (latest.status !== "cancelled" && latest.status !== "refunded") {
      return { order: latest, confirmedNow: false, oversold: false };
    }
    // 이미 닫힌 주문(관리자·고객 취소, 오버셀 자동 취소, 토스 대사)에 돈이 들어왔다. 되살리지 않는다 —
    // 되살리면 환불된 결제가 다시 "결제 완료" 로 보이는 경로가 생긴다. 대신 캡처된 금액을 바로 돌려준다.
    await refundCaptureOnClosedOrder(latest, payment, ctx);
    return { order: latest, confirmedNow: false, oversold: false };
  }
  await recordOrderEvent(db, { orderId: order.id, from: "pending", to: "paid", actor: ctx.actor, source: ctx.source });

  // 2) 재고 차감·쿠폰 사용 기록은 한 번만, 하나의 batch(원자적)로 적용한다.
  //    D1 은 BEGIN/COMMIT 을 지원하지 않으므로 batch 를 사용한다(libsql 도 지원).
  //    여기까지 왔다면 이 호출이 주문을 paid 로 만든 것이다 (이미 paid 였던 경우는 위에서 return 했다).
  const oversoldLines: OrderItem[] = [];
  try {
    // 품목마다 [표시, 차감] 두 문장을 같은 조건(stock >= qty, 주문이 아직 paid)으로 같은 batch 에 넣는다.
    // batch 는 한 트랜잭션에서 순서대로 실행되므로 두 판단이 항상 일치한다 → 차감된 품목만 stock_deducted=1 이 된다.
    // "아직 paid" 조건은 paid 전환과 이 batch 사이에 관리자가 취소한 경우 차감을 건너뛰어, 취소된 주문에 재고가 묶이지 않게 한다.
    const stillPaid = sql`exists (select 1 from ${orders} where ${orders.id} = ${order.id} and ${orders.status} = 'paid')`;
    const stockStatements = order.items.flatMap((item) => [
      db
        .update(orderItems)
        .set({ stockDeducted: true })
        .where(
          and(
            eq(orderItems.id, item.id),
            stillPaid,
            sql`exists (select 1 from ${variants} where ${variants.id} = ${item.variantId} and ${variants.stock} >= ${item.qty})`,
          ),
        ),
      db
        .update(variants)
        .set({ stock: sql`${variants.stock} - ${item.qty}` })
        .where(and(eq(variants.id, item.variantId), gte(variants.stock, item.qty), stillPaid)),
    ]);
    const couponStatements = order.couponId
      ? [
          // 같은 주문에 이미 적립돼 있으면(중복 실행 경로) 건너뛴다. 유니크 위반으로 batch 전체(재고 차감 포함)가 취소되지 않도록.
          db
            .insert(couponRedemptions)
            .values({
              couponId: order.couponId,
              orderId: order.id,
              userId: order.userId ?? null,
              email: order.email,
            })
            .onConflictDoNothing({ target: [couponRedemptions.orderId, couponRedemptions.couponId] }),
          // usedCount 는 증가가 아니라 적립 행 수로 다시 센다. 부수효과가 두 번 돌거나 취소로 행이 지워져도 항상 일치한다.
          db
            .update(coupons)
            .set({ usedCount: sql`(select count(*) from ${couponRedemptions} where ${couponRedemptions.couponId} = ${order.couponId})` })
            .where(eq(coupons.id, order.couponId)),
        ]
      : [];
    const statements = [...stockStatements, ...couponStatements] as unknown as [
      BatchItem<"sqlite">,
      ...BatchItem<"sqlite">[],
    ];
    const results = (await db.batch(statements)) as unknown[];

    for (const [index, item] of order.items.entries()) {
      // 품목 i 의 차감 문장은 2i+1 번째. 0행이면 재고 부족으로 차감(과 표시)이 건너뛰어진 것.
      if (affectedRows(results[index * 2 + 1]) === 0) oversoldLines.push(item);
    }
    if (order.couponId && affectedRows(results[results.length - 2]) === 0) {
      // 적립 행이 이미 있었다(중복 실행). 한도 초과 여부는 승인 직전 검사가 막았으므로 기록만 남긴다.
      await opsAlert(
        "checkout.coupon_redemption_duplicate",
        { order: order.orderNumber, coupon: order.couponId },
        { level: "warn" },
      );
    }
  } catch (error) {
    await opsAlert("checkout.post_payment_side_effects_failed", { order: order.orderNumber, cause: error });
  }

  // 3) 재고가 모자랐던 품목이 있으면(마지막 재고 동시 결제) 결제를 자동 취소(환불)한다.
  //    관리자가 그 사이 취소해 batch 가 통째로 건너뛴 경우(주문이 이미 paid 가 아님)는 대상이 아니다.
  if (oversoldLines.length > 0) {
    const cancelled = await refundOversoldOrder(finalOrder, payment, oversoldLines, ctx);
    if (cancelled) return { order: cancelled, confirmedNow: false, oversold: true };
  }

  // 4) 주문 확인 알림 예약. 대기열 오류가 결제 확정을 되돌리면 안 되므로 삼키고 기록만 남긴다.
  try {
    await enqueueOrderNotifications(finalOrder, "paid");
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", event: "notify.enqueue_failed", order: order.orderNumber, stage: "paid", cause: error instanceof Error ? error.message.slice(0, 200) : String(error) }));
  }

  return { order: finalOrder, confirmedNow, oversold: false };
}

/**
 * 이미 닫힌(취소·환불) 주문에 결제가 캡처된 경우: 주문은 닫힌 채 두고 토스 결제를 전액 취소한다.
 * confirm 과 관리자 취소가 엇갈린 경우, 오버셀 자동 취소 뒤 confirm 이 늦게 돌아온 경우, 일일 대사가 발견한 경우가 모두 여기로 온다.
 * 이미 취소된 결제면 ALREADY_CANCELED_PAYMENT 로 성공 처리된다. 취소가 실패하면 알림만 남긴다 (사람이 상점관리자에서 처리).
 */
export async function refundCaptureOnClosedOrder(
  order: Order,
  payment: { paymentKey: string; method: string | null },
  ctx: { source: string; actor: OrderEventActor },
): Promise<boolean> {
  if (isVirtualAccount(payment.method)) {
    await opsAlert("checkout.captured_on_closed_order_manual", { order: order.orderNumber, paymentKey: payment.paymentKey, status: order.status });
    return false;
  }
  try {
    const cancel = await cancelTossPayment({
      paymentKey: payment.paymentKey,
      cancelReason: "취소된 주문에 승인된 결제를 자동 환불",
      idempotencyKey: `cancel-${order.orderNumber}-closed`,
    });
    if (!cancel.alreadyCancelled) {
      await db
        .update(orders)
        .set({
          paymentKey: payment.paymentKey,
          adminMemo: sql`${orders.adminMemo} || ${`${order.adminMemo ? "\n" : ""}[자동] 취소된 주문에 결제가 승인돼 전액 환불했습니다: ${cancel.cancelledAmount.toLocaleString("ko-KR")}원 (${ctx.source}).`}`,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      await recordOrderEvent(db, { orderId: order.id, from: order.status, to: order.status, actor: "system", reason: "CAPTURE_ON_CLOSED_REFUNDED", source: ctx.source });
      await opsAlert("checkout.captured_on_closed_order_refunded", { order: order.orderNumber, paymentKey: payment.paymentKey, amount: cancel.cancelledAmount }, { level: "warn" });
    }
    return true;
  } catch (error) {
    await opsAlert("checkout.captured_on_closed_order_refund_failed", { order: order.orderNumber, paymentKey: payment.paymentKey, cause: error });
    return false;
  }
}

/**
 * 오버셀 자동 환불. 돈은 받았지만 줄 물건이 없으므로 토스 결제를 전액 취소하고 주문을 닫는다.
 * 취소 API 가 실패하면 paid 로 두고 사람을 부른다 (checkout.oversold_refund_failed).
 */
async function refundOversoldOrder(
  order: OrderWithItems,
  payment: PaidPaymentInfo,
  oversoldLines: OrderItem[],
  ctx: { source: string; actor: OrderEventActor },
): Promise<OrderWithItems | null> {
  const current = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
  if (current?.status !== "paid") return null;

  await opsAlert("checkout.oversold", {
    order: order.orderNumber,
    paymentKey: payment.paymentKey,
    variants: oversoldLines.map((l) => `${l.variantId}x${l.qty}`).join(","),
  });
  if (isVirtualAccount(payment.method)) {
    // 가상계좌는 환불 계좌 없이는 취소 API 가 실패한다. 시도하지 않고 사람을 부른다 (주문은 paid 로 두고 메모).
    await db
      .update(orders)
      .set({
        adminMemo: sql`${orders.adminMemo} || ${`${order.adminMemo ? "\n" : ""}[자동] 재고 소진(${oversoldLines.map((l) => l.variantName).join(", ")})인데 가상계좌 결제라 자동 환불하지 못했습니다. 상점관리자에서 환불 후 '상점관리자에서 직접 처리' 로 취소하세요.`}`,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));
    await opsAlert("checkout.oversold_manual_refund_required", { order: order.orderNumber, paymentKey: payment.paymentKey, method: payment.method });
    return null;
  }
  try {
    const cancel = await cancelTossPayment({
      paymentKey: payment.paymentKey,
      cancelReason: "재고 소진으로 주문이 자동 취소되었습니다",
      idempotencyKey: `cancel-${order.orderNumber}-oversold`,
    });
    const now = new Date();
    const [updated] = await db
      .update(orders)
      .set({
        status: "cancelled",
        failReason: "OVERSOLD",
        cancelledAt: now,
        updatedAt: now,
        adminMemo: sql`${orders.adminMemo} || ${`${order.adminMemo ? "\n" : ""}[자동] 재고 소진(${oversoldLines.map((l) => l.variantName).join(", ")})으로 결제를 자동 취소했습니다: ${cancel.cancelledAmount.toLocaleString("ko-KR")}원.`}`,
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, "paid")))
      .returning();
    if (!updated) {
      await opsAlert("checkout.oversold_refund_state_mismatch", { order: order.orderNumber, paymentKey: payment.paymentKey });
      return null;
    }
    await recordOrderEvent(db, { orderId: order.id, from: "paid", to: "cancelled", actor: "system", reason: "OVERSOLD", source: ctx.source });
    try {
      await restoreDeductedStock(order.id);
    } catch {
      // restoreDeductedStock 가 이미 알림을 남겼다. 취소 화면의 "재고 복원" 버튼으로 재시도할 수 있다.
    }
    try {
      await restoreCouponForOrder(order.id);
    } catch (error) {
      await opsAlert("order.coupon_restore_failed", { order: order.orderNumber, cause: error });
    }
    return { ...updated, items: order.items };
  } catch (error) {
    await opsAlert("checkout.oversold_refund_failed", { order: order.orderNumber, paymentKey: payment.paymentKey, cause: error });
    return null;
  }
}

/** 회원은 userId 또는 이메일, 비회원은 이메일 기준으로 해당 쿠폰 사용 횟수를 센다. */
async function countCouponRedemptions(
  couponId: number,
  userId: number | null,
  email: string,
): Promise<number> {
  const normalizedEmail = email.trim().toLowerCase();
  const identity = userId
    ? or(eq(couponRedemptions.userId, userId), eq(couponRedemptions.email, normalizedEmail))
    : eq(couponRedemptions.email, normalizedEmail);
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(couponRedemptions)
    .where(and(eq(couponRedemptions.couponId, couponId), identity))
    .get();
  return row?.n ?? 0;
}

export interface FailOrderInput {
  orderNumber: string;
  code?: string | null;
  message?: string | null;
}

/** 결제 실패·취소 처리. pending 주문만 취소로 바꾼다. */
export async function failOrder(input: FailOrderInput): Promise<Order | null> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.orderNumber, input.orderNumber),
  });
  if (!order || order.status !== "pending") return order ?? null;
  // paymentKey 가 기록된 주문은 승인(캡처)이 진행 중일 수 있으므로 취소하지 않는다.
  if (order.paymentKey) return order;

  const reason = [input.code, input.message].filter(Boolean).join(": ").slice(0, 300);
  const [row] = await db
    .update(orders)
    .set({
      status: "cancelled",
      failReason: reason || "PAYMENT_FAILED",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, order.id), eq(orders.status, "pending"), sql`${orders.paymentKey} IS NULL`))
    .returning();
  if (row) {
    await recordOrderEvent(db, { orderId: order.id, from: "pending", to: "cancelled", actor: "customer", reason: reason || "PAYMENT_FAILED", source: "fail-url" });
  }
  return row ?? order;
}

export { TossPaymentError };
