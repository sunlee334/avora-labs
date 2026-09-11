"use client";

import { Card, Divider, Price } from "@/components/ui/Primitives";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { useLocale, useMessages } from "@/i18n/client";
import { fill, formatLocalDateTime, formatPrice } from "@/i18n/format";
import { deliveryMemoText } from "@/lib/delivery-memo";
import type { PublicOrder } from "@/lib/orders";
import { paymentMethodKey } from "@/lib/payments/method-key";

const TIMELINE_ORDER = ["paid", "preparing", "shipped", "delivered"] as const;

/**
 * 고객용 주문 상세. 전체 Order 행도 PublicOrder 의 상위 집합이므로 그대로 넘길 수 있다.
 * 회원 주문 상세(서버 페이지)와 비회원 조회(클라이언트 폼) 양쪽에서 쓰므로 클라이언트 컴포넌트로 두고 현재 언어 사전을 읽는다.
 */
export function OrderDetail({ order }: { order: PublicOrder }) {
  const locale = useLocale();
  const m = useMessages();
  const methodKey = paymentMethodKey(order.paymentMethod);
  const methodLabel = methodKey ? m.complete.receipt.methods[methodKey] : order.paymentMethod || "-";
  const isTerminalIssue = order.status === "cancelled" || order.status === "refunded";
  const currentStepIndex = TIMELINE_ORDER.indexOf(order.status as (typeof TIMELINE_ORDER)[number]);
  // 기본 배송비(none)는 따로 알리지 않는다.
  const shippingReasonLabel =
    order.shippingReason === "none" ? "" : (m.shippingReason[order.shippingReason] ?? "");

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-stone">{m.orderDetail.orderNumber}</p>
          <p className="font-mono text-base text-ink">{order.orderNumber}</p>
          <p className="mt-1 text-[13px] text-stone">{formatLocalDateTime(order.createdAt, locale)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </Card>

      {!isTerminalIssue ? (
        <Card>
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
            {TIMELINE_ORDER.map((key, i) => {
              const reached = currentStepIndex >= 0 && i <= currentStepIndex;
              return (
                <li key={key} className="flex items-center gap-2">
                  <span
                    className={`flex h-7 items-center rounded-full px-3 text-[12px] font-medium ${
                      reached ? "bg-ink text-paper" : "bg-paper-2 text-stone-2"
                    }`}
                  >
                    {m.orderStatus[key]}
                  </span>
                  {i < TIMELINE_ORDER.length - 1 ? <span className="text-stone-2">→</span> : null}
                </li>
              );
            })}
          </ol>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-danger">
            {m.orderStatus[order.status]}
            {order.cancelledAt ? ` · ${formatLocalDateTime(order.cancelledAt, locale)}` : ""}
          </p>
        </Card>
      )}

      <Card>
        <h3 className="mb-4 text-sm font-semibold text-ink">{m.orderDetail.items}</h3>
        <ul className="divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div>
                <p className="text-ink">{item.productName}</p>
                <p className="text-[13px] text-stone">
                  {item.variantName} · {fill(m.common.qty, { n: item.qty })} ·{" "}
                  {fill(m.common.unitPrice, { price: formatPrice(item.unitPriceKrw, locale) })}
                </p>
              </div>
              <Price value={item.lineTotalKrw} size="sm" />
            </li>
          ))}
        </ul>
        <Divider className="my-4" />
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone">{m.common.subtotal}</dt>
            <dd className="text-ink">{formatPrice(order.subtotalKrw, locale)}</dd>
          </div>
          {order.discountKrw > 0 ? (
            <div className="flex justify-between">
              <dt className="text-stone">
                {m.common.discount}
                {order.couponCode ? ` (${order.couponCode})` : ""}
              </dt>
              <dd className="text-ink">-{formatPrice(order.discountKrw, locale)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-stone">
              {m.common.shipping}
              {shippingReasonLabel ? ` (${shippingReasonLabel})` : ""}
            </dt>
            <dd className="text-ink">{order.shippingKrw === 0 ? m.common.free : formatPrice(order.shippingKrw, locale)}</dd>
          </div>
          <Divider className="my-2" />
          <div className="flex justify-between text-base font-semibold">
            <dt className="text-ink">{m.orderDetail.total}</dt>
            <dd className="text-ink">{formatPrice(order.totalKrw, locale)}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-ink">{m.orderDetail.orderer}</h3>
        <dl className="space-y-1 text-sm text-charcoal">
          <div>{order.customerName}</div>
          <div className="text-stone">{order.email}</div>
          <div className="text-stone">{order.phone}</div>
        </dl>
        <Divider className="my-4" />
        <h3 className="mb-3 text-sm font-semibold text-ink">{m.orderDetail.address}</h3>
        <dl className="space-y-1 text-sm text-charcoal">
          <div>
            {order.recipientName} · {order.recipientPhone}
          </div>
          <div className="text-stone">
            ({order.postalCode}) {order.address1} {order.address2}
          </div>
          {order.deliveryMemo ? <div className="text-stone">{deliveryMemoText(m, order.deliveryMemo)}</div> : null}
        </dl>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-ink">{m.orderDetail.payment}</h3>
        <dl className="space-y-1 text-sm text-charcoal">
          <div>{methodLabel}</div>
          <div className="text-stone">
            {order.paidAt ? formatLocalDateTime(order.paidAt, locale) : m.orderDetail.paymentPending}
          </div>
        </dl>
        {order.trackingNumber ? (
          <>
            <Divider className="my-4" />
            <h3 className="mb-3 text-sm font-semibold text-ink">{m.orderDetail.tracking}</h3>
            <p className="text-sm text-charcoal">
              {order.trackingCarrier} {order.trackingNumber}
            </p>
          </>
        ) : null}
      </Card>
    </div>
  );
}
