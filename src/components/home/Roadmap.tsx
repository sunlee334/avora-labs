import { Section, Badge } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { fill } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { getT } from "@/i18n/server";
import { getProducts } from "@/lib/catalog";

/** ⑨ 로드맵 SUN → MOVE → SWEAT → WATER → RESET */
export async function Roadmap() {
  const { locale, m } = await getT();
  const { DAY_FLOW, CATALOG } = getContent(locale);
  const products = await getProducts();

  return (
    <Section eyebrow={m.home.roadmap.eyebrow} title={DAY_FLOW.join(" → ")} lede={m.home.roadmap.lede}>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((product) => {
          const href = product.status === "on_sale" ? `/products/${product.slug}` : "/shop";
          const copy = CATALOG.products[product.slug];
          return (
            <Link
              key={product.id}
              href={href}
              className="flex flex-col justify-between rounded-lg border border-line bg-white/60 p-6 transition hover:border-ink/40"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="eyebrow text-mist-600">{fill(m.common.stage, { n: product.stage })}</span>
                  <Badge tone={product.status === "on_sale" ? "ink" : "neutral"}>
                    {m.productStatus[product.status]}
                  </Badge>
                </div>
                <h3 className="mt-4 text-[15px] font-semibold text-ink">{product.code}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-stone">{product.name}</p>
              </div>
              <p className="mt-6 text-[12px] text-stone-2">{copy?.launchLabel ?? product.launchLabel}</p>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
