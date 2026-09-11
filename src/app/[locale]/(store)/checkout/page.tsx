import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutForm, type CheckoutLine } from "@/components/checkout/CheckoutForm";
import { TrackEvent } from "@/components/site/TrackEvent";
import { FormMessage } from "@/components/ui/Field";
import { PageTitle } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { localizePath } from "@/i18n/config";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCart } from "@/lib/cart";
import { isFirstOrderForUser } from "@/lib/checkout";

// DB 를 읽는 페이지는 항상 요청 시점에 렌더링한다 (Workers 빌드 프리렌더 중 D1 접근 방지).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return {
    title: m.checkout.metaTitle,
    description: m.checkout.metaDescription,
    alternates: localeAlternates(locale, "/checkout"),
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage() {
  const [cart, user, { locale, m }] = await Promise.all([getCart(), getCurrentUser(), getT()]);
  if (cart.lines.length === 0 || !cart.purchasable) {
    redirect(localizePath(locale, "/cart"));
  }

  const { CATALOG } = getContent(locale);
  const isFirstOrder = await isFirstOrderForUser(user?.id);
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
  const isTestPayment = clientKey.startsWith("test_");

  const lines: CheckoutLine[] = cart.lines.map((line) => ({
    id: line.id,
    variantId: line.variantId,
    productName: line.variant.product.name,
    variantName: CATALOG.variants[line.variant.sku] ?? line.variant.name,
    image: line.variant.product.image,
    qty: line.qty,
    unitPriceKrw: line.variant.priceKrw,
    lineTotalKrw: line.lineTotalKrw,
  }));

  return (
    <>
      <PageTitle eyebrow="CHECKOUT" title={m.checkout.title} lede={user ? undefined : m.checkout.guestLede} />

      {isTestPayment ? (
        <p className="mb-4 rounded-md border border-accent/30 bg-accent-soft px-4 py-3 text-[13px] text-charcoal">
          {m.checkout.testNotice}
        </p>
      ) : null}

      <TrackEvent name="begin_checkout" params={{ currency: "KRW", items_count: lines.length }} />
      {clientKey ? (
        <CheckoutForm
          lines={lines}
          prefill={{
            customerName: user?.name ?? "",
            email: user?.email ?? "",
            phone: user?.phone ?? "",
          }}
          isFirstOrder={isFirstOrder}
          clientKey={clientKey}
          userId={user?.id ?? null}
        />
      ) : (
        <div className="container-x pb-24">
          <FormMessage tone="error">{m.checkout.notConfigured}</FormMessage>
        </div>
      )}
    </>
  );
}
