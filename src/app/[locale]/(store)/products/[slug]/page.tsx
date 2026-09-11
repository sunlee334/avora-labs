import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { NotifyForm } from "@/components/notify/NotifyForm";
import { ProductBuyPanel } from "@/components/product/ProductBuyPanel";
import { PurchaseNotes } from "@/components/product/PurchaseNotes";
import { ReviewList } from "@/components/product/ReviewList";
import { ReviewSummaryBar } from "@/components/product/ReviewSummaryBar";
import { SpecTable } from "@/components/product/SpecTable";
import { UsageSteps } from "@/components/product/UsageSteps";
import type { GalleryImage } from "@/components/product/ProductGallery";
import type { PurchaseVariant } from "@/components/product/VariantSelector";
import { Badge, Price, Section } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { LOCALE_META } from "@/i18n/config";
import { fill } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getProductBySlug, getProductReviewsPage, getReviewSummary, getReviewTagCounts } from "@/lib/catalog";
import { SITE } from "@/lib/config";
import { isActivityTag } from "@/lib/reviews";
import { firstParam } from "@/lib/search-params";

// DB 를 읽는 페이지는 항상 요청 시점에 렌더링한다 (Workers 빌드 프리렌더 중 D1 접근 방지).
export const dynamic = "force-dynamic";

const TWO_SET_IMAGE = "/visuals/product-2set.svg";

export async function generateMetadata({ params }: PageProps<"/[locale]/products/[slug]">): Promise<Metadata> {
  const [{ slug }, { locale, m }] = await Promise.all([params, getT()]);
  const product = await getProductBySlug(slug);
  if (!product) return { title: m.product.notFound };

  const copy = getContent(locale).CATALOG.products[product.slug];
  const description = copy?.subtitle || copy?.description || product.subtitle || product.description || m.common.siteDescription;
  return {
    title: product.name,
    description,
    alternates: localeAlternates(locale, `/products/${product.slug}`),
    openGraph: {
      title: `${product.name} · ${SITE.name}`,
      description,
      type: "website",
      locale: LOCALE_META[locale].ogLocale,
    },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/[locale]/products/[slug]">) {
  const [{ slug }, query, { locale, m }] = await Promise.all([params, searchParams, getT()]);
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const { DAILY_SUNSCREEN, CATALOG } = getContent(locale);
  const copy = CATALOG.products[product.slug];
  const subtitle = copy?.subtitle ?? product.subtitle;
  const description = copy?.description ?? product.description;
  const launchLabel = copy?.launchLabel ?? product.launchLabel;

  const isDaily = product.slug === DAILY_SUNSCREEN.slug;
  const forSale = product.status === "on_sale" && product.variants.length > 0;

  // ---- 활동 태그 필터 + 페이지 (후기는 한 번에 다 읽지 않는다)
  const rawTag = firstParam(query.tag);
  const activeTag = isActivityTag(rawTag) ? rawTag : null;
  const requestedPage = Number.parseInt(firstParam(query.page) || "1", 10);

  const [summary, tagCounts, reviewPage, user] = await Promise.all([
    getReviewSummary(product.id),
    getReviewTagCounts(product.id),
    getProductReviewsPage(product.id, { tag: activeTag, page: Number.isFinite(requestedPage) ? requestedPage : 1 }),
    getCurrentUser(),
  ]);

  // ---- 갤러리: 세트를 고르면 2개 구성 컷으로 바뀐다
  const images: GalleryImage[] = [
    { src: product.image || "/visuals/product-tube.svg", alt: fill(m.product.galleryMain, { name: product.name }) },
  ];
  if (isDaily) {
    images.push({ src: TWO_SET_IMAGE, alt: fill(m.product.galleryTwoSet, { name: product.name }) });
  }

  const variants: PurchaseVariant[] = product.variants.map((variant) => ({
    id: variant.id,
    name: CATALOG.variants[variant.sku] ?? variant.name,
    unitsPerPack: variant.unitsPerPack,
    priceKrw: variant.priceKrw,
    compareAtKrw: variant.compareAtKrw,
    stock: variant.stock,
  }));
  const variantImageIndex: Record<number, number> = {};
  for (const variant of variants) {
    variantImageIndex[variant.id] = variant.unitsPerPack > 1 && isDaily ? 1 : 0;
  }
  const defaultVariant =
    product.variants.find((v) => v.isDefault) ?? product.variants[0] ?? null;


  const header = (
    <header>
      {product.code ? <p className="eyebrow mb-3">{product.code}</p> : null}
      <h1 className="display text-3xl text-ink md:text-4xl">{product.name}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-stone">{subtitle}</p>
      {forSale && defaultVariant ? (
        <div className="mt-5">
          <Price value={defaultVariant.priceKrw} size="lg" />
        </div>
      ) : (
        <div className="mt-5">
          <Badge tone="mist">{fill(m.product.upcomingBadge, { label: launchLabel })}</Badge>
        </div>
      )}
    </header>
  );

  return (
    <>
      <div className="container-x pt-10 pb-16 md:pt-16">
        {forSale && defaultVariant ? (
          <ProductBuyPanel
            images={images}
            variants={variants}
            defaultVariantId={defaultVariant.id}
            variantImageIndex={variantImageIndex}
            header={header}
          >
            <ReviewSummaryBar average={summary.average} count={summary.count} />
            {isDaily ? <PurchaseNotes title={m.product.notesTitle} notes={DAILY_SUNSCREEN.purchaseNotes} /> : null}
          </ProductBuyPanel>
        ) : (
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="grain overflow-hidden rounded-lg border border-line bg-paper-2">
              <Image
                src={images[0].src}
                alt={images[0].alt}
                width={900}
                height={900}
                priority
                unoptimized
                className="h-auto w-full object-cover"
              />
            </div>
            <div className="space-y-8">
              {header}
              <p className="measure text-[15px] leading-relaxed text-charcoal">
                {description}
              </p>
              <div className="rounded-lg border border-line bg-white/60 p-6">
                <h2 className="text-sm font-semibold tracking-tight text-ink">
                  {m.product.notifyTitle}
                </h2>
                <p className="mt-2 mb-4 text-[13px] leading-relaxed text-stone">
                  {fill(m.product.notifyBody, { label: launchLabel })}
                </p>
                <NotifyForm interest={product.slug} source="product" />
              </div>
            </div>
          </div>
        )}
      </div>

      {isDaily ? (
        <>
          <Section eyebrow={DAILY_SUNSCREEN.eyebrow} title={DAILY_SUNSCREEN.headline}>
            <p className="measure text-base leading-relaxed text-charcoal md:text-lg">
              {DAILY_SUNSCREEN.intro}
            </p>

            <div className="mt-12 rounded-lg border border-line bg-white/60 p-8 md:p-10">
              <h3 className="display text-2xl text-ink md:text-3xl">
                {DAILY_SUNSCREEN.reason.title}
              </h3>
              <p className="measure mt-4 text-[15px] leading-relaxed text-stone">
                {DAILY_SUNSCREEN.reason.body}
              </p>
              <Link
                href={DAILY_SUNSCREEN.reason.link.href}
                className="mt-5 inline-block text-[13px] font-medium text-ink underline underline-offset-4"
              >
                {DAILY_SUNSCREEN.reason.link.label}
              </Link>
            </div>

            <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {DAILY_SUNSCREEN.senses.map((sense) => (
                <li key={sense.key} className="rounded-lg border border-line bg-white/60 p-6">
                  <p className="eyebrow">{sense.key}</p>
                  <h3 className="mt-3 text-lg tracking-tight text-ink">{sense.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone">{sense.body}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section eyebrow={m.product.spec.eyebrow} title={m.product.spec.title} className="border-t border-line">
            <SpecTable specs={DAILY_SUNSCREEN.specs} />
            <p className="mt-8 text-[13px] leading-relaxed text-stone">
              {DAILY_SUNSCREEN.ingredientsNote}
            </p>
          </Section>

          <Section
            eyebrow={m.product.usageEyebrow}
            title={DAILY_SUNSCREEN.usage.title}
            className="border-t border-line"
          >
            <UsageSteps
              steps={DAILY_SUNSCREEN.usage.steps}
              reapplyLine={DAILY_SUNSCREEN.usage.reapplyLine}
            />
          </Section>
        </>
      ) : null}

      <Section
        id="reviews"
        eyebrow={m.product.reviews.eyebrow}
        title={m.product.reviews.title}
        lede={isDaily ? DAILY_SUNSCREEN.reviewIntro : undefined}
        className="border-t border-line"
      >
        <ReviewList
          reviews={reviewPage.rows}
          totalCount={summary.count}
          activeTag={activeTag}
          tagCounts={tagCounts}
          page={reviewPage.page}
          totalPages={reviewPage.totalPages}
          basePath={`/products/${product.slug}`}
          isLoggedIn={Boolean(user)}
        />
      </Section>
    </>
  );
}
