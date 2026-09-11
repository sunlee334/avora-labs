import { Section, Badge } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { getProductBySlug, getProductReviewsPage, getReviewSummary } from "@/lib/catalog";
import { maskName } from "@/lib/mask";
import { localizedActivityLabel } from "@/lib/reviews";

/** ⑧ 리뷰. 평점 요약 + 최대 3개 + 활동 태그 + 빈 상태 */
export async function Reviews() {
  const { locale, m } = await getT();
  const { DAILY_SUNSCREEN } = getContent(locale);
  const product = await getProductBySlug(DAILY_SUNSCREEN.slug);
  if (!product) return null;

  const [summary, { rows: reviews }] = await Promise.all([
    getReviewSummary(product.id),
    getProductReviewsPage(product.id, { pageSize: 3 }),
  ]);

  return (
    <Section eyebrow={m.home.reviews.eyebrow} title={m.home.reviews.title} lede={DAILY_SUNSCREEN.reviewIntro}>
      <div className="mb-8 flex items-center gap-4">
        <span className="display text-4xl text-ink">{summary.count > 0 ? summary.average.toFixed(1) : "–"}</span>
        <div className="text-[13px] text-stone">
          <p>{m.home.reviews.outOf5}</p>
          <p>{fill(m.home.reviews.count, { n: summary.count })}</p>
        </div>
      </div>

      {reviews.length === 0 ? (
        <p className="measure text-[15px] leading-relaxed text-stone">{m.home.reviews.empty}</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          {reviews.map((review) => (
            <article key={review.id} className="flex flex-col rounded-lg border border-line bg-white/60 p-6">
              <div className="flex items-center justify-between">
                <Badge tone="mist">{localizedActivityLabel(m, review.activityTag)}</Badge>
                <span className="text-[13px] tabular-nums text-stone-2">{"★".repeat(review.rating)}</span>
              </div>
              <p className="mt-4 flex-1 text-[14px] leading-relaxed text-charcoal">{review.body}</p>
              <p className="mt-4 text-[12px] font-medium text-stone-2">{maskName(review.authorName)}</p>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}
