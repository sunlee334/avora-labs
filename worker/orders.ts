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

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

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
}

export interface OrderRecord extends OrderDraft {
  id: string;
  status: OrderStatus;
  paymentKey: string | null;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** 연락처는 표기 방식이 제각각이라 숫자만 남겨 비교합니다. */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function rowToOrder(row: Record<string, unknown>): OrderRecord {
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
    paymentKey: (row.payment_key as string) ?? null,
    paymentMethod: (row.payment_method as string) ?? null,
    paidAt: (row.paid_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function createOrder(
  db: D1Database,
  id: string,
  draft: OrderDraft,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO orders (
         id, status, amount, currency, items, locale,
         recipient_name, recipient_phone, postal_code, address1, address2, memo, email,
         created_at, updated_at
       ) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      now,
      now,
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

export async function markPaid(
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
        WHERE id = ? AND status = 'pending'`,
    )
    .bind(paymentKey, paymentMethod, paidAt, now, id)
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
    amount: order.amount,
    currency: order.currency,
    items: order.items,
    recipientName: order.recipientName,
    postalCode: order.postalCode,
    address1: order.address1,
    address2: order.address2 ?? null,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
  };
}
