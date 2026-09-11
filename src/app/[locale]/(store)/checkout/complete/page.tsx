import type { Metadata } from "next";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, variants } from "@/db/schema";
import { OrderReceipt } from "@/components/checkout/OrderReceipt";
import { TrackEvent } from "@/components/site/TrackEvent";
import { ButtonLink } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/Field";
import { PageTitle } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { fill } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { getT } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasOrderToken } from "@/lib/checkout-token";
import { SHIPPING } from "@/lib/config";
import { isValidOrderNumber } from "@/lib/orders";
import { firstParam } from "@/lib/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getT();
  return { title: m.complete.metaTitle, robots: { index: false, follow: false } };
}

/**
 * 결제 완료 화면. 영수증(배송지·연락처 포함)은 주문을 만든 브라우저(소유 토큰) 또는
 * 로그인한 주문자에게만 보여준다. 그 외에는 개인정보 없이 안내만 렌더링한다.
 * 실패 문구는 코드→문구 매핑만 사용한다. 쿼리의 자유 텍스트는 피싱 표면이 되므로 렌더링하지 않는다.
 */
export default async function CheckoutCompletePage({ searchParams }: PageProps<"/[locale]/checkout/complete">) {
  const [params, { locale, m }] = await Promise.all([searchParams, getT()]);
  const t = m.complete;
  const orderNumber = firstParam(params.order).slice(0, 64);
  const errorCode = firstParam(params.error).slice(0, 60);
  // 사전에 있는 코드만 문구로 바꾼다 (`?error=constructor` 같은 프로토타입 키가 렌더링되지 않게).
  const failureTitle = Object.hasOwn(t.failureTitles, errorCode)
    ? t.failureTitles[errorCode as keyof typeof t.failureTitles]
    : t.failTitle;
  const failureDetail = Object.hasOwn(t.failures, errorCode)
    ? t.failures[errorCode as keyof typeof t.failures]
    : t.failDetail;
  // failUrl(결제창에서 취소·실패)에서 온 경우: 장바구니가 남아 있으므로 다시 결제하기를 앞에 둔다.
  const canRetry = firstParam(params.retry) === "1";
  const pendingCancelled = firstParam(params.cancelled) === "1" && isValidOrderNumber(orderNumber);
  const csLine = fill(m.common.csLine, { channel: m.common.csChannel, hours: m.common.csHours });

  if (errorCode) {
    return (
      <>
        <PageTitle eyebrow="CHECKOUT" title={failureTitle} />
        <div className="container-x max-w-2xl space-y-6 pb-24">
          <FormMessage tone="error">
            {failureDetail}
            <span className="mt-1 block text-[12px] opacity-70">{fill(t.errorCode, { code: errorCode })}</span>
          </FormMessage>
          {pendingCancelled ? (
            <p className="text-sm leading-relaxed text-charcoal">{fill(t.pendingCancelled, { order: orderNumber })}</p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {canRetry ? <ButtonLink href="/checkout">{t.retry}</ButtonLink> : null}
            <ButtonLink href="/cart" variant={canRetry ? "secondary" : "primary"}>
              {m.common.goToCart}
            </ButtonLink>
            <ButtonLink href="/faq" variant="secondary">
              {m.common.contact}
            </ButtonLink>
          </div>
          <p className="text-[13px] leading-relaxed text-stone">{csLine}</p>
        </div>
      </>
    );
  }

  const order = isValidOrderNumber(orderNumber)
    ? await db.query.orders.findFirst({ where: eq(orders.orderNumber, orderNumber), with: { items: true } })
    : undefined;
  const user = await getCurrentUser();
  const owned =
    Boolean(order) &&
    ((user !== null && order?.userId === user.id) || (await hasOrderToken(orderNumber)));

  if (order && order.status === "cancelled" && order.failReason === "OVERSOLD") {
    return (
      <>
        <PageTitle eyebrow="CHECKOUT" title={t.oversoldTitle} />
        <div className="container-x max-w-2xl space-y-6 pb-24">
          <FormMessage tone="error">{fill(t.oversoldBody, { order: order.orderNumber })}</FormMessage>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/notify">{t.restockNotify}</ButtonLink>
            <ButtonLink href="/faq" variant="secondary">
              {m.common.contact}
            </ButtonLink>
          </div>
          <p className="text-[13px] leading-relaxed text-stone">{csLine}</p>
        </div>
      </>
    );
  }

  if (!order || order.status === "pending" || order.status === "cancelled") {
    return (
      <>
        <PageTitle eyebrow="CHECKOUT" title={t.unconfirmedTitle} />
        <div className="container-x max-w-2xl space-y-6 pb-24">
          <FormMessage tone="error">{t.unconfirmedBody}</FormMessage>
          <ButtonLink href="/cart">{m.common.goToCart}</ButtonLink>
        </div>
      </>
    );
  }

  if (!owned) {
    return (
      <>
        <PageTitle
          eyebrow={t.thanksEyebrow}
          title={t.thanksTitle}
          lede={fill(t.ledeLookup, { order: order.orderNumber })}
        />
        <div className="container-x max-w-2xl space-y-6 pb-24">
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href="/orders/lookup">{t.lookup}</ButtonLink>
            <Link href="/" className="text-[13px] text-stone underline underline-offset-4 transition hover:text-ink">
              {m.common.home}
            </Link>
          </div>
        </div>
      </>
    );
  }

  // 주문 품목의 구성 이름은 주문 시점(한국어) 스냅샷이다. 다른 언어는 SKU 기준 카탈로그 번역으로 바꿔 보여준다.
  const { CATALOG } = getContent(locale);
  const variantNames: Record<number, string> = {};
  if (Object.keys(CATALOG.variants).length > 0 && order.items.length > 0) {
    const rows = await db
      .select({ id: variants.id, sku: variants.sku })
      .from(variants)
      .where(inArray(variants.id, order.items.map((item) => item.variantId)));
    for (const row of rows) {
      const name = CATALOG.variants[row.sku];
      if (name) variantNames[row.id] = name;
    }
  }

  return (
    <>
      <PageTitle
        eyebrow={t.thanksEyebrow}
        title={t.thanksTitle}
        lede={fill(t.ledeReceipt, { order: order.orderNumber })}
      />

      <TrackEvent
        name="purchase"
        once={`purchase:${order.orderNumber}`}
        params={{
          transaction_id: order.orderNumber,
          currency: "KRW",
          value: order.totalKrw,
          shipping: order.shippingKrw,
          items: order.items.map((item) => ({
            item_id: String(item.variantId),
            item_name: `${item.productName} ${variantNames[item.variantId] ?? item.variantName}`,
            price: item.unitPriceKrw,
            quantity: item.qty,
          })),
        }}
      />
      <div className="container-x max-w-3xl space-y-8 pb-24">
        <OrderReceipt order={order} variantNames={variantNames} />

        <section className="rounded-lg border border-line bg-paper-2/60 p-6">
          <h2 className="text-sm font-semibold tracking-tight text-ink">{t.nextTitle}</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-charcoal">
            <li>{t.nextLeadTime}</li>
            <li>{t.nextCutoff}</li>
            <li>{fill(t.nextTracking, { carrier: SHIPPING.carrierDefault })}</li>
          </ul>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          {user && order.userId === user.id ? (
            <ButtonLink href={`/account/orders/${order.id}`}>{t.orderDetail}</ButtonLink>
          ) : (
            <ButtonLink href="/orders/lookup">{t.lookup}</ButtonLink>
          )}
          <Link href="/" className="text-[13px] text-stone underline underline-offset-4 transition hover:text-ink">
            {m.common.home}
          </Link>
        </div>

        {user && order.userId === user.id ? null : (
          <p className="text-[13px] leading-relaxed text-stone">{fill(t.guestNote, { order: order.orderNumber })}</p>
        )}
      </div>
    </>
  );
}
