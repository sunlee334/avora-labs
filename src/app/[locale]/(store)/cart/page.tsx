import type { Metadata } from "next";
import Image from "next/image";
import { CartLineControls } from "@/components/cart/CartLineControls";
import { CartSummary } from "@/components/cart/CartSummary";
import { ButtonLink } from "@/components/ui/Button";
import { PageTitle } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { fill, formatPrice } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCart, type CartLine } from "@/lib/cart";
import { isFirstOrderForUser } from "@/lib/checkout";
import type { Messages } from "@/i18n/messages";
import { calculateTotals } from "@/lib/pricing";

// DB 를 읽는 페이지는 항상 요청 시점에 렌더링한다 (Workers 빌드 프리렌더 중 D1 접근 방지).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return {
    title: m.cart.title,
    description: m.cart.metaDescription,
    alternates: localeAlternates(locale, "/cart"),
    robots: { index: false, follow: false },
  };
}

function issueMessage(m: Messages, line: CartLine): string | null {
  switch (line.issue) {
    case "out_of_stock":
      return m.cart.issues.out_of_stock;
    case "insufficient_stock":
      return fill(m.cart.issues.insufficient_stock, { n: line.variant.stock });
    case "not_for_sale":
      return m.cart.issues.not_for_sale;
    default:
      return null;
  }
}

export default async function CartPage() {
  const [cart, user, { locale, m }] = await Promise.all([getCart(), getCurrentUser(), getT()]);
  const isFirstOrder = await isFirstOrderForUser(user?.id);
  const { CATALOG } = getContent(locale);

  const totals = calculateTotals({
    items: cart.lines.map((line) => ({
      variantId: line.variantId,
      unitPriceKrw: line.variant.priceKrw,
      qty: line.qty,
    })),
    isFirstOrder,
  });

  const showSetHint = cart.lines.some((line) => line.variant.unitsPerPack === 1);

  if (cart.lines.length === 0) {
    return (
      <>
        <PageTitle eyebrow="CART" title={m.cart.title} />
        <div className="container-x pb-24">
          <div className="rounded-lg border border-line bg-white/70 p-10 text-center shadow-soft">
            <p className="text-base text-charcoal">{m.cart.emptyTitle}</p>
            <p className="mt-2 text-sm text-stone">{m.cart.emptyBody}</p>
            <ButtonLink href="/products/daily-sunscreen" className="mt-6">
              {m.cart.goToProduct}
            </ButtonLink>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle eyebrow="CART" title={m.cart.title} lede={fill(m.cart.lede, { n: cart.itemCount })} />

      <div className="container-x grid gap-10 pb-24 lg:grid-cols-[1fr_22rem] lg:gap-14">
        <section aria-label={m.cart.itemsAria}>
          <ul className="divide-y divide-line border-y border-line">
            {cart.lines.map((line) => {
              const issue = issueMessage(m, line);
              const variantName = CATALOG.variants[line.variant.sku] ?? line.variant.name;
              return (
                <li key={line.id} className="flex gap-4 py-6 sm:gap-6">
                  <Link
                    href={`/products/${line.variant.product.slug}`}
                    className="shrink-0 overflow-hidden rounded-md border border-line bg-paper-2"
                  >
                    <Image
                      src={line.variant.product.image || "/visuals/product-tube.svg"}
                      alt={line.variant.product.name}
                      width={96}
                      height={96}
                      unoptimized
                      className="h-20 w-20 object-cover sm:h-24 sm:w-24"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <div className="min-w-0">
                      <Link
                        href={`/products/${line.variant.product.slug}`}
                        className="text-[15px] font-medium tracking-tight text-ink transition hover:text-charcoal"
                      >
                        {line.variant.product.name}
                      </Link>
                      <p className="mt-1 text-[13px] text-stone">{variantName}</p>
                      <p className="mt-1 text-[13px] tabular-nums text-stone">
                        {fill(m.common.unitPrice, { price: formatPrice(line.variant.priceKrw, locale) })}
                      </p>
                      {issue ? (
                        <p role="alert" className="mt-2 text-[12px] text-danger">
                          {issue}
                        </p>
                      ) : null}
                      <div className="mt-3">
                        <CartLineControls
                          lineId={line.id}
                          qty={line.qty}
                          max={line.variant.stock}
                        />
                      </div>
                    </div>

                    <p className="shrink-0 text-[15px] font-semibold tabular-nums text-ink sm:text-right">
                      {formatPrice(line.lineTotalKrw, locale)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <CartSummary
          totals={totals}
          purchasable={cart.purchasable}
          isFirstOrder={isFirstOrder}
          showSetHint={showSetHint}
        />
      </div>
    </>
  );
}
