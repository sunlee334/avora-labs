import Image from "next/image";
import { Pagination } from "@/components/admin/Pagination";
import { Badge } from "@/components/ui/Primitives";
import type { Review } from "@/db/schema";
import { localizePath } from "@/i18n/config";
import { fill, formatLocalDate } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { getT } from "@/i18n/server";
import { maskName } from "@/lib/mask";
import { localizedActivityLabel, parseReviewPhotos } from "@/lib/reviews";
import { Stars } from "./ReviewSummaryBar";

/**
 * 활동 상황별 후기 (제품기획안 10-4). 필터는 서버에서 처리한다.
 * 후기는 삭제하거나 숨기지 않는다 — 관리자는 답글만 남긴다.
 */
export async function ReviewList({
  reviews,
  totalCount,
  activeTag,
  tagCounts,
  page = 1,
  totalPages = 1,
  basePath,
  isLoggedIn,
}: {
  reviews: Review[];
  totalCount: number;
  activeTag: string | null;
  tagCounts: { tag: string; count: number }[];
  page?: number;
  totalPages?: number;
  basePath: string;
  isLoggedIn: boolean;
}) {
  const { locale, m } = await getT();
  const t = m.product.reviewList;
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (activeTag) params.set("tag", activeTag);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return localizePath(locale, `${basePath}${qs ? `?${qs}` : ""}#reviews`);
  };
  return (
    <div className="space-y-8">
      {tagCounts.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={t.filterLabel}>
          <li>
            <Link
              href={basePath}
              aria-current={activeTag ? undefined : "true"}
              className={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                activeTag
                  ? "border-line-2 bg-white/60 text-charcoal hover:border-ink"
                  : "border-ink bg-ink text-paper"
              }`}
            >
              {fill(t.all, { n: totalCount })}
            </Link>
          </li>
          {tagCounts.map(({ tag, count }) => {
            const active = activeTag === tag;
            return (
              <li key={tag}>
                <Link
                  href={`${basePath}?tag=${encodeURIComponent(tag)}#reviews`}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                    active
                      ? "border-ink bg-ink text-paper"
                      : "border-line-2 bg-white/60 text-charcoal hover:border-ink"
                  }`}
                >
                  {localizedActivityLabel(m, tag)} {count}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {reviews.length === 0 ? (
        <p className="rounded-lg border border-line bg-white/60 p-8 text-center text-sm leading-relaxed text-stone">
          {activeTag ? fill(t.emptyTag, { tag: localizedActivityLabel(m, activeTag) }) : t.empty}
        </p>
      ) : (
        <ul className="space-y-6">
          {reviews.map((review) => {
            const photos = parseReviewPhotos(review.photos);
            return (
              <li key={review.id} className="rounded-lg border border-line bg-white/60 p-6">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Stars value={review.rating} label={fill(m.product.reviewSummary.stars, { n: review.rating })} />
                  <span className="text-[13px] font-medium text-ink">
                    {maskName(review.authorName)}
                  </span>
                  <Badge tone="mist">{localizedActivityLabel(m, review.activityTag)}</Badge>
                  <span className="text-[12px] tabular-nums text-stone-2">
                    {formatLocalDate(review.createdAt, locale)}
                  </span>
                </div>

                <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-charcoal">
                  {review.body}
                </p>

                {photos.length > 0 ? (
                  <ul className="mt-4 flex flex-wrap gap-3">
                    {photos.map((src) => (
                      <li key={src}>
                        <Image
                          src={src}
                          alt=""
                          width={112}
                          height={112}
                          unoptimized
                          className="h-28 w-28 rounded-md border border-line object-cover"
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}

                {review.disclosure ? (
                  <p className="mt-3 text-[12px] text-stone">{t.disclosure}</p>
                ) : null}

                {review.adminReply ? (
                  <div className="mt-5 rounded-md border-l-2 border-mist-300 bg-mist-50 px-4 py-3">
                    <p className="text-[12px] font-semibold tracking-wide text-mist-600">{t.reply}</p>
                    <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-charcoal">
                      {review.adminReply}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} buildHref={pageHref} labels={{ prev: m.common.prevPage, next: m.common.nextPage }} />

      {isLoggedIn ? (
        <p className="text-[13px] text-stone">
          {t.writeBefore}
          <Link href="/account" className="underline underline-offset-4 hover:text-ink">
            {t.writeLink}
          </Link>
          {t.writeAfter}
        </p>
      ) : null}
    </div>
  );
}
