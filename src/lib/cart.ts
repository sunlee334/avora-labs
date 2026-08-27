/**
 * 장바구니 — 브라우저 localStorage 에만 삽니다.
 *
 * 서버에 저장하지 않는 이유는 Round 6 결정입니다(자체 DB 없음).
 * 제품이 한 종이라 담을 수 있는 것도 사실상 하나뿐이지만, 나중에 SKU 가 늘어도
 * 구조를 바꾸지 않도록 여러 항목을 담을 수 있게 만들어 두었습니다.
 *
 * 담기는 것은 상품 id 와 수량뿐입니다. 가격·이름은 담지 않습니다 —
 * 담아두면 나중에 값이 바뀌었을 때 장바구니에 옛날 값이 남습니다.
 * 표시할 때마다 product.json 에서 현재 값을 읽습니다.
 */
import commerce from '../config/commerce.json';
import product from '../data/product.json';
import { PRICE, SELLS_DIRECTLY } from '../config/runtime';

export interface CartLine {
  id: string;
  qty: number;
}

export interface CartTotals {
  /** 상품 금액 합계. 가격이 아직 정해지지 않았으면 null */
  subtotal: number | null;
  shipping: number | null;
  total: number | null;
  itemCount: number;
}

const KEY = commerce.cart.storageKey;
const MAX = commerce.order.maxQuantityPerItem;

/** 이 사이트가 아는 상품. 지금은 하나입니다. */
const CATALOG: Record<string, { name: string; price: number | null; image: string }> = {
  [product.id]: {
    name: product.name,
    price: PRICE,
    image: product.images.thumb,
  },
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function read(): CartLine[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 저장된 값이 손상됐거나 예전 형식이면 조용히 버립니다.
    // `in` 대신 hasOwn 을 쓰는 이유: `'toString' in CATALOG` 는 참이라,
    // 그런 id 가 저장돼 있으면 이름도 가격도 없는 줄이 장바구니에 남습니다.
    return parsed
      .filter(
        (line): line is CartLine =>
          line &&
          typeof line.id === 'string' &&
          typeof line.qty === 'number' &&
          line.qty > 0 &&
          Object.hasOwn(CATALOG, line.id),
      )
      .map((line) => ({ id: line.id, qty: Math.min(Math.floor(line.qty), MAX) }));
  } catch {
    return [];
  }
}

function write(lines: CartLine[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // 사생활 보호 모드 등에서 저장이 막힐 수 있습니다.
    // 이 경우 장바구니는 현재 탭에서만 유지되고, 그래도 구매는 가능합니다.
  }
  notify(lines);
}

export function add(id: string, qty = 1): CartLine[] {
  const lines = read();
  const found = lines.find((line) => line.id === id);
  if (found) found.qty = Math.min(found.qty + qty, MAX);
  else lines.push({ id, qty: Math.min(qty, MAX) });
  write(lines);
  return lines;
}

export function setQty(id: string, qty: number): CartLine[] {
  const next = read()
    .map((line) => (line.id === id ? { ...line, qty: Math.min(Math.max(qty, 0), MAX) } : line))
    .filter((line) => line.qty > 0);
  write(next);
  return next;
}

export function remove(id: string): CartLine[] {
  const next = read().filter((line) => line.id !== id);
  write(next);
  return next;
}

export function clear(): void {
  write([]);
}

export function itemCount(lines = read()): number {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}

/** 장바구니 줄에 현재 상품 정보를 붙여 돌려줍니다. */
export function detailed(lines = read()) {
  return lines.map((line) => ({
    ...line,
    ...CATALOG[line.id],
    lineTotal: CATALOG[line.id]?.price != null ? CATALOG[line.id].price! * line.qty : null,
  }));
}

export function totals(lines = read()): CartTotals {
  const count = itemCount(lines);
  const hasUnknownPrice = lines.some((line) => CATALOG[line.id]?.price == null);

  if (count === 0 || hasUnknownPrice) {
    return { subtotal: null, shipping: null, total: null, itemCount: count };
  }

  const subtotal = lines.reduce((sum, line) => sum + CATALOG[line.id]!.price! * line.qty, 0);
  const shipping = shippingFor(subtotal);
  return { subtotal, shipping, total: subtotal + shipping, itemCount: count };
}

/** 배송비 계산. 정책은 src/config/commerce.json 이 정합니다. */
export function shippingFor(subtotal: number): number {
  const s = commerce.shipping;
  if (s.policy === 'free') return 0;
  if (s.policy === 'threshold') return subtotal >= s.freeThreshold ? 0 : s.flatFee;
  return s.flatFee;
}

/** 결제를 열 수 있는 상태인지. 가격이 없으면 금액을 만들 수 없습니다. */
export function isPurchasable(): boolean {
  return SELLS_DIRECTLY;
}

// ── 변경 구독 ────────────────────────────────────────────────
// 헤더의 장바구니 배지처럼 여러 곳이 같은 상태를 봅니다.
type Listener = (lines: CartLine[]) => void;
const listeners = new Set<Listener>();

function notify(lines: CartLine[]): void {
  for (const listener of listeners) listener(lines);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(read());
  // 다른 탭에서 담은 것도 반영합니다.
  if (isBrowser()) {
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) listener(read());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }
  return () => listeners.delete(listener);
}

/** 주문번호. 서버가 없으므로 클라이언트에서 만들고, 승인 단계에서 PG 가 중복을 걸러 줍니다. */
export function newOrderId(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${commerce.order.orderIdPrefix}-${stamp}-${rand}`;
}
