/**
 * 주문 저장·조회.
 *
 * 왜 서버에 저장하는가:
 *   결제는 PG 가 처리하지만, 수령인·배송지는 우리 체크아웃 폼이 받는 정보라
 *   어딘가 남기지 않으면 "결제는 됐는데 어디로 보낼지 모르는 주문" 이 됩니다.
 *
 *   그리고 금액 검증에 필요합니다. 승인 요청에 실린 금액을 그대로 믿으면
 *   브라우저에서 값을 바꿔 싸게 결제할 수 있습니다. 주문을 먼저 서버에 만들어 두고,
 *   승인 직전에 저장된 금액과 대조합니다.
 */

/** 결제 상태 */
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

/**
 * 배송 상태. 결제와 별개의 축입니다 —
 * "결제는 됐고 아직 발송 전"을 한 칸으로는 표현할 수 없습니다.
 */
export type Fulfillment = 'unfulfilled' | 'preparing' | 'shipped' | 'delivered' | 'returned';

export const FULFILLMENTS: readonly Fulfillment[] = [
  'unfulfilled',
  'preparing',
  'shipped',
  'delivered',
  'returned',
];

export interface OrderItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface OrderDraft {
  amount: number;
  currency: string;
  items: OrderItem[];
  locale: string;
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  address1: string;
  address2?: string;
  memo?: string;
  email?: string;
  /**
   * 문자·알림톡 수신 동의 시각. 동의하지 않았으면 없습니다.
   *
   * 이메일 동의와 **별개 항목** 입니다. 기획안 9-5 가 그렇게 적어 두었고,
   * 실제로도 이메일만 받겠다는 사람에게 문자를 보내면 동의를 받은 것이
   * 아닙니다. 불리언이 아니라 시각인 이유는 마이그레이션 0008 에 있습니다.
   */
  marketingSmsAt?: string;
}

export interface OrderRecord extends OrderDraft {
  id: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  adminMemo: string | null;
  paymentKey: string | null;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 연락처는 표기 방식이 제각각이라 숫자만 남겨 비교합니다. */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

export function rowToOrder(row: Record<string, unknown>): OrderRecord {
  return {
    id: row.id as string,
    status: row.status as OrderStatus,
    amount: Number(row.amount),
    currency: row.currency as string,
    items: JSON.parse((row.items as string) || '[]'),
    locale: row.locale as string,
    recipientName: row.recipient_name as string,
    recipientPhone: row.recipient_phone as string,
    postalCode: row.postal_code as string,
    address1: row.address1 as string,
    address2: (row.address2 as string) ?? undefined,
    memo: (row.memo as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    marketingSmsAt: (row.marketing_sms_at as string) ?? undefined,
    fulfillment: ((row.fulfillment as Fulfillment) ?? 'unfulfilled'),
    carrier: (row.carrier as string) ?? null,
    trackingNumber: (row.tracking_number as string) ?? null,
    shippedAt: (row.shipped_at as string) ?? null,
    adminMemo: (row.admin_memo as string) ?? null,
    paymentKey: (row.payment_key as string) ?? null,
    paymentMethod: (row.payment_method as string) ?? null,
    paidAt: (row.paid_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string) ?? (row.created_at as string),
  };
}

export async function createOrder(
  db: D1Database,
  id: string,
  draft: OrderDraft,
  now: string,
  /** 로그인 상태로 주문했다면 그 계정. 비회원 주문이면 null 입니다. */
  userId: string | null = null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO orders (
         id, status, amount, currency, items, locale,
         recipient_name, recipient_phone, postal_code, address1, address2, memo, email,
         marketing_sms_at, created_at, updated_at, user_id
       ) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      draft.amount,
      draft.currency,
      JSON.stringify(draft.items),
      draft.locale,
      draft.recipientName,
      normalizePhone(draft.recipientPhone),
      draft.postalCode,
      draft.address1,
      draft.address2 ?? null,
      draft.memo ?? null,
      draft.email ?? null,
      draft.marketingSmsAt ?? null,
      now,
      now,
      userId,
    )
    .run();
}

export async function getOrder(db: D1Database, id: string): Promise<OrderRecord | null> {
  const row = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  return row ? rowToOrder(row as Record<string, unknown>) : null;
}

/**
 * 비회원 주문 조회 — 주문번호와 연락처가 둘 다 맞아야 돌려줍니다.
 * 주문번호만으로 열면 번호를 추측해 남의 배송지를 볼 수 있습니다.
 */
export async function findOrderForCustomer(
  db: D1Database,
  id: string,
  phone: string,
): Promise<OrderRecord | null> {
  const row = await db
    .prepare('SELECT * FROM orders WHERE id = ? AND recipient_phone = ?')
    .bind(id, normalizePhone(phone))
    .first();
  return row ? rowToOrder(row as Record<string, unknown>) : null;
}

/**
 * 결제 완료로 표시합니다.
 *
 * `WHERE status = 'pending'` 이 붙어 있어 이미 다른 요청이 상태를 바꿨다면
 * 아무 행도 바뀌지 않습니다. **호출한 쪽은 반드시 반환값을 확인해야 합니다** —
 * 승인은 성공했는데 갱신이 안 된 상태를 성공으로 보고하면,
 * 돈은 빠져나갔는데 주문은 실패로 남습니다.
 */
export async function markPaid(
  db: D1Database,
  id: string,
  paymentKey: string,
  paymentMethod: string | null,
  paidAt: string,
  now: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE orders
          SET status = 'paid', payment_key = ?, payment_method = ?, paid_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'`,
    )
    .bind(paymentKey, paymentMethod, paidAt, now, id)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * 승인이 성공했는데 pending 이 아니어서 갱신에 실패한 경우를 되살립니다.
 * 이 상황은 돈이 이미 빠져나간 상태라, 주문을 실패로 두면 안 됩니다.
 */
export async function forcePaid(
  db: D1Database,
  id: string,
  paymentKey: string,
  paymentMethod: string | null,
  paidAt: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE orders
          SET status = 'paid', payment_key = ?, payment_method = ?, paid_at = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(paymentKey, paymentMethod, paidAt, now, id)
    .run();
}

/**
 * 승인을 시도했다는 사실만 남깁니다 — 상태는 그대로 `pending`.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────
 * 결과를 단정할 수 없는 승인 실패(네트워크·5xx·`ALREADY_PROCESSED_PAYMENT`)는
 * 주문을 **일부러** `pending` 으로 둡니다. 그래야 돈이 나갔는데 장부가 실패로
 * 닫히는 최악을 피합니다.
 *
 * 그런데 그 행은 **손님이 그냥 그만둔 행과 구분되지 않았습니다** — 둘 다
 * `status='pending'`, `payment_key IS NULL`. 그래서 주간 정리
 * (`worker/digest.ts` 의 `sweepAbandoned`)가 **돈이 나간 행을 `failed` 로
 * 닫아 버릴 수 있었습니다.** 이 커밋이 없애려던 바로 그 상태를 같은 커밋의
 * 다른 파일이 만들고 있었던 셈입니다.
 *
 * 표식을 남기면 정리가 `payment_key IS NULL` 로 그 행을 건너뜁니다.
 *
 * `WHERE status='pending'` 을 붙입니다 — 이미 `paid` 로 넘어간 행의
 * payment_key 를 덮어쓰면 실제 승인된 거래 식별자를 잃습니다.
 */
export async function notePaymentAttempt(
  db: D1Database,
  id: string,
  paymentKey: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE orders SET payment_key = ?, updated_at = ? WHERE id = ? AND status = 'pending'`,
    )
    .bind(paymentKey, now, id)
    .run();
}

export async function markFailed(db: D1Database, id: string, now: string): Promise<void> {
  await db
    .prepare(`UPDATE orders SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(now, id)
    .run();
}

/** 고객에게 돌려줄 때는 필요한 것만 골라 내보냅니다. */
export function publicView(order: OrderRecord) {
  return {
    id: order.id,
    status: order.status,
    fulfillment: order.fulfillment,
    amount: order.amount,
    currency: order.currency,
    items: order.items,
    recipientName: order.recipientName,
    postalCode: order.postalCode,
    address1: order.address1,
    address2: order.address2 ?? null,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    shippedAt: order.shippedAt,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
  };
}

// ── 관리용 조회 ──────────────────────────────────────────────
// 아래 함수들이 돌려주는 값에는 연락처·메모 같은 개인정보가 들어 있습니다.
// 반드시 인증을 통과한 요청에서만 호출하세요.

export interface OrderListQuery {
  status?: OrderStatus;
  fulfillment?: Fulfillment;
  /** 주문번호·수령인·연락처 부분 일치 */
  search?: string;
  limit: number;
  offset: number;
}

export interface OrderListResult {
  orders: OrderRecord[];
  total: number;
}

/** 이스케이프 문자를 명시한 부분 일치 조건. likePattern 과 짝을 이룹니다. */
const LIKE = "LIKE ? ESCAPE '\\'";

/**
 * 부분 일치 검색어를 LIKE 패턴으로 만듭니다.
 *
 * `%` 와 `_` 는 LIKE 의 와일드카드라 그대로 넘기면 검색어가 아니라 패턴이 됩니다.
 * 관리자가 `_` 한 글자를 검색하면 전체 주문이 나오는 식입니다.
 */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export async function listOrders(
  db: D1Database,
  query: OrderListQuery,
): Promise<OrderListResult> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.status) {
    where.push('status = ?');
    params.push(query.status);
  }
  if (query.fulfillment) {
    where.push('fulfillment = ?');
    params.push(query.fulfillment);
  }
  if (query.search) {
    const terms = [`id ${LIKE}`, `recipient_name ${LIKE}`];
    params.push(likePattern(query.search), likePattern(query.search));

    // 연락처는 숫자만 저장하므로, 검색어에서도 구분자를 떼고 따로 봅니다.
    //
    // 숫자가 하나도 없으면 이 항을 아예 넣지 않습니다. 넣으면 패턴이 '%%' 가 되어
    // 모든 행에 걸리고, OR 로 묶인 검색 전체가 무력화됩니다 — 이름으로 검색해도
    // 전체 주문이 나오는 상태가 됩니다.
    const digits = normalizePhone(query.search);
    if (digits) {
      terms.push(`recipient_phone ${LIKE}`);
      params.push(likePattern(digits));
    }

    where.push(`(${terms.join(' OR ')})`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM orders ${clause}`)
    .bind(...params)
    .first<{ n: number }>();

  const rows = await db
    .prepare(
      `SELECT * FROM orders ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, query.limit, query.offset)
    .all();

  return {
    orders: (rows.results ?? []).map((row) => rowToOrder(row as Record<string, unknown>)),
    total: Number(countRow?.n ?? 0),
  };
}

/** 상태별 건수 — 관리 화면 상단 요약에 씁니다. */
export async function orderCounts(db: D1Database): Promise<Record<string, number>> {
  const rows = await db
    .prepare(
      `SELECT fulfillment, COUNT(*) AS n FROM orders WHERE status = 'paid' GROUP BY fulfillment`,
    )
    .all();
  const counts: Record<string, number> = {};
  for (const row of rows.results ?? []) {
    const r = row as { fulfillment: string; n: number };
    counts[r.fulfillment] = Number(r.n);
  }
  return counts;
}

export async function updateFulfillment(
  db: D1Database,
  id: string,
  patch: {
    fulfillment?: Fulfillment;
    carrier?: string | null;
    trackingNumber?: string | null;
    adminMemo?: string | null;
  },
  now: string,
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.fulfillment) {
    sets.push('fulfillment = ?');
    params.push(patch.fulfillment);
    // 발송으로 바뀌는 순간을 기록해 둡니다. 되돌리면 지웁니다.
    if (patch.fulfillment === 'shipped') {
      sets.push('shipped_at = COALESCE(shipped_at, ?)');
      params.push(now);
    } else if (patch.fulfillment === 'unfulfilled' || patch.fulfillment === 'preparing') {
      sets.push('shipped_at = NULL');
    }
  }
  if (patch.carrier !== undefined) {
    sets.push('carrier = ?');
    params.push(patch.carrier);
  }
  if (patch.trackingNumber !== undefined) {
    sets.push('tracking_number = ?');
    params.push(patch.trackingNumber);
  }
  if (patch.adminMemo !== undefined) {
    sets.push('admin_memo = ?');
    params.push(patch.adminMemo);
  }

  if (!sets.length) return false;

  sets.push('updated_at = ?');
  params.push(now, id);

  const result = await db
    .prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}
