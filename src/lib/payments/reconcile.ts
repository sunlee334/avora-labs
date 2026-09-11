import "server-only";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { applyPaidTransition, refundCaptureOnClosedOrder, type OrderWithItems } from "@/lib/checkout";
import { transitionOrder } from "@/lib/order-admin";
import { recordOrderEvent } from "@/lib/order-events";
import { opsAlert } from "@/lib/ops-alert";
import {
  getTossPayment,
  getTossPaymentByOrderId,
  listTossTransactions,
  type TossPaymentSnapshot,
} from "@/lib/payments/toss";

/**
 * 토스를 진실의 원천으로 두고 DB 주문 상태를 맞춘다. 웹훅·cron·관리자 버튼·일일 대사가 모두 이 함수를 부른다.
 * 웹훅 본문은 신뢰하지 않는다 — 어떤 경로로 호출되든 토스 조회 API 로 현재 상태를 다시 읽는다.
 * 같은 주문에 여러 번 호출해도 안전하다 (상태 전이는 모두 조건부 갱신).
 */
export type ReconcileSource = "webhook" | "cron" | "admin" | "daily";

export type ReconcileOutcome =
  | "not_found"
  | "no_payment"
  | "in_sync"
  | "marked_paid"
  | "cancelled"
  | "refunded"
  | "expired"
  | "waiting"
  | "needs_attention";

export interface ReconcileResult {
  orderNumber: string;
  outcome: ReconcileOutcome;
  tossStatus?: string;
  detail?: string;
}

const PAID_PLUS = new Set(["paid", "preparing", "shipped", "delivered"]);
const CLOSED = new Set(["cancelled", "refunded"]);

async function fetchSnapshot(order: OrderWithItems): Promise<TossPaymentSnapshot | null> {
  if (order.paymentKey) {
    const byKey = await getTossPayment(order.paymentKey);
    if (byKey) return byKey;
  }
  return getTossPaymentByOrderId(order.orderNumber);
}

export async function reconcileOrderWithToss(
  orderNumber: string,
  ctx: { source: ReconcileSource },
): Promise<ReconcileResult> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.orderNumber, orderNumber),
    with: { items: true },
  });
  if (!order) return { orderNumber, outcome: "not_found" };

  const snapshot = await fetchSnapshot(order);
  if (!snapshot) return { orderNumber, outcome: "no_payment" };
  const tossStatus = snapshot.status;
  const base = { orderNumber, tossStatus };

  // 토스: 승인 완료 (돈이 들어옴)
  if (tossStatus === "DONE") {
    if (PAID_PLUS.has(order.status)) return { ...base, outcome: "in_sync" };
    if (order.status === "pending") {
      const result = await applyPaidTransition(
        order,
        {
          paymentKey: snapshot.paymentKey,
          method: snapshot.method,
          totalAmount: snapshot.totalAmount,
          approvedAt: snapshot.approvedAt,
        },
        { source: ctx.source, actor: "toss" },
      );
      return { ...base, outcome: result.order.status === "cancelled" ? "cancelled" : "marked_paid" };
    }
    // 취소·환불된 주문인데 토스에는 돈이 남아 있다 → 주문은 닫힌 채 두고 결제를 돌려준다 (가상계좌·실패 시 알림).
    if (CLOSED.has(order.status) && snapshot.balanceAmount > 0) {
      const refunded = await refundCaptureOnClosedOrder(
        order,
        { paymentKey: snapshot.paymentKey, method: snapshot.method },
        { source: ctx.source, actor: "toss" },
      );
      return refunded
        ? { ...base, outcome: "cancelled", detail: "captured_on_closed_refunded" }
        : { ...base, outcome: "needs_attention", detail: "captured_but_order_closed" };
    }
    return { ...base, outcome: "in_sync" };
  }

  // 토스: 전액 취소됨 (상점관리자·외부 취소 포함)
  if (tossStatus === "CANCELED") {
    if (CLOSED.has(order.status)) return { ...base, outcome: "in_sync" };
    if (PAID_PLUS.has(order.status)) {
      const next = order.status === "paid" || order.status === "preparing" ? "cancelled" : "refunded";
      const result = await transitionOrder({
        orderId: order.id,
        next,
        reason: `토스에서 취소된 결제 반영 (${ctx.source})`,
        externalCancel: true,
        actor: "toss",
        source: ctx.source,
      });
      if (!result.ok) {
        await opsAlert("reconcile.transition_failed", { order: orderNumber, next, detail: result.message });
        return { ...base, outcome: "needs_attention", detail: result.message };
      }
      return { ...base, outcome: next };
    }
    // pending 인데 토스에서 취소됨 (가상계좌 취소 등): 주문만 닫는다.
    await closePendingOrder(order, `TOSS_${tossStatus}`, ctx.source);
    return { ...base, outcome: "expired" };
  }

  if (tossStatus === "PARTIAL_CANCELED") {
    await opsAlert("reconcile.partial_cancel", {
      order: orderNumber,
      paymentKey: snapshot.paymentKey,
      balance: snapshot.balanceAmount,
    });
    return { ...base, outcome: "needs_attention", detail: "partial_cancel" };
  }

  // 토스: 만료·중단 (가상계좌 입금 기한 경과, 인증 중단)
  if (tossStatus === "EXPIRED" || tossStatus === "ABORTED") {
    if (order.status === "pending") {
      await closePendingOrder(order, `TOSS_${tossStatus}`, ctx.source);
      return { ...base, outcome: "expired" };
    }
    if (PAID_PLUS.has(order.status)) {
      await opsAlert("reconcile.paid_order_but_toss_not_done", {
        order: orderNumber,
        status: order.status,
        tossStatus,
      });
      return { ...base, outcome: "needs_attention", detail: "paid_but_toss_not_done" };
    }
    return { ...base, outcome: "in_sync" };
  }

  // READY / IN_PROGRESS / WAITING_FOR_DEPOSIT: 아직 결과가 없다.
  return { ...base, outcome: "waiting" };
}

/** pending 주문을 닫는다 (paymentKey 유무와 무관). 토스가 결제 없음·만료·취소를 확인해 준 경우에만 쓴다. */
async function closePendingOrder(order: OrderWithItems, failReason: string, source: string): Promise<void> {
  const now = new Date();
  const [row] = await db
    .update(orders)
    .set({ status: "cancelled", failReason: failReason.slice(0, 300), cancelledAt: now, updatedAt: now })
    .where(and(eq(orders.id, order.id), eq(orders.status, "pending")))
    .returning({ id: orders.id });
  if (row) {
    await recordOrderEvent(db, { orderId: order.id, from: "pending", to: "cancelled", actor: "toss", reason: failReason, source });
  }
}

export interface ReconcileSweepSummary {
  checked: number;
  changed: ReconcileResult[];
  attention: ReconcileResult[];
  errors: number;
}

/**
 * paymentKey 를 쥔 채 오래 pending 인 주문(승인 중단·입금 대기)을 토스와 대조한다. 30분 cron 이 부른다.
 * 웹훅을 놓쳤거나 confirm 이 중간에 죽은 주문이 여기서 자동 복구된다.
 */
export async function reconcilePendingClaims(options: {
  olderThanMs?: number;
  limit?: number;
  now?: Date;
} = {}): Promise<ReconcileSweepSummary> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - (options.olderThanMs ?? 30 * 60 * 1000));
  const rows = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(and(eq(orders.status, "pending"), isNotNull(orders.paymentKey), lt(orders.updatedAt, cutoff)))
    .orderBy(orders.updatedAt)
    .limit(options.limit ?? 20);
  return runSweep(rows.map((r) => r.orderNumber), "cron");
}

/**
 * 일일 대사: 최근 거래(승인·취소)를 토스에서 받아 DB 와 어긋난 주문만 다시 맞춘다.
 * 카드사 망 장애·웹훅 유실·운영자가 상점관리자에서 직접 처리한 건을 하루 안에 잡는다.
 */
export async function reconcileRecentTransactions(options: { hours?: number; now?: Date } = {}): Promise<ReconcileSweepSummary> {
  const now = options.now ?? new Date();
  const start = new Date(now.getTime() - (options.hours ?? 26) * 60 * 60 * 1000);
  const { transactions, truncated } = await listTossTransactions({ startDate: start, endDate: now });
  if (truncated) {
    await opsAlert("reconcile.transactions_truncated", { hours: options.hours ?? 26, fetched: transactions.length }, { level: "warn" });
  }
  // 한 주문에 승인·취소 거래가 둘 다 있으면 가장 늦은 거래의 상태가 현재 상태다 (응답 순서에 기대지 않는다).
  const latest = new Map<string, { status: string; at: number }>();
  for (const tx of transactions) {
    if (!tx.orderId) continue;
    const at = Date.parse(tx.transactionAt) || 0;
    const prev = latest.get(tx.orderId);
    if (!prev || at >= prev.at) latest.set(tx.orderId, { status: tx.status, at });
  }
  if (latest.size === 0) return { checked: 0, changed: [], attention: [], errors: 0 };

  // D1 은 문장당 바인딩 100개 제한이 있으므로 90개씩 나눠 전부 읽는다 (잘려 나가는 주문이 없도록).
  const keys = [...latest.keys()];
  const rows: { orderNumber: string; status: string }[] = [];
  for (let i = 0; i < keys.length; i += 90) {
    rows.push(
      ...(await db
        .select({ orderNumber: orders.orderNumber, status: orders.status })
        .from(orders)
        .where(inArray(orders.orderNumber, keys.slice(i, i + 90)))),
    );
  }
  const mismatched: string[] = [];
  for (const row of rows) {
    const tossStatus = latest.get(row.orderNumber)?.status;
    const dbPaid = PAID_PLUS.has(row.status);
    if (
      (tossStatus === "DONE" && (row.status === "pending" || CLOSED.has(row.status))) ||
      (tossStatus === "CANCELED" && dbPaid)
    ) {
      mismatched.push(row.orderNumber);
    }
  }
  const summary = await runSweep(mismatched, "daily");
  return { ...summary, checked: rows.length };
}

async function runSweep(orderNumbers: string[], source: ReconcileSource): Promise<ReconcileSweepSummary> {
  const summary: ReconcileSweepSummary = { checked: orderNumbers.length, changed: [], attention: [], errors: 0 };
  for (const orderNumber of orderNumbers) {
    try {
      const result = await reconcileOrderWithToss(orderNumber, { source });
      if (result.outcome === "needs_attention") summary.attention.push(result);
      else if (!["in_sync", "waiting", "no_payment", "not_found"].includes(result.outcome)) summary.changed.push(result);
    } catch (error) {
      summary.errors += 1;
      await opsAlert("reconcile.failed", { order: orderNumber, source, cause: error }, { level: "warn" });
    }
  }
  return summary;
}

/** 대사 결과를 한 줄 로그로 남긴다 (cron·웹훅 공통). */
export function logSweep(event: string, summary: ReconcileSweepSummary): void {
  console.log(
    JSON.stringify({
      level: summary.attention.length > 0 || summary.errors > 0 ? "warn" : "info",
      event,
      checked: summary.checked,
      changed: summary.changed.map((r) => `${r.orderNumber}:${r.outcome}`),
      attention: summary.attention.map((r) => `${r.orderNumber}:${r.detail ?? r.outcome}`),
      errors: summary.errors,
    }),
  );
}

/** cron 이 30분마다 부르는 조합 작업. */
export async function runPendingReconcileJob(): Promise<ReconcileSweepSummary> {
  const summary = await reconcilePendingClaims();
  logSweep("reconcile.pending_claims", summary);
  return summary;
}

export async function runDailyReconcileJob(): Promise<ReconcileSweepSummary> {
  const summary = await reconcileRecentTransactions();
  logSweep("reconcile.daily", summary);
  if (summary.changed.length > 0 || summary.attention.length > 0) {
    await opsAlert(
      "reconcile.daily_mismatch",
      {
        changed: summary.changed.map((r) => `${r.orderNumber}:${r.outcome}`).join(","),
        attention: summary.attention.map((r) => `${r.orderNumber}:${r.detail ?? r.outcome}`).join(","),
      },
      { level: "warn" },
    );
  }
  return summary;
}

