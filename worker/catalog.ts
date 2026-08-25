/**
 * 서버가 아는 상품과 가격.
 *
 * 이 파일이 존재하는 이유:
 *   처음 구현에서는 주문 생성 시 "항목 합계 == 총액"만 확인했습니다. 그런데 단가도
 *   클라이언트가 보내는 값이라, 단가와 총액을 함께 낮추면 검사를 통과했습니다.
 *   실제로 32,000원짜리를 100원에 주문하고 승인까지 통과했습니다.
 *
 *   그래서 이제 **클라이언트가 보낸 단가와 총액은 쓰지 않습니다.** 서버가
 *   자기가 아는 가격으로 다시 계산하고, 그 값만 저장·승인에 씁니다.
 *
 * 가격을 바꾸려면 src/data/product.json 을 고치세요. 이 파일은 그것을 읽을 뿐입니다.
 */
import product from '../src/data/product.json';
import commerce from '../src/config/commerce.json';

export interface CatalogEntry {
  id: string;
  name: string;
  price: number;
}

/** 한 주문에 담을 수 있는 항목 종류 수. 무한정 받으면 한 행이 터집니다. */
export const MAX_LINES = 20;

/** 항목당 수량 상한. commerce.json 이 정하며 서버에서도 강제합니다. */
export const MAX_QTY = commerce.order.maxQuantityPerItem;

/** 저장을 허용하는 통화. Intl.NumberFormat 이 던지는 값이 들어오면 화면이 멈춥니다. */
const ALLOWED_CURRENCIES = new Set(['KRW', 'USD', 'CNY', 'THB', 'VND']);

export function isAllowedCurrency(value: string): boolean {
  return ALLOWED_CURRENCIES.has(value);
}

/**
 * 이 빌드가 파는 상품 목록.
 *
 * 가격은 product.json 이 원본이지만, 실제 결제를 열기 전에 흐름을 돌려보려면
 * 임시 가격이 필요합니다. 그때만 PRODUCT_PRICE 환경변수로 덮어씁니다
 * (프런트의 PUBLIC_PRODUCT_PRICE 와 짝을 이룹니다). 운영에서는 설정하지 않습니다.
 */
export function catalog(env: { PRODUCT_PRICE?: string }): Map<string, CatalogEntry> {
  const override = env.PRODUCT_PRICE ? Number(env.PRODUCT_PRICE) : null;
  const price =
    override != null && Number.isInteger(override) && override > 0
      ? override
      : (product.price as number | null);

  const entries = new Map<string, CatalogEntry>();
  if (price != null) {
    entries.set(product.id, { id: product.id, name: product.name, price });
  }
  return entries;
}

export function currencyOf(): string {
  return product.currency;
}

/** 배송비. src/lib/cart.ts 와 같은 설정을 읽어 같은 결과를 냅니다. */
export function shippingFor(subtotal: number): number {
  const s = commerce.shipping;
  if (s.policy === 'free') return 0;
  if (s.policy === 'threshold') return subtotal >= s.freeThreshold ? 0 : s.flatFee;
  return s.flatFee;
}

export interface PricedLine {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export type PricingResult =
  | { ok: true; items: PricedLine[]; subtotal: number; shipping: number; total: number }
  | { ok: false; error: string; message: string };

/**
 * 클라이언트가 보낸 장바구니를 서버 가격으로 다시 계산합니다.
 * 들어온 값에서 쓰는 것은 **상품 id 와 수량뿐**입니다.
 */
export function priceOrder(
  rawItems: unknown,
  env: { PRODUCT_PRICE?: string },
): PricingResult {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'EMPTY_ITEMS', message: '주문할 상품이 없습니다.' };
  }
  if (rawItems.length > MAX_LINES) {
    return { ok: false, error: 'TOO_MANY_ITEMS', message: '한 번에 주문할 수 있는 상품 종류를 넘었습니다.' };
  }

  const known = catalog(env);
  if (known.size === 0) {
    return { ok: false, error: 'PRICE_NOT_SET', message: '판매 가격이 아직 설정되지 않았습니다.' };
  }

  const seen = new Set<string>();
  const items: PricedLine[] = [];

  for (const raw of rawItems) {
    const line = raw as Record<string, unknown>;
    const id = typeof line.id === 'string' ? line.id.trim() : '';
    const qty = Number(line.qty);

    const entry = known.get(id);
    if (!entry) {
      return { ok: false, error: 'UNKNOWN_ITEM', message: '판매하지 않는 상품이 포함돼 있습니다.' };
    }
    if (seen.has(id)) {
      return { ok: false, error: 'DUPLICATE_ITEM', message: '같은 상품이 중복으로 들어 있습니다.' };
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return { ok: false, error: 'INVALID_QUANTITY', message: `수량은 1개 이상 ${MAX_QTY}개 이하여야 합니다.` };
    }

    seen.add(id);
    // 이름과 단가는 서버 것을 씁니다. 클라이언트가 보낸 값은 버립니다.
    items.push({ id: entry.id, name: entry.name, qty, unitPrice: entry.price });
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const shipping = shippingFor(subtotal);
  return { ok: true, items, subtotal, shipping, total: subtotal + shipping };
}
