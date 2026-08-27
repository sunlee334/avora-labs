/**
 * 구매 후기 저장소.
 *
 * 자격 판정은 여기가 아니라 주문이 합니다 — `findOrderForCustomer` 로 주문번호와
 * 연락처가 맞는지 확인한 뒤에만 이 파일의 `createReview` 를 부릅니다. 그래서
 * "구매 확인" 표시가 장식이 아니라 사실입니다.
 *
 * 리뷰 한 건은 주문 한 건에 묶입니다(UNIQUE). 같은 구매로 여러 번 쓰는 것은
 * 응용 로직이 아니라 **데이터베이스가** 막습니다 — 두 요청이 동시에 들어와도
 * 한 건만 남습니다.
 */

export type ReviewStatus = 'visible' | 'hidden';

export interface ReviewRecord {
  id: string;
  orderId: string;
  rating: number;
  body: string;
  authorName: string;
  locale: string;
  sponsored: boolean;
  status: ReviewStatus;
  hiddenReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSummary {
  count: number;
  /** 소수 첫째 자리까지. 리뷰가 없으면 null — 0.0 은 "별점 0" 처럼 보입니다. */
  average: number | null;
  /** 별점별 개수. 1~5 키가 항상 있습니다(0 이어도). */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** 주문번호와 같은 모양을 씁니다 — 사람이 눈으로 읽고 옮겨 적을 수 있게. */
export function newReviewId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  let suffix = '';
  const random = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of random) suffix += ALPHABET[byte % ALPHABET.length];
  return `REVIEW-${stamp}-${suffix}`;
}

/**
 * 화면에 내보낼 이름.
 *
 * 후기 옆에 실명을 그대로 두면 그 사람이 무엇을 언제 샀는지가 공개됩니다.
 * 가운데를 가리되, 누가 썼는지 본인은 알아볼 수 있을 만큼만 남깁니다.
 */
export function maskName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}${'*'.repeat(trimmed.length - 2)}${trimmed[trimmed.length - 1]}`;
}

export function rowToReview(row: Record<string, unknown>): ReviewRecord {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    rating: Number(row.rating),
    body: String(row.body),
    authorName: String(row.author_name),
    locale: String(row.locale),
    sponsored: Number(row.sponsored) === 1,
    status: String(row.status) as ReviewStatus,
    hiddenReason: row.hidden_reason == null ? null : String(row.hidden_reason),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** 손님에게 보이는 모양. 주문번호와 실명은 나가지 않습니다. */
export function publicReview(review: ReviewRecord) {
  return {
    id: review.id,
    rating: review.rating,
    body: review.body,
    author: maskName(review.authorName),
    sponsored: review.sponsored,
    createdAt: review.createdAt,
  };
}

export interface ReviewDraft {
  orderId: string;
  rating: number;
  body: string;
  authorName: string;
  locale: string;
  sponsored?: boolean;
}

export type CreateResult =
  | { ok: true; review: ReviewRecord }
  | { ok: false; reason: 'DUPLICATE' };

/**
 * 리뷰를 저장합니다.
 *
 * 같은 주문으로 이미 쓴 경우 UNIQUE 제약이 걸립니다. 미리 조회해서 막지 않는
 * 이유: 조회와 저장 사이에 다른 요청이 들어올 수 있고, 그 틈은 아무리 좁혀도
 * 남습니다. 데이터베이스가 거절하게 두고 그 거절을 해석합니다.
 */
export async function createReview(
  db: D1Database,
  draft: ReviewDraft,
  now: Date,
): Promise<CreateResult> {
  const iso = now.toISOString();
  const review: ReviewRecord = {
    id: newReviewId(now),
    orderId: draft.orderId,
    rating: draft.rating,
    body: draft.body,
    authorName: draft.authorName,
    locale: draft.locale,
    sponsored: draft.sponsored ?? false,
    status: 'visible',
    hiddenReason: null,
    createdAt: iso,
    updatedAt: iso,
  };

  try {
    await db
      .prepare(
        `INSERT INTO reviews
           (id, order_id, rating, body, author_name, locale, sponsored, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'visible', ?, ?)`,
      )
      .bind(
        review.id,
        review.orderId,
        review.rating,
        review.body,
        review.authorName,
        review.locale,
        review.sponsored ? 1 : 0,
        iso,
        iso,
      )
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE|constraint/i.test(message)) return { ok: false, reason: 'DUPLICATE' };
    throw error;
  }

  return { ok: true, review };
}

/** 화면에 보이는 리뷰만. 최신순. */
export async function listVisibleReviews(
  db: D1Database,
  limit: number,
  offset: number,
): Promise<ReviewRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM reviews WHERE status = 'visible'
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(limit, offset)
    .all<Record<string, unknown>>();
  return (results ?? []).map(rowToReview);
}

/**
 * 별점 요약.
 *
 * **숨긴 리뷰는 세지 않습니다.** 화면에 없는 리뷰가 평균에 들어가면 표시된
 * 리뷰들과 숫자가 맞지 않고, 그건 조작처럼 보입니다.
 */
export async function reviewSummary(db: D1Database): Promise<ReviewSummary> {
  const { results } = await db
    .prepare(
      `SELECT rating, COUNT(*) AS n FROM reviews
       WHERE status = 'visible' GROUP BY rating`,
    )
    .all<{ rating: number; n: number }>();

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  let count = 0;
  let total = 0;
  for (const row of results ?? []) {
    const rating = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
    const n = Number(row.n);
    if (rating >= 1 && rating <= 5) distribution[rating] = n;
    count += n;
    total += rating * n;
  }

  return {
    count,
    average: count === 0 ? null : Math.round((total / count) * 10) / 10,
    distribution,
  };
}

/** 관리 화면용 — 숨긴 것까지 전부. */
export async function listAllReviews(
  db: D1Database,
  limit: number,
  offset: number,
): Promise<{ reviews: ReviewRecord[]; total: number }> {
  const { results } = await db
    .prepare(`SELECT * FROM reviews ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(limit, offset)
    .all<Record<string, unknown>>();
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM reviews`).first<{ n: number }>();
  return { reviews: (results ?? []).map(rowToReview), total: Number(row?.n ?? 0) };
}

export async function getReview(db: D1Database, id: string): Promise<ReviewRecord | null> {
  const row = await db
    .prepare(`SELECT * FROM reviews WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? rowToReview(row) : null;
}

/**
 * 노출·숨김을 바꿉니다.
 *
 * 숨길 때는 이유가 반드시 있어야 합니다. 기준 없이 지운 기록이 없으면,
 * 부정적 리뷰만 골라 숨겼는지 아닌지를 나중에 아무도 증명할 수 없습니다.
 */
export async function setReviewStatus(
  db: D1Database,
  id: string,
  status: ReviewStatus,
  reason: string | null,
  now: string,
): Promise<boolean> {
  const result = await db
    .prepare(`UPDATE reviews SET status = ?, hidden_reason = ?, updated_at = ? WHERE id = ?`)
    .bind(status, status === 'hidden' ? reason : null, now, id)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}
