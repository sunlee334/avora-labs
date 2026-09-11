import Image from "next/image";
import { Badge } from "@/components/ui/Primitives";
import { ProductStatusBadge } from "@/components/ui/StatusBadge";
import { getContent } from "@/content";
import { fill, formatPrice } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { getT } from "@/i18n/server";
import { lowestPrice, type ProductWithVariants } from "@/lib/catalog";

export async function ProductCard({ product }: { product: ProductWithVariants }) {
  const { locale, m } = await getT();
  const copy = getContent(locale).CATALOG.products[product.slug];
  const price = lowestPrice(product);
  const hasMultipleVariants = product.variants.length > 1;
  const isUpcoming = product.status === "upcoming";

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-white/60 transition hover:border-ink/40 hover:shadow-soft"
    >
      <div className="relative flex aspect-[4/5] items-center justify-center bg-mist-50 p-8">
        <Image
          src={product.image}
          alt={product.name}
          width={360}
          height={520}
          className="h-full w-auto max-w-full object-contain transition duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute left-4 top-4 flex items-center gap-2">
          <Badge tone="neutral">{fill(m.common.stage, { n: product.stage })}</Badge>
          <Badge tone="mist">{product.code}</Badge>
        </div>
        <div className="absolute right-4 top-4">
          <ProductStatusBadge status={product.status} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <h3 className="text-[16px] font-semibold tracking-tight text-ink">{product.name}</h3>
        <p className="line-clamp-2 text-[13px] leading-relaxed text-stone">{copy?.subtitle ?? product.subtitle}</p>
        <div className="mt-3 flex items-center justify-between">
          {price !== null ? (
            <span className="text-[15px] font-semibold tabular-nums text-ink">
              {hasMultipleVariants ? (
                <>
                  {fill(m.common.unitPrice, { price: formatPrice(price, locale) })}
                  <span className="ml-0.5 font-normal text-stone">{m.common.from}</span>
                </>
              ) : (
                formatPrice(price, locale)
              )}
            </span>
          ) : (
            <span className="text-[13px] text-stone">{copy?.launchLabel ?? product.launchLabel}</span>
          )}
          <span className="text-[12px] font-medium text-mist-600">{isUpcoming ? m.shop.card.notifyLink : m.shop.card.detailLink}</span>
        </div>
      </div>
    </Link>
  );
}
