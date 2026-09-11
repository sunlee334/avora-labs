import "server-only";
import { and, avg, count, desc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";
import { products, reviews, variants, type Product, type Variant } from "@/db/schema";

export type ProductWithVariants = Product & { variants: Variant[] };

export const getProducts = cache(async (): Promise<ProductWithVariants[]> => {
  return db.query.products.findMany({
    with: { variants: { where: eq(variants.isActive, true), orderBy: (v, { asc }) => [asc(v.sortOrder)] } },
    orderBy: (p, { asc }) => [asc(p.sortOrder), asc(p.stage)],
  });
});

export const getProductBySlug = cache(async (slug: string): Promise<ProductWithVariants | null> => {
  const row = await db.query.products.findFirst({
    where: eq(products.slug, slug),
    with: { variants: { where: eq(variants.isActive, true), orderBy: (v, { asc }) => [asc(v.sortOrder)] } },
  });
  return row ?? null;
});

export interface ReviewSummary {
  count: number;
  average: number; // 0 when no reviews
}

export const getReviewSummary = cache(async (productId: number): Promise<ReviewSummary> => {
  const row = await db
    .select({ count: count(), average: avg(reviews.rating) })
    .from(reviews)
    .where(eq(reviews.productId, productId))
    .get();
  return { count: row?.count ?? 0, average: row?.average ? Number(row.average) : 0 };
});

export const REVIEW_PAGE_SIZE = 10;

/** 활동 태그별 후기 수 (필터 칩용). 후기가 있는 태그만 돌려준다. */
export const getReviewTagCounts = cache(async (productId: number): Promise<{ tag: string; count: number }[]> => {
  const rows = await db
    .select({ tag: reviews.activityTag, count: count() })
    .from(reviews)
    .where(eq(reviews.productId, productId))
    .groupBy(reviews.activityTag);
  return rows.filter((r) => r.count > 0);
});

/**
 * 상품 후기 한 페이지. 전체를 한 번에 읽지 않고(후기가 수백 건이 되면 상품 페이지가 무거워진다) 태그 필터 + 페이지로 잘라 읽는다.
 * `total` 은 필터 기준 건수라 페이지 수 계산에 쓴다.
 */
// React cache() 는 인자 동일성으로 적중하는데 옵션 객체는 호출마다 새로 만들어지므로 감싸지 않는다.
export async function getProductReviewsPage(
  productId: number,
  opts: { tag?: string | null; page?: number; pageSize?: number } = {},
) {
  {
    const pageSize = Math.max(1, Math.min(opts.pageSize ?? REVIEW_PAGE_SIZE, 50));
    const where = opts.tag ? and(eq(reviews.productId, productId), eq(reviews.activityTag, opts.tag)) : eq(reviews.productId, productId);
    const requested = Math.max(1, opts.page ?? 1);
    const rowsQuery = (page: number) =>
      db.query.reviews.findMany({ where, orderBy: [desc(reviews.createdAt)], limit: pageSize, offset: (page - 1) * pageSize });
    // 건수와 첫 페이지를 한 번의 왕복(batch)으로 읽는다. D1 은 쿼리마다 네트워크 왕복이라 체감 차이가 크다.
    const [totalRow, firstRows] = await db.batch([db.select({ count: count() }).from(reviews).where(where), rowsQuery(requested)]);
    const total = totalRow[0]?.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requested, totalPages);
    // 범위를 벗어난 페이지를 요청한 드문 경우만 마지막 페이지를 다시 읽는다.
    const rows = page === requested ? firstRows : await rowsQuery(page);
    return { rows, total, page, totalPages };
  }
}

export function defaultVariant(product: ProductWithVariants): Variant | null {
  return product.variants.find((v) => v.isDefault) ?? product.variants[0] ?? null;
}

export function lowestPrice(product: ProductWithVariants): number | null {
  if (product.variants.length === 0) return null;
  return Math.min(...product.variants.map((v) => Math.round(v.priceKrw / v.unitsPerPack)));
}
