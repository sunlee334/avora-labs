import { Divider } from "@/components/ui/Primitives";
import { fill, formatPrice } from "@/i18n/format";
import { getT } from "@/i18n/server";
import type { OrderWithItems } from "@/lib/checkout";
import { deliveryMemoText } from "@/lib/delivery-memo";
import { paymentMethodKey } from "@/lib/payments/method-key";

/**
 * 주문 완료 화면의 명세. 주문 상품·금액·배송지를 한 화면에서 확인한다.
 * `variantNames` 는 주문 품목 variantId → 현재 언어 구성 이름 (없으면 주문 시점 스냅샷 이름을 쓴다).
 */
export async function OrderReceipt({
  order,
  variantNames = {},
}: {
  order: OrderWithItems;
  variantNames?: Record<number, string>;
}) {
  const { locale, m } = await getT();
  const t = m.complete.receipt;
  const price = (value: number) => formatPrice(value, locale);
  const methodKey = paymentMethodKey(order.paymentMethod);
  const methodLabel = methodKey ? t.methods[methodKey] : order.paymentMethod || t.methods.default;

  return (
    <div className="rounded-lg border border-line bg-white/70 p-6 shadow-soft md:p-8">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex gap-3">
          <dt className="w-20 shrink-0 text-stone">{m.common.orderNumber}</dt>
          <dd className="font-medium tabular-nums text-ink">{order.orderNumber}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-20 shrink-0 text-stone">{t.paymentMethod}</dt>
          <dd className="text-ink">{methodLabel}</dd>
        </div>
      </dl>

      <Divider className="my-6" />

      <h2 className="text-sm font-semibold tracking-tight text-ink">{t.items}</h2>
      <ul className="mt-4 space-y-3">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-4 text-sm">
            <span className="min-w-0 text-charcoal">
              {item.productName}
              <span className="text-stone">
                {" "}
                · {variantNames[item.variantId] ?? item.variantName} · {fill(m.common.qty, { n: item.qty })}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-ink">{price(item.lineTotalKrw)}</span>
          </li>
        ))}
      </ul>

      <Divider className="my-6" />

      <dl className="space-y-3 text-sm">
        <div className="flex items-baseline justify-between">
          <dt className="text-stone">{m.common.subtotal}</dt>
          <dd className="tabular-nums text-ink">{price(order.subtotalKrw)}</dd>
        </div>
        {order.discountKrw > 0 ? (
          <div className="flex items-baseline justify-between">
            <dt className="text-stone">
              {m.common.couponDiscount}
              {order.couponCode ? ` (${order.couponCode})` : ""}
            </dt>
            <dd className="tabular-nums text-accent">-{price(order.discountKrw)}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between">
          <dt className="text-stone">{m.common.shipping}</dt>
          <dd className="tabular-nums text-ink">{order.shippingKrw === 0 ? m.common.free : price(order.shippingKrw)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <dt className="text-charcoal">{t.paidAmount}</dt>
          <dd className="text-lg font-semibold tabular-nums text-ink">{price(order.totalKrw)}</dd>
        </div>
      </dl>

      <Divider className="my-6" />

      <h2 className="text-sm font-semibold tracking-tight text-ink">{t.address}</h2>
      <address className="mt-3 space-y-1 text-sm not-italic leading-relaxed text-charcoal">
        <p>
          {order.recipientName} · {order.recipientPhone}
        </p>
        <p>
          ({order.postalCode}) {order.address1} {order.address2}
        </p>
        {order.deliveryMemo ? <p className="text-stone">{deliveryMemoText(m, order.deliveryMemo)}</p> : null}
      </address>
    </div>
  );
}
