import { count } from "drizzle-orm";
import { Pagination } from "@/components/admin/Pagination";
import { Button } from "@/components/ui/Button";
import { FormMessage, Textarea } from "@/components/ui/Field";
import { Badge, Card } from "@/components/ui/Primitives";
import { db } from "@/db/client";
import { reviews } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { activityLabel, parseReviewPhotos } from "@/lib/reviews";
import { firstParam } from "@/lib/search-params";
import { replyReviewAction } from "./actions";

const PAGE_SIZE = 30;

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const success = typeof sp.success === "string" ? sp.success : undefined;
  const requestedPage = Math.max(1, Number.parseInt(firstParam(sp.page) || "1", 10) || 1);
  const totalRow = await db.select({ c: count() }).from(reviews).get();
  const totalPages = Math.max(1, Math.ceil((totalRow?.c ?? 0) / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const reviewRows = await db.query.reviews.findMany({
    with: { product: true },
    orderBy: (r, { desc }) => [desc(r.createdAt)],
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pageHref = (p: number) => (p > 1 ? `/admin/reviews?page=${p}` : "/admin/reviews");

  return (
    <div className="space-y-6">
      <h1 className="display text-2xl text-ink">리뷰</h1>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {success ? <FormMessage tone="success">{success}</FormMessage> : null}

      <div className="space-y-4">
        {reviewRows.map((review) => {
          const photos = parseReviewPhotos(review.photos);
          return (
            <Card key={review.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-semibold text-ink">{review.product.name}</span>
                  <span className="text-stone">· {review.authorName}</span>
                  <Badge tone="mist">
                    {"★".repeat(review.rating)}
                    {"☆".repeat(Math.max(0, 5 - review.rating))}
                  </Badge>
                  <Badge tone="neutral">{activityLabel(review.activityTag)}</Badge>
                  {review.disclosure ? <Badge tone="accent">대가 제공</Badge> : null}
                </div>
                <span className="text-[12px] text-stone-2">{formatDateTime(review.createdAt)}</span>
              </div>

              <p className="mt-3 text-[14px] leading-relaxed text-charcoal">{review.body}</p>

              {photos.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {photos.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={src}
                      src={src}
                      alt=""
                      className="h-20 w-20 rounded-md border border-line object-cover"
                    />
                  ))}
                </div>
              ) : null}

              {review.adminReply ? (
                <div className="mt-4 rounded-md border border-line bg-paper-2/60 p-3 text-[13px]">
                  <p className="mb-1 text-[11px] font-medium text-stone">
                    관리자 답글 · {formatDateTime(review.adminRepliedAt)}
                  </p>
                  <p className="text-charcoal">{review.adminReply}</p>
                </div>
              ) : null}

              <form
                action={replyReviewAction.bind(null, review.id)}
                className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
              >
                <Textarea
                  name="reply"
                  defaultValue={review.adminReply ?? ""}
                  rows={2}
                  placeholder="답글을 입력하세요"
                  className="flex-1"
                />
                <Button type="submit" size="sm" variant="secondary">
                  {review.adminReply ? "답글 수정" : "답글 등록"}
                </Button>
              </form>
            </Card>
          );
        })}
        {reviewRows.length === 0 ? (
          <p className="text-[13px] text-stone">등록된 리뷰가 없습니다.</p>
        ) : null}
      </div>
      <Pagination page={page} totalPages={totalPages} buildHref={pageHref} />
    </div>
  );
}
