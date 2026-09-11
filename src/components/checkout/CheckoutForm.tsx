"use client";

import {
  ANONYMOUS,
  loadTossPayments,
  type TossPaymentsWidgets,
} from "@tosspayments/tosspayments-sdk";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPendingOrderAction, validateCouponAction } from "@/app/[locale]/(store)/checkout/actions";
import { Button } from "@/components/ui/Button";
import { Checkbox, FieldError, FormMessage, Input, Label, Select } from "@/components/ui/Field";
import { Divider } from "@/components/ui/Primitives";
import { useLocale, useMessages } from "@/i18n/client";
import { localizePath } from "@/i18n/config";
import { fill, formatPrice } from "@/i18n/format";
import { Link } from "@/i18n/link";
import type { Messages } from "@/i18n/messages";
import { DELIVERY_MEMO_KEYS, SHIPPING, type CouponType } from "@/lib/config";
import { calculateTotals } from "@/lib/pricing";
import {
  buildCheckoutSchema,
  toFieldErrors,
  type CheckoutFieldErrors,
  type CheckoutValues,
} from "./schema";

export interface CheckoutLine {
  id: number;
  variantId: number;
  productName: string;
  /** 현재 언어로 표시할 구성 이름 (서버가 카탈로그 번역을 적용해 넘긴다) */
  variantName: string;
  image: string;
  qty: number;
  unitPriceKrw: number;
  lineTotalKrw: number;
}

export interface CheckoutPrefill {
  customerName: string;
  email: string;
  phone: string;
}

interface AppliedCoupon {
  code: string;
  type: CouponType;
  value: number;
  minSubtotalKrw: number;
}

/** 토스 SDK 오류는 코드→사전 문구로만 바꾼다. SDK 의 자유 텍스트(한국어)는 그대로 보여주지 않는다. */
function errorMessage(m: Messages, error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (code === "USER_CANCEL" || code === "PAY_PROCESS_CANCELED") return m.checkout.messages.userCancel;
    if (code === "INVALID_PARAMETER" || code === "INVALID_REQUEST") return m.checkout.messages.invalid;
    if (code === "NEED_AGREEMENT_WITH_TERMS") return m.checkout.messages.termsRequired;
  }
  return m.checkout.messages.openFailed;
}

export function CheckoutForm({
  lines,
  prefill,
  isFirstOrder,
  clientKey,
  userId,
}: {
  lines: CheckoutLine[];
  prefill: CheckoutPrefill;
  isFirstOrder: boolean;
  clientKey: string;
  userId: number | null;
}) {
  const locale = useLocale();
  const m = useMessages();
  const t = m.checkout;
  const [values, setValues] = useState<CheckoutValues>({
    customerName: prefill.customerName,
    email: prefill.email,
    phone: prefill.phone,
    recipientName: prefill.customerName,
    recipientPhone: prefill.phone,
    postalCode: "",
    address1: "",
    address2: "",
    deliveryMemo: "",
    couponCode: "",
    agreePurchase: false,
    smsOptIn: false,
  });
  const [errors, setErrors] = useState<CheckoutFieldErrors>({});
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponMessage, setCouponMessage] = useState<{ tone: "info" | "error"; text: string } | null>(
    null,
  );
  const [couponPending, startCouponTransition] = useTransition();
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [widgets, setWidgets] = useState<TossPaymentsWidgets | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const renderedRef = useRef(false);

  const totals = useMemo(
    () =>
      calculateTotals({
        items: lines.map((line) => ({
          variantId: line.variantId,
          unitPriceKrw: line.unitPriceKrw,
          qty: line.qty,
        })),
        coupon,
        isFirstOrder,
      }),
    [lines, coupon, isFirstOrder],
  );

  // ---- 위젯 초기화
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tossPayments = await loadTossPayments(clientKey);
        if (cancelled) return;
        setWidgets(
          tossPayments.widgets({
            customerKey: userId ? `user-${userId}` : ANONYMOUS,
          }),
        );
      } catch {
        if (!cancelled) setWidgetError(t.messages.widgetLoadFailed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientKey, userId, t.messages.widgetLoadFailed]);

  // ---- 결제 UI · 약관 UI 렌더 (한 번만)
  useEffect(() => {
    if (!widgets || renderedRef.current) return;
    renderedRef.current = true;
    (async () => {
      try {
        await widgets.setAmount({ currency: "KRW", value: totals.totalKrw });
        await Promise.all([
          widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
          widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" }),
        ]);
        setWidgetReady(true);
      } catch {
        renderedRef.current = false;
        setWidgetError(t.messages.methodsFailed);
      }
    })();
    // totals는 최초 렌더 금액으로만 쓰고, 이후 변경은 아래 effect가 반영한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets]);

  // ---- 금액 변경 반영
  useEffect(() => {
    if (!widgets || !widgetReady) return;
    void widgets.setAmount({ currency: "KRW", value: totals.totalKrw });
  }, [widgets, widgetReady, totals.totalKrw]);

  function update<K extends keyof CheckoutValues>(key: K, value: CheckoutValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function applyCoupon() {
    const code = (values.couponCode ?? "").trim();
    setCouponMessage(null);
    if (!code) {
      setCoupon(null);
      setCouponMessage({ tone: "error", text: t.messages.couponEmpty });
      return;
    }
    startCouponTransition(async () => {
      const result = await validateCouponAction(code);
      if (!result.ok || !result.coupon) {
        setCoupon(null);
        setCouponMessage({ tone: "error", text: result.message });
        return;
      }
      setCoupon(result.coupon);
      setCouponMessage({ tone: "info", text: result.message });
    });
  }

  function clearCoupon() {
    setCoupon(null);
    setCouponMessage(null);
    update("couponCode", "");
  }

  async function submit() {
    setFormMessage(null);
    const parsed = buildCheckoutSchema(m).safeParse(values);
    if (!parsed.success) {
      const fieldErrors = toFieldErrors(parsed.error);
      setErrors(fieldErrors);
      setFormMessage(t.messages.invalid);
      return;
    }
    if (!widgets || !widgetReady) {
      setFormMessage(t.messages.widgetLoading);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      // 적용 버튼을 누른 쿠폰만 서버에 보낸다. 입력만 하고 적용하지 않은 코드가 금액을 바꾸지 않도록.
      const order = await createPendingOrderAction({ ...values, couponCode: coupon?.code ?? "" });
      if (!order.ok) {
        setFormMessage(order.message);
        return;
      }

      // 서버가 다시 계산한 금액을 기준으로 결제창을 연다. 돌아올 URL 은 현재 언어 접두사를 유지한다.
      await widgets.setAmount({ currency: "KRW", value: order.amount });
      await widgets.requestPayment({
        orderId: order.orderNumber,
        orderName: order.orderName,
        successUrl: `${window.location.origin}${localizePath(locale, "/checkout/success")}`,
        failUrl: `${window.location.origin}${localizePath(locale, "/checkout/fail")}`,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        customerMobilePhone: order.customerMobilePhone,
      });
    } catch (error) {
      setFormMessage(errorMessage(m, error));
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = submitting || !widgetReady;
  const price = (value: number) => formatPrice(value, locale);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="container-x grid gap-10 pb-24 lg:grid-cols-[1fr_23rem] lg:gap-14"
      noValidate
    >
      <div className="space-y-12">
        {/* 주문자 */}
        <section aria-labelledby="orderer-heading" className="space-y-4">
          <h2 id="orderer-heading" className="text-sm font-semibold tracking-tight text-ink">
            {t.sections.orderer}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="customerName">{t.fields.name}</Label>
              <Input
                id="customerName"
                autoComplete="name"
                value={values.customerName}
                onChange={(e) => update("customerName", e.target.value)}
                aria-invalid={Boolean(errors.customerName)}
              />
              <FieldError>{errors.customerName}</FieldError>
            </div>
            <div>
              <Label htmlFor="phone" hint={t.fields.phoneHint}>
                {t.fields.phone}
              </Label>
              <Input
                id="phone"
                inputMode="tel"
                autoComplete="tel"
                value={values.phone}
                onChange={(e) => update("phone", e.target.value)}
                aria-invalid={Boolean(errors.phone)}
              />
              <FieldError>{errors.phone}</FieldError>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="email" hint={t.fields.emailHint}>
                {t.fields.email}
              </Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={values.email}
                onChange={(e) => update("email", e.target.value)}
                aria-invalid={Boolean(errors.email)}
              />
              <FieldError>{errors.email}</FieldError>
            </div>
          </div>
        </section>

        {/* 배송지 */}
        <section aria-labelledby="shipping-heading" className="space-y-4">
          <h2 id="shipping-heading" className="text-sm font-semibold tracking-tight text-ink">
            {t.sections.shipping}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="recipientName">{t.fields.recipient}</Label>
              <Input
                id="recipientName"
                autoComplete="shipping name"
                value={values.recipientName}
                onChange={(e) => update("recipientName", e.target.value)}
                aria-invalid={Boolean(errors.recipientName)}
              />
              <FieldError>{errors.recipientName}</FieldError>
            </div>
            <div>
              <Label htmlFor="recipientPhone" hint={t.fields.phoneHint}>
                {t.fields.contact}
              </Label>
              <Input
                id="recipientPhone"
                inputMode="tel"
                autoComplete="shipping tel"
                value={values.recipientPhone}
                onChange={(e) => update("recipientPhone", e.target.value)}
                aria-invalid={Boolean(errors.recipientPhone)}
              />
              <FieldError>{errors.recipientPhone}</FieldError>
            </div>
            <div>
              <Label htmlFor="postalCode">{t.fields.postalCode}</Label>
              <Input
                id="postalCode"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                value={values.postalCode}
                onChange={(e) => update("postalCode", e.target.value)}
                aria-invalid={Boolean(errors.postalCode)}
              />
              <FieldError>{errors.postalCode}</FieldError>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="address1">{t.fields.address}</Label>
              <Input
                id="address1"
                autoComplete="shipping street-address"
                value={values.address1}
                onChange={(e) => update("address1", e.target.value)}
                aria-invalid={Boolean(errors.address1)}
              />
              <FieldError>{errors.address1}</FieldError>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="address2" hint={m.common.optional}>
                {t.fields.address2}
              </Label>
              <Input
                id="address2"
                value={values.address2 ?? ""}
                onChange={(e) => update("address2", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="deliveryMemo" hint={m.common.optional}>
                {t.fields.deliveryMemo}
              </Label>
              <Select
                id="deliveryMemo"
                value={values.deliveryMemo ?? ""}
                onChange={(e) => update("deliveryMemo", e.target.value as CheckoutValues["deliveryMemo"])}
              >
                <option value="">{t.fields.memoNone}</option>
                {DELIVERY_MEMO_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t.deliveryMemos[key]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </section>

        {/* 쿠폰 */}
        <section aria-labelledby="coupon-heading" className="space-y-4">
          <h2 id="coupon-heading" className="text-sm font-semibold tracking-tight text-ink">
            {t.sections.coupon}
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="couponCode"
              aria-label={t.fields.couponCode}
              placeholder={t.fields.couponCode}
              autoCapitalize="characters"
              value={values.couponCode ?? ""}
              onChange={(e) => update("couponCode", e.target.value.toUpperCase())}
              disabled={Boolean(coupon)}
              className="sm:flex-1"
            />
            {coupon ? (
              <Button type="button" variant="secondary" onClick={clearCoupon} className="sm:shrink-0">
                {t.buttons.clear}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={applyCoupon}
                disabled={couponPending}
                className="sm:shrink-0"
              >
                {couponPending ? t.buttons.checking : t.buttons.apply}
              </Button>
            )}
          </div>
          {couponMessage ? (
            <FormMessage tone={couponMessage.tone === "error" ? "error" : "info"}>
              {couponMessage.text}
            </FormMessage>
          ) : null}
        </section>

        {/* 결제 수단 */}
        <section aria-labelledby="payment-heading" className="space-y-4">
          <h2 id="payment-heading" className="text-sm font-semibold tracking-tight text-ink">
            {t.sections.payment}
          </h2>
          {widgetError ? <FormMessage tone="error">{widgetError}</FormMessage> : null}
          <div id="payment-method" />
          <div id="agreement" />
        </section>

        {/* 동의 */}
        <section aria-labelledby="consent-heading" className="space-y-4">
          <h2 id="consent-heading" className="text-sm font-semibold tracking-tight text-ink">
            {t.sections.consent}
          </h2>
          <div className="space-y-3 rounded-lg border border-line bg-white/70 p-5">
            <Checkbox
              id="agreePurchase"
              checked={Boolean(values.agreePurchase)}
              onChange={(e) => update("agreePurchase", e.target.checked)}
              label={t.consent.purchase}
              description={t.consent.purchaseDesc}
            />
            {errors.agreePurchase ? <FieldError>{errors.agreePurchase}</FieldError> : null}
            <Checkbox
              id="smsOptIn"
              checked={Boolean(values.smsOptIn)}
              onChange={(e) => update("smsOptIn", e.target.checked)}
              label={t.consent.sms}
              description={t.consent.smsDesc}
            />
          </div>
          <p className="text-[12px] leading-relaxed text-stone">
            {fill(t.consent.contact, { channel: m.common.csChannel, hours: m.common.csHours })}
          </p>
        </section>
      </div>

      {/* 주문 요약 */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-lg border border-line bg-white/70 p-6 shadow-soft">
          <h2 className="text-sm font-semibold tracking-tight text-ink">{t.sections.items}</h2>

          <ul className="mt-5 space-y-4">
            {lines.map((line) => (
              <li key={line.id} className="flex gap-3">
                <Image
                  src={line.image || "/visuals/product-tube.svg"}
                  alt=""
                  width={56}
                  height={56}
                  unoptimized
                  className="h-14 w-14 shrink-0 rounded-md border border-line bg-paper-2 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{line.productName}</p>
                  <p className="text-[12px] text-stone">
                    {line.variantName} · {fill(m.common.qty, { n: line.qty })}
                  </p>
                </div>
                <p className="shrink-0 text-[13px] tabular-nums text-ink">{price(line.lineTotalKrw)}</p>
              </li>
            ))}
          </ul>

          <Divider className="my-5" />

          <dl className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-stone">{m.common.subtotal}</dt>
              <dd className="tabular-nums text-ink">{price(totals.subtotalKrw)}</dd>
            </div>
            {totals.discountKrw > 0 ? (
              <div className="flex items-baseline justify-between">
                <dt className="text-stone">{m.common.couponDiscount}</dt>
                <dd className="tabular-nums text-accent">-{price(totals.discountKrw)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between">
              <dt className="text-stone">{m.common.shipping}</dt>
              <dd className="tabular-nums text-ink">
                {totals.shippingKrw === 0 ? m.common.free : price(totals.shippingKrw)}
              </dd>
            </div>
          </dl>

          <Divider className="my-5" />

          <div className="flex items-baseline justify-between">
            <span className="text-sm text-charcoal">{m.common.paymentTotal}</span>
            <span className="text-xl font-semibold tabular-nums text-ink">{price(totals.totalKrw)}</span>
          </div>

          {totals.shippingKrw === 0 ? (
            <p className="mt-3 text-[12px] text-success">
              {totals.shippingReason === "first_order"
                ? t.summary.firstOrderFree
                : totals.shippingReason === "coupon"
                  ? t.summary.couponFree
                  : fill(t.summary.thresholdFree, { amount: price(SHIPPING.freeThreshold) })}
            </p>
          ) : null}

          {formMessage ? (
            <div className="mt-4">
              <FormMessage tone="error">{formMessage}</FormMessage>
            </div>
          ) : null}

          <Button type="submit" size="lg" disabled={disabled} className="mt-5 w-full">
            {submitting ? t.buttons.opening : fill(t.buttons.pay, { amount: price(totals.totalKrw) })}
          </Button>

          <p className="mt-3 text-[12px] leading-relaxed text-stone">{t.summary.leadTime}</p>
          <Link
            href="/cart"
            className="mt-3 block text-center text-[13px] text-stone underline underline-offset-4 transition hover:text-ink"
          >
            {m.common.backToCart}
          </Link>
        </div>
      </aside>
    </form>
  );
}
