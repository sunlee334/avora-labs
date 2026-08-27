/**
 * 문의.
 *
 * ── 공개 게시판이 아닙니다 ──────────────────────────────────
 * 본인과 관리자만 봅니다. 공개로 두면 답이 달릴 때까지 미답변 글이 모두에게
 * 보이고, 그것은 혼자 운영하는 가게에서 "관리되지 않는 곳" 이라는 신호가
 * 됩니다. 라운드랩도 CS팀이 있는데도 결국 게시판을 접었습니다.
 *
 * 그래서 이 기능은 검색 유입에 기여하지 않습니다. 나머지 커뮤니티 영역과
 * 목적이 다르고, 그것이 의도입니다.
 *
 * ── 소유가 두 갈래입니다 ────────────────────────────────────
 *   로그인   `user_id` — 구매 전 질문도 남길 수 있습니다
 *   주문번호  `order_id` + `contact_phone` — 주문한 사람만
 *
 * 요청에 주문번호와 연락처가 함께 오면 **세션 여부와 무관하게** 주문 경로로
 * 저장합니다. 로그인한 사람이 주문조회 화면에서 문의했다면 그 사람은
 * 마이페이지에서도, 주문조회에서도 자기 문의를 볼 수 있어야 하기 때문입니다.
 * 그래서 알 수 있으면 `user_id` 도 함께 채웁니다.
 *
 * ── 없는 것과 남의 것을 구분하지 않습니다 ───────────────────
 * `worker/accounts.ts:314` 가 세운 선례입니다. 다르게 답하면 "그 번호가
 * 존재하는가" 를 알려주는 셈이 됩니다.
 */

export type InquiryStatus = 'open' | 'answered';

export interface InquiryRecord {
  id: string;
  userId: string | null;
  orderId: string | null;
  contactPhone: string | null;
  subject: string;
  body: string;
  locale: string;
  status: InquiryStatus;
  answerBody: string | null;
  answeredAt: string | null;
  answeredBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InquiryDraft {
  userId?: string | null;
  orderId?: string | null;
  contactPhone?: string | null;
  subject: string;
  body: string;
  locale: string;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** 주문번호·리뷰와 같은 모양 — 사람이 눈으로 읽고 옮겨 적을 수 있게. */
export function newInquiryId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  let suffix = '';
  const random = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of random) suffix += ALPHABET[byte % ALPHABET.length];
  return `INQUIRY-${stamp}-${suffix}`;
}

/** 연락처는 숫자만 남겨 저장합니다 — 주문과 같은 규칙(`worker/orders.ts`). */
function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

export function rowToInquiry(row: Record<string, unknown>): InquiryRecord {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? null,
    orderId: (row.order_id as string) ?? null,
    contactPhone: (row.contact_phone as string) ?? null,
    subject: row.subject as string,
    body: row.body as string,
    locale: row.locale as string,
    status: row.status as InquiryStatus,
    answerBody: (row.answer_body as string) ?? null,
    answeredAt: (row.answered_at as string) ?? null,
    answeredBy: (row.answered_by as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * 손님에게 내보낼 형태.
 *
 * 연락처와 답변자를 빼고, 답이 없으면 그 자리도 비웁니다. 관리자 이메일이
 * 손님 화면에 흘러가지 않게 합니다.
 */
export function publicInquiry(inquiry: InquiryRecord) {
  return {
    id: inquiry.id,
    subject: inquiry.subject,
    body: inquiry.body,
    status: inquiry.status,
    orderId: inquiry.orderId,
    answer: inquiry.answerBody
      ? { body: inquiry.answerBody, at: inquiry.answeredAt }
      : null,
    createdAt: inquiry.createdAt,
  };
}

export async function createInquiry(
  db: D1Database,
  draft: InquiryDraft,
  now: Date,
): Promise<InquiryRecord> {
  const id = newInquiryId(now);
  const iso = now.toISOString();
  const phone = draft.contactPhone ? normalizePhone(draft.contactPhone) : null;

  await db
    .prepare(
      `INSERT INTO inquiries
         (id, user_id, order_id, contact_phone, subject, body, locale,
          status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    )
    .bind(
      id,
      draft.userId ?? null,
      draft.orderId ?? null,
      phone,
      draft.subject,
      draft.body,
      draft.locale,
      iso,
      iso,
    )
    .run();

  const row = await db.prepare('SELECT * FROM inquiries WHERE id = ?').bind(id).first();
  return rowToInquiry(row as Record<string, unknown>);
}

/** 한 주문에 달린 문의 전부. 연락처가 맞아야 합니다. */
export async function inquiriesForOrder(
  db: D1Database,
  orderId: string,
  phone: string,
): Promise<InquiryRecord[]> {
  const { results } = await db
    .prepare(
      'SELECT * FROM inquiries WHERE order_id = ? AND contact_phone = ? ORDER BY created_at DESC',
    )
    .bind(orderId, normalizePhone(phone))
    .all();
  return (results ?? []).map((row) => rowToInquiry(row as Record<string, unknown>));
}

/**
 * 로그인한 사람의 문의 전부.
 *
 * 소유권을 판정하는 코드가 없습니다 — `WHERE user_id = ?` 가 그 일을 합니다.
 * `ordersForUser` 와 같은 방식이고, 남의 것이 애초에 결과에 안 들어옵니다.
 */
export async function inquiriesForUser(
  db: D1Database,
  userId: string,
): Promise<InquiryRecord[]> {
  const { results } = await db
    .prepare('SELECT * FROM inquiries WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all();
  return (results ?? []).map((row) => rowToInquiry(row as Record<string, unknown>));
}

export type AnswerResult =
  | { ok: true; inquiry: InquiryRecord }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_ANSWERED' };

/**
 * 답을 답니다.
 *
 * 이미 답한 문의에 다시 답하면 거절합니다 — 두 번 눌린 저장 버튼이 앞선
 * 답을 조용히 덮으면 손님이 읽던 내용이 사라집니다.
 */
export async function answerInquiry(
  db: D1Database,
  id: string,
  body: string,
  who: string,
  now: Date,
): Promise<AnswerResult> {
  const existing = await db.prepare('SELECT * FROM inquiries WHERE id = ?').bind(id).first();
  if (!existing) return { ok: false, reason: 'NOT_FOUND' };

  const inquiry = rowToInquiry(existing as Record<string, unknown>);
  if (inquiry.status === 'answered') return { ok: false, reason: 'ALREADY_ANSWERED' };

  const iso = now.toISOString();
  await db
    .prepare(
      `UPDATE inquiries
          SET answer_body = ?, answered_at = ?, answered_by = ?, status = 'answered', updated_at = ?
        WHERE id = ?`,
    )
    .bind(body, iso, who, iso, id)
    .run();

  const row = await db.prepare('SELECT * FROM inquiries WHERE id = ?').bind(id).first();
  return { ok: true, inquiry: rowToInquiry(row as Record<string, unknown>) };
}

/** 관리 화면용. 상태로 거를 수 있습니다. */
export async function listInquiries(
  db: D1Database,
  options: { status?: InquiryStatus; limit: number; offset: number },
): Promise<{ inquiries: InquiryRecord[]; total: number }> {
  const where = options.status ? 'WHERE status = ?' : '';
  const args = options.status ? [options.status] : [];

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM inquiries ${where}`)
    .bind(...args)
    .first<{ n: number }>();

  const { results } = await db
    .prepare(
      `SELECT * FROM inquiries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...args, options.limit, options.offset)
    .all();

  return {
    inquiries: (results ?? []).map((row) => rowToInquiry(row as Record<string, unknown>)),
    total: countRow?.n ?? 0,
  };
}

/** 미답변 건수. 관리 화면 요약에 씁니다. */
export async function openInquiryCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM inquiries WHERE status = 'open'")
    .first<{ n: number }>();
  return row?.n ?? 0;
}
