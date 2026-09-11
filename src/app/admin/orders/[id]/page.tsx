import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Label, Select, Textarea, FormMessage } from "@/components/ui/Field";
import { Card, Divider } from "@/components/ui/Primitives";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { db } from "@/db/client";
import { orderEvents, orders } from "@/db/schema";
import { formatKrw, ORDER_STATUS_LABEL, SHIPPING_REASON_LABEL, deliveryMemoLabel } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { isVirtualAccount } from "@/lib/payments/toss";
import {
  restoreStockAction,
  setShippingAction,
  syncOrderWithTossAction,
  updateOrderMemoAction,
  updateOrderStatusAction,
} from "../actions";
import { ALLOWED_TRANSITIONS, CARRIERS } from "../shared";

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { items: true },
  });
  if (!order) notFound();

  const events = await db.query.orderEvents.findMany({
    where: eq(orderEvents.orderId, order.id),
    orderBy: (e, { desc }) => [desc(e.createdAt), desc(e.id)],
    limit: 30,
  });
  const ACTOR_LABEL: Record<string, string> = { customer: "고객", admin: "관리자", toss: "토스", system: "자동" };

  const error = typeof sp.error === "string" ? sp.error : undefined;
  const success = typeof sp.success === "string" ? sp.success : undefined;
  const nextStatuses = ALLOWED_TRANSITIONS[order.status];
  const canShip = nextStatuses.includes("shipped");
  // 취소·환불은 결제 취소가 따라오므로 진행 전이와 분리된 폼으로 다루고, 배송 중은 송장 등록 폼(setShippingAction)으로만 간다.
  const forwardStatuses = nextStatuses.filter((s) => s !== "cancelled" && s !== "refunded" && s !== "shipped");
  const cancelTarget = nextStatuses.find((s) => s === "cancelled" || s === "refunded");
  // paymentKey 가 있으면 pending 이어도 토스에 승인된 결제가 있을 수 있다 (승인 요청 중 중단된 주문).
  const hasPayment = Boolean(cancelTarget && order.paymentKey);
  const isVirtual = hasPayment && isVirtualAccount(order.paymentMethod);
  // "상점관리자에서 직접 처리" 는 API 로 취소할 수 없는 경우에만 연다: 가상계좌, 그리고 승인 중 중단돼 토스가 취소를 거절할 수 있는 pending 주문.
  const allowManual = isVirtual || order.status === "pending";
  const isClosed = order.status === "cancelled" || order.status === "refunded";
  const canRestoreStock = isClosed && order.items.some((item) => item.stockDeducted);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/orders" className="text-[13px] text-stone hover:text-ink">
          ← 주문 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="display text-2xl text-ink">{order.orderNumber}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="mt-1 text-[13px] text-stone">{formatDateTime(order.createdAt)} 접수</p>
      </div>

      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {success ? <FormMessage tone="success">{success}</FormMessage> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-4 text-[13px] font-semibold text-charcoal">주문 상품</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-stone">
                    <th className="py-2 font-medium">상품</th>
                    <th className="py-2 font-medium">옵션</th>
                    <th className="py-2 font-medium">수량</th>
                    <th className="py-2 text-right font-medium">소계</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-b border-line last:border-0">
                      <td className="py-2.5">{item.productName}</td>
                      <td className="py-2.5 text-stone">{item.variantName}</td>
                      <td className="py-2.5">{item.qty}</td>
                      <td className="py-2.5 text-right tabular-nums">{formatKrw(item.lineTotalKrw)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Divider className="my-4" />
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-stone">상품 금액</dt>
                <dd className="tabular-nums">{formatKrw(order.subtotalKrw)}</dd>
              </div>
              {order.discountKrw > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-stone">할인{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                  <dd className="tabular-nums text-accent">-{formatKrw(order.discountKrw)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-stone">
                  배송비{" "}
                  <span className="text-[11px] text-stone-2">
                    ({SHIPPING_REASON_LABEL[order.shippingReason] ?? order.shippingReason})
                  </span>
                </dt>
                <dd className="tabular-nums">{formatKrw(order.shippingKrw)}</dd>
              </div>
              <div className="flex justify-between pt-1.5 text-[15px] font-semibold text-ink">
                <dt>총 결제 금액</dt>
                <dd className="tabular-nums">{formatKrw(order.totalKrw)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-4 text-[13px] font-semibold text-charcoal">주문자 · 배송지</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <dl className="space-y-1.5 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">주문자</dt>
                  <dd className="text-right">{order.customerName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">이메일</dt>
                  <dd className="text-right">{order.email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">연락처</dt>
                  <dd className="text-right">{order.phone}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">문자·알림톡 수신 동의</dt>
                  <dd className="text-right">{order.smsOptIn ? "동의" : "미동의"}</dd>
                </div>
              </dl>
              <dl className="space-y-1.5 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">받는 사람</dt>
                  <dd className="text-right">{order.recipientName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">연락처</dt>
                  <dd className="text-right">{order.recipientPhone}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">주소</dt>
                  <dd className="text-right">
                    ({order.postalCode}) {order.address1} {order.address2}
                  </dd>
                </div>
                {order.deliveryMemo ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-stone">배송 메모</dt>
                    <dd className="text-right">{deliveryMemoLabel(order.deliveryMemo)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-[13px] font-semibold text-charcoal">결제 정보</h2>
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-stone">결제 수단</dt>
                <dd>{order.paymentMethod ?? "-"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone">paymentKey</dt>
                <dd className="break-all text-right">{order.paymentKey ?? "-"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone">결제 일시</dt>
                <dd>{formatDateTime(order.paidAt)}</dd>
              </div>
              {order.failReason ? (
                <div className="flex justify-between">
                  <dt className="text-stone">실패 사유</dt>
                  <dd className="text-danger">{order.failReason}</dd>
                </div>
              ) : null}
              {order.trackingNumber ? (
                <>
                  <div className="flex justify-between">
                    <dt className="text-stone">택배사</dt>
                    <dd>{order.trackingCarrier}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-stone">송장 번호</dt>
                    <dd>{order.trackingNumber}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-stone">발송 일시</dt>
                    <dd>{formatDateTime(order.shippedAt)}</dd>
                  </div>
                </>
              ) : null}
              {order.deliveredAt ? (
                <div className="flex justify-between">
                  <dt className="text-stone">배송 완료</dt>
                  <dd>{formatDateTime(order.deliveredAt)}</dd>
                </div>
              ) : null}
              {order.cancelledAt ? (
                <div className="flex justify-between">
                  <dt className="text-stone">취소 일시</dt>
                  <dd>{formatDateTime(order.cancelledAt)}</dd>
                </div>
              ) : null}
            </dl>
            {order.paymentKey ? (
              <form action={syncOrderWithTossAction.bind(null, order.id)} className="mt-4">
                <SubmitButton size="sm" variant="secondary" pendingLabel="토스 조회 중…">
                  토스 결제 상태 동기화
                </SubmitButton>
                <p className="mt-2 text-[12px] leading-relaxed text-stone-2">
                  토스의 현재 결제 상태를 읽어 주문 상태를 맞춥니다. 승인 중 중단된 주문, 상점관리자에서 직접
                  취소한 결제, 가상계좌 입금 확인에 씁니다.
                </p>
              </form>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-4 text-[13px] font-semibold text-charcoal">상태 변경 이력</h2>
            {events.length === 0 ? (
              <p className="text-[13px] text-stone">기록된 이력이 없습니다.</p>
            ) : (
              <ol className="space-y-2 text-[13px]">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="whitespace-nowrap text-stone-2">{formatDateTime(e.createdAt)}</span>
                    <span className="text-ink">
                      {e.fromStatus ? `${ORDER_STATUS_LABEL[e.fromStatus as keyof typeof ORDER_STATUS_LABEL] ?? e.fromStatus} → ` : ""}
                      {ORDER_STATUS_LABEL[e.toStatus as keyof typeof ORDER_STATUS_LABEL] ?? e.toStatus}
                    </span>
                    <span className="text-stone">
                      {ACTOR_LABEL[e.actor] ?? e.actor}
                      {e.source ? ` · ${e.source}` : ""}
                    </span>
                    {e.reason ? <span className="text-stone-2">{e.reason}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-charcoal">상태 변경</h2>
            {forwardStatuses.length > 0 ? (
              <form action={updateOrderStatusAction.bind(null, order.id)} className="space-y-3">
                <div>
                  <Label htmlFor="status">다음 상태</Label>
                  <Select id="status" name="status" defaultValue={forwardStatuses[0]}>
                    {forwardStatuses.map((s) => (
                      <option key={s} value={s}>
                        {ORDER_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </div>
                <SubmitButton size="sm" className="w-full">
                  상태 변경
                </SubmitButton>
              </form>
            ) : (
              <p className="text-[13px] text-stone">
                {nextStatuses.length === 0
                  ? "더 이상 변경할 수 있는 상태가 없습니다."
                  : canShip
                    ? "다음 단계는 배송 처리입니다. 아래에서 송장을 등록해 주세요."
                    : "진행할 수 있는 다음 단계가 없습니다."}
              </p>
            )}
          </Card>

          {cancelTarget ? (
            <Card>
              <h2 className="mb-3 text-[13px] font-semibold text-charcoal">
                {cancelTarget === "refunded" ? "환불 처리" : "주문 취소"}
              </h2>
              <form action={updateOrderStatusAction.bind(null, order.id)} className="space-y-3">
                <input type="hidden" name="status" value={cancelTarget} />
                <div>
                  <Label htmlFor="reason">사유</Label>
                  <input
                    id="reason"
                    name="reason"
                    required
                    maxLength={200}
                    placeholder={cancelTarget === "refunded" ? "예: 고객 단순 변심 반품" : "예: 고객 요청 취소"}
                    className="w-full rounded-md border border-line-2 bg-white px-3.5 py-2.5 text-[15px] text-ink focus:border-ink focus:outline-none"
                  />
                </div>
                {!hasPayment ? (
                  <p className="text-[12px] leading-relaxed text-stone">결제 전 주문입니다. 결제 취소 없이 주문만 취소됩니다.</p>
                ) : isVirtual ? (
                  <p className="text-[12px] leading-relaxed text-stone">
                    가상계좌 결제는 환불 계좌가 필요해 자동으로 취소할 수 없습니다. 토스 상점관리자에서 환불을 끝낸 뒤 아래
                    확인란을 체크하고 처리해 주세요.
                  </p>
                ) : order.status === "pending" ? (
                  <p className="text-[12px] leading-relaxed text-stone">
                    결제 승인 중 중단된 주문입니다. 토스에 승인된 결제가 있으면 함께 취소(환불)하고, 없으면 주문만 취소합니다.
                    토스가 취소를 거절하면 상태는 바뀌지 않으니 상점관리자에서 결제 상태를 확인해 주세요.
                  </p>
                ) : (
                  <p className="text-[12px] leading-relaxed text-stone">
                    토스페이먼츠 결제 {formatKrw(order.totalKrw)}이 전액 취소됩니다. 결제 취소가 실패하면 주문 상태는 바뀌지
                    않습니다.{" "}
                    {cancelTarget === "refunded"
                      ? "재고는 반품이 입고된 뒤 '재고 복원' 버튼으로 되돌립니다."
                      : "승인 때 차감된 재고는 바로 복원됩니다."}
                  </p>
                )}
                {hasPayment && allowManual ? (
                  <label className="flex items-start gap-2 text-[12px] leading-relaxed text-stone">
                    <input type="checkbox" name="manualRefund" required={isVirtual} className="mt-0.5" />
                    <span>
                      토스 상점관리자에서 직접 처리했습니다 (결제 취소 API 를 호출하지 않고 상태만 변경). 메모에 기록됩니다.
                    </span>
                  </label>
                ) : null}
                <SubmitButton size="sm" variant="secondary" className="w-full">
                  {hasPayment && !isVirtual
                    ? `결제 취소 및 ${ORDER_STATUS_LABEL[cancelTarget]} 처리`
                    : `${ORDER_STATUS_LABEL[cancelTarget]} 처리`}
                </SubmitButton>
              </form>
            </Card>
          ) : null}

          {canRestoreStock ? (
            <Card>
              <h2 className="mb-3 text-[13px] font-semibold text-charcoal">재고 복원</h2>
              <p className="mb-3 text-[12px] leading-relaxed text-stone">
                {order.status === "refunded"
                  ? "반품이 입고됐다면 승인 때 차감된 재고를 되돌립니다. 한 번만 복원됩니다."
                  : "취소 시 재고 복원이 끝나지 않았습니다. 다시 시도해 주세요."}
              </p>
              <form action={restoreStockAction.bind(null, order.id)}>
                <SubmitButton size="sm" variant="secondary" className="w-full">
                  재고 복원
                </SubmitButton>
              </form>
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-charcoal">배송 처리</h2>
            {canShip ? (
              <form action={setShippingAction.bind(null, order.id)} className="space-y-3">
                <div>
                  <Label htmlFor="carrier">택배사</Label>
                  <Select id="carrier" name="carrier" defaultValue={order.trackingCarrier ?? CARRIERS[0]}>
                    {CARRIERS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="trackingNumber">송장 번호</Label>
                  <input
                    id="trackingNumber"
                    name="trackingNumber"
                    defaultValue={order.trackingNumber ?? ""}
                    required
                    className="w-full rounded-md border border-line-2 bg-white px-3.5 py-2.5 text-[15px] text-ink focus:border-ink focus:outline-none"
                  />
                </div>
                <SubmitButton size="sm" className="w-full">
                  송장 등록 및 배송 시작
                </SubmitButton>
              </form>
            ) : (
              <p className="text-[13px] text-stone">
                {order.trackingNumber
                  ? `${order.trackingCarrier} · ${order.trackingNumber}`
                  : "배송 처리 대상 상태가 아닙니다."}
              </p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-charcoal">관리자 메모</h2>
            <form action={updateOrderMemoAction.bind(null, order.id)} className="space-y-3">
              <Textarea name="memo" defaultValue={order.adminMemo} rows={4} />
              <SubmitButton size="sm" variant="secondary" className="w-full">
                메모 저장
              </SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
