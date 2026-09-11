import { ButtonLink } from "@/components/ui/Button";
import { Divider } from "@/components/ui/Primitives";
import { fill, formatPrice } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { getT } from "@/i18n/server";
import { SHIPPING } from "@/lib/config";
import type { PricingResult } from "@/lib/pricing";

/** 장바구니 합계. 무료배송까지 남은 금액과 세트 전환 힌트를 함께 보여준다. */
export async function CartSummary({
  totals,
  purchasable,
  isFirstOrder,
  showSetHint,
}: {
  totals: PricingResult;
  purchasable: boolean;
  isFirstOrder: boolean;
  showSetHint: boolean;
}) {
  const { locale, m } = await getT();
  const t = m.cart.summary;
  const freeShipping = totals.shippingKrw === 0;

  return (
    <aside className="rounded-lg border border-line bg-white/70 p-6 shadow-soft">
      <h2 className="text-sm font-semibold tracking-tight text-ink">{t.title}</h2>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex items-baseline justify-between">
          <dt className="text-stone">{m.common.subtotal}</dt>
          <dd className="tabular-nums text-ink">{formatPrice(totals.subtotalKrw, locale)}</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-stone">{m.common.shipping}</dt>
          <dd className="tabular-nums text-ink">
            {freeShipping ? m.common.free : formatPrice(totals.shippingKrw, locale)}
          </dd>
        </div>
      </dl>

      <Divider className="my-5" />

      <div className="flex items-baseline justify-between">
        <span className="text-sm text-charcoal">{m.common.total}</span>
        <span className="text-xl font-semibold tabular-nums text-ink">
          {formatPrice(totals.totalKrw, locale)}
        </span>
      </div>

      <div className="mt-5 space-y-2 text-[13px] leading-relaxed text-stone">
        {freeShipping ? (
          <p className="text-success">
            {totals.shippingReason === "first_order" ? t.firstOrderFree : t.freeApplied}
          </p>
        ) : (
          <p>
            {fill(t.remaining, { amount: formatPrice(totals.remainingForFreeShipping, locale) })}
            {isFirstOrder ? null : ` ${fill(t.thresholdHint, { amount: formatPrice(SHIPPING.freeThreshold, locale) })}`}
          </p>
        )}
        {showSetHint && !freeShipping ? <p>{t.setHint}</p> : null}
        <p>{t.couponHint}</p>
      </div>

      <div className="mt-6 space-y-3">
        {purchasable ? (
          <ButtonLink href="/checkout" size="lg" className="w-full">
            {t.checkout}
          </ButtonLink>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex h-13 w-full items-center justify-center rounded-full bg-ink px-8 text-base font-medium text-paper opacity-50"
          >
            {t.checkout}
          </button>
        )}
        <Link
          href="/products/daily-sunscreen"
          className="block text-center text-[13px] text-stone underline underline-offset-4 transition hover:text-ink"
        >
          {m.common.continueShopping}
        </Link>
      </div>
    </aside>
  );
}
