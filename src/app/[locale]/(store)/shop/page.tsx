import type { Metadata } from "next";
import { PageTitle, Section } from "@/components/ui/Primitives";
import { ProductCard } from "@/components/shop/ProductCard";
import { getContent } from "@/content";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";
import { getProducts } from "@/lib/catalog";

// DB 를 읽는 페이지는 항상 요청 시점에 렌더링한다 (Workers 빌드 프리렌더 중 D1 접근 방지).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return {
    title: m.shop.title,
    description: m.shop.metaDescription,
    alternates: localeAlternates(locale, "/shop"),
  };
}

export default async function ShopPage() {
  const { locale, m } = await getT();
  const { DAY_FLOW } = getContent(locale);
  const products = await getProducts();

  return (
    <>
      <PageTitle eyebrow={`ROADMAP · ${DAY_FLOW.join(" → ")}`} title={m.shop.title} lede={m.shop.lede} />
      <Section className="pt-0">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </Section>
    </>
  );
}
