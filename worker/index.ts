/**
 * AVORA — Cloudflare Worker
 *
 * 정적 페이지는 이 코드를 거치지 않습니다. Cloudflare 는 요청 URL 이 정적 에셋과
 * 맞으면 Worker 를 호출하지 않고 바로 내보냅니다(공식 문서: "served directly without
 * invoking Worker code"). 그래서 이 Worker 가 실제로 도는 경우는 넷뿐입니다.
 *
 *   1. `/`            — 언어를 판별해 /{lang}/ 으로 302
 *   2. `/api/*`       — wrangler.jsonc 의 run_worker_first 로 강제 진입
 *   3. 매칭 실패      — 404 페이지를 언어에 맞춰 돌려주기
 */
import { tossPayments } from './payments/tosspayments';
import { mockPayments } from './payments/mock';
import type { PaymentAdapter } from './payments/types';
import {
  createOrder,
  getOrder,
  findOrderForCustomer,
  markPaid,
  forcePaid,
  markFailed,
  publicView,
  type OrderDraft,
} from './orders';
import { priceOrder, currencyOf, isAllowedCurrency } from './catalog';

const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'] as const;
type Locale = (typeof LOCALES)[number];
const DEFAULT_LOCALE: Locale = 'en';

/** 브라우저가 보내는 언어 태그를 우리가 가진 언어로 좁힙니다. */
const LANGUAGE_ALIASES: Record<string, Locale> = {
  ko: 'ko',
  en: 'en',
  zh: 'zh',
  'zh-cn': 'zh',
  'zh-hans': 'zh',
  'zh-sg': 'zh',
  th: 'th',
  vi: 'vi',
};

const ADAPTERS: Record<string, PaymentAdapter> = {
  tosspayments: tossPayments,
  // 테스트 전용 — PAYMENT_PROVIDER=mock 일 때만 잡힙니다. 운영 설정에는 넣지 않습니다.
  mock: mockPayments,
};

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  /** 어떤 PG 어댑터를 쓸지. 미설정이면 결제 엔드포인트가 비활성입니다. */
  PAYMENT_PROVIDER?: string;
  TOSS_SECRET_KEY?: string;
  /** 가격 확정 전 흐름을 돌려보기 위한 임시 가격. 운영에서는 설정하지 않습니다. */
  PRODUCT_PRICE?: string;
}

/**
 * Accept-Language 를 q 값 순으로 훑어 지원 언어를 찾습니다.
 * 정적 사이트였다면 클라이언트 JS 로 해야 했을 일이라, 화면 깜빡임과
 * SEO 손해가 생겼을 자리입니다. 서버에서 하면 그냥 302 한 번입니다.
 */
export function pickLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split('=')[1]) || 0 : 1 };
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    if (LANGUAGE_ALIASES[tag]) return LANGUAGE_ALIASES[tag];
    const base = tag.split('-')[0];
    if (LANGUAGE_ALIASES[base]) return LANGUAGE_ALIASES[base];
  }
  return DEFAULT_LOCALE;
}

/** 경로 앞머리에서 언어를 읽습니다. 404 를 맞는 언어로 돌려주기 위해 필요합니다. */
export function localeFromPath(pathname: string): Locale {
  const first = pathname.split('/').filter(Boolean)[0];
  return LOCALES.includes(first as Locale) ? (first as Locale) : DEFAULT_LOCALE;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 주문 정보는 절대 캐시하지 않습니다.
      'Cache-Control': 'no-store',
    },
  });
}

const ORDER_ID_PATTERN = /^AVORA-\d{14}-[A-Z0-9]{6}$/;

/** 사용자가 보낸 문자열을 길이 제한과 함께 다듬습니다. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/**
 * 주문 생성. 결제창을 띄우기 전에 호출합니다.
 *
 * 클라이언트가 보낸 단가와 총액은 **쓰지 않습니다.** 상품 id 와 수량만 받아
 * 서버가 자기가 아는 가격으로 다시 계산하고, 그 값을 저장합니다.
 * 승인 단계는 이 저장된 금액만 신뢰합니다.
 */
async function handleCreateOrder(request: Request, env: Env): Promise<Response> {
  if (!env.DB) {
    return json(
      { error: 'ORDERS_NOT_CONFIGURED', message: 'D1 바인딩(DB)이 없습니다.' },
      503,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const orderId = text(body.orderId, 40);
  if (!orderId || !ORDER_ID_PATTERN.test(orderId)) {
    return json({ error: 'INVALID_ORDER_ID' }, 400);
  }

  // 가격은 서버가 정합니다.
  const priced = priceOrder(body.items, env);
  if (!priced.ok) {
    return json({ error: priced.error, message: priced.message }, 400);
  }

  // 클라이언트가 계산한 금액과 어긋나면 진행하지 않습니다.
  // 조작일 수도 있고, 화면과 서버 설정이 어긋난 것일 수도 있습니다 —
  // 어느 쪽이든 고객이 본 금액과 다른 금액으로 결제하면 안 됩니다.
  const claimed = Number(body.amount);
  if (!Number.isInteger(claimed) || claimed !== priced.total) {
    return json(
      {
        error: 'AMOUNT_MISMATCH',
        message: '화면에 표시된 금액과 서버가 계산한 금액이 다릅니다. 새로고침 후 다시 시도해 주세요.',
        expected: priced.total,
      },
      400,
    );
  }

  const currency = text(body.currency, 8) ?? currencyOf();
  if (!isAllowedCurrency(currency)) {
    return json({ error: 'INVALID_CURRENCY' }, 400);
  }

  const draft: OrderDraft | null = (() => {
    const recipientName = text(body.recipientName, 60);
    const recipientPhone = text(body.recipientPhone, 30);
    const postalCode = text(body.postalCode, 12);
    const address1 = text(body.address1, 200);
    if (!recipientName || !recipientPhone || !postalCode || !address1) return null;
    return {
      amount: priced.total,
      currency,
      items: priced.items,
      locale: text(body.locale, 8) ?? DEFAULT_LOCALE,
      recipientName,
      recipientPhone,
      postalCode,
      address1,
      address2: text(body.address2, 200) ?? undefined,
      memo: text(body.memo, 300) ?? undefined,
      email: text(body.email, 160) ?? undefined,
    };
  })();

  if (!draft) return json({ error: 'MISSING_FIELDS' }, 400);

  const now = new Date().toISOString();
  try {
    await createOrder(env.DB, orderId, draft, now);
  } catch (cause) {
    // 같은 주문번호가 이미 있는 경우와, DB 자체가 잘못된 경우를 구분합니다.
    // 예전에는 둘 다 "중복 주문"으로 답해서, 마이그레이션이 안 된 상태의
    // 진짜 원인이 고객에게도 로그에도 남지 않았습니다.
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/UNIQUE|PRIMARY KEY|constraint/i.test(message)) {
      return json({ error: 'ORDER_EXISTS', message: '이미 접수된 주문번호입니다.' }, 409);
    }
    console.error('주문 저장 실패', { orderId, message });
    return json({ error: 'ORDER_SAVE_FAILED', message: '주문을 저장하지 못했습니다.' }, 500);
  }

  return json({ ok: true, orderId, amount: priced.total });
}

/**
 * 결제 승인. 결제창이 성공으로 돌아온 뒤 호출합니다.
 *
 * 순서가 중요합니다 — 저장된 주문의 금액과 대조한 다음에야 PG 에 승인을 요청합니다.
 * 클라이언트가 보낸 amount 는 검증용으로만 쓰고, 실제 승인에는 서버 금액을 씁니다.
 */
async function handlePaymentConfirm(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const providerName = env.PAYMENT_PROVIDER;
  const adapter = providerName ? ADAPTERS[providerName] : undefined;

  if (!adapter) {
    return json(
      {
        error: 'PAYMENT_NOT_CONFIGURED',
        message: 'PAYMENT_PROVIDER 가 설정되지 않았습니다. PG 계약과 도메인 확정 후 활성화하세요.',
      },
      503,
    );
  }
  if (!adapter.isConfigured(env as unknown as Record<string, unknown>)) {
    return json(
      { error: 'PAYMENT_SECRET_MISSING', message: `${adapter.name} 시크릿이 없습니다.` },
      503,
    );
  }
  if (!env.DB) {
    return json({ error: 'ORDERS_NOT_CONFIGURED', message: 'D1 바인딩(DB)이 없습니다.' }, 503);
  }

  let body: { paymentKey?: string; orderId?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const { paymentKey, orderId, amount } = body;
  if (!paymentKey || !orderId) {
    return json({ error: 'INVALID_REQUEST', message: 'paymentKey 와 orderId 가 필요합니다.' }, 400);
  }

  const order = await getOrder(env.DB, orderId);
  if (!order) return json({ error: 'ORDER_NOT_FOUND' }, 404);

  // 이미 승인된 주문이면 다시 승인하지 않고 그대로 돌려줍니다.
  // 완료 페이지를 새로고침해도 중복 결제가 되지 않게 하는 장치입니다.
  if (order.status === 'paid') {
    return json({ ok: true, alreadyPaid: true, order: publicView(order) });
  }
  if (order.status !== 'pending') {
    return json({ error: 'ORDER_NOT_PAYABLE', status: order.status }, 409);
  }

  // 핵심 검증 — 브라우저가 보낸 금액이 서버가 기억하는 금액과 다르면 중단합니다.
  // 값이 없거나 숫자가 아니어도 거절합니다. 예전에는 없으면 검사를 건너뛰어서,
  // 파라미터를 지우기만 하면 대조를 우회할 수 있었습니다.
  if (!Number.isInteger(amount)) {
    return json({ error: 'AMOUNT_REQUIRED', message: 'amount 가 필요합니다.' }, 400);
  }
  if (amount !== order.amount) {
    await markFailed(env.DB, orderId, new Date().toISOString());
    return json({ error: 'AMOUNT_TAMPERED', message: '주문 금액이 일치하지 않습니다.' }, 400);
  }

  const result = await adapter.confirm(
    { paymentKey, orderId, amount: order.amount },
    env as unknown as Record<string, unknown>,
  );

  const now = new Date().toISOString();

  if (!result.ok) {
    // 결과를 알 수 없는 실패(네트워크·5xx)는 주문을 닫지 않습니다.
    // 닫아버리면 실제로는 승인이 끝났는데 주문만 실패로 남는 상태가 생깁니다.
    if (result.error?.retriable) {
      return json({ ...result, retriable: true }, 503);
    }
    await markFailed(env.DB, orderId, now);
    return json(result, 502);
  }

  const paymentKeyToStore = result.transactionId ?? paymentKey;
  const updated = await markPaid(
    env.DB,
    orderId,
    paymentKeyToStore,
    result.status ?? null,
    result.approvedAt ?? now,
    now,
  );

  if (!updated) {
    // 승인은 성공했는데 상태가 pending 이 아니어서 갱신되지 않았습니다.
    // 이미 돈이 빠져나간 상태이므로 실패로 두면 안 됩니다 — 강제로 결제 완료로 맞춥니다.
    console.error('승인 성공 후 상태 갱신 실패 — 강제 정정', { orderId });
    await forcePaid(env.DB, orderId, paymentKeyToStore, result.status ?? null, result.approvedAt ?? now, now);
  }

  const finalOrder = await getOrder(env.DB, orderId);
  return json({ ok: true, order: finalOrder ? publicView(finalOrder) : null });
}

/** 비회원 주문 조회 — 주문번호와 연락처가 둘 다 맞아야 합니다. */
async function handleOrderLookup(request: Request, env: Env): Promise<Response> {
  if (!env.DB) {
    return json({ error: 'ORDERS_NOT_CONFIGURED' }, 503);
  }

  let body: { orderId?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const orderId = text(body.orderId, 40);
  const phone = text(body.phone, 30);
  if (!orderId || !phone) return json({ error: 'MISSING_FIELDS' }, 400);

  const order = await findOrderForCustomer(env.DB, orderId, phone);
  // 없는 주문과 연락처 불일치를 같은 응답으로 돌려줍니다 —
  // 다르게 답하면 주문번호가 존재하는지를 알려주는 셈이 됩니다.
  if (!order) return json({ error: 'ORDER_NOT_FOUND' }, 404);

  return json({ ok: true, order: publicView(order) });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // 1 — 루트 진입: 언어를 골라 보냅니다.
    if (pathname === '/' || pathname === '') {
      const locale = pickLocale(request.headers.get('accept-language'));
      return Response.redirect(new URL(`/${locale}/`, url).href, 302);
    }

    // 2 — API
    if (pathname === '/api/orders' && request.method === 'POST') {
      return handleCreateOrder(request, env);
    }
    if (pathname === '/api/orders/lookup' && request.method === 'POST') {
      return handleOrderLookup(request, env);
    }
    if (pathname === '/api/payments/confirm') {
      return handlePaymentConfirm(request, env);
    }
    if (pathname.startsWith('/api/')) {
      return json({ error: 'NOT_FOUND' }, 404);
    }

    // 3 — 그 외에는 정적 에셋에 넘깁니다.
    const assetResponse = await env.ASSETS.fetch(request);

    // 에셋에도 없으면 언어에 맞는 404 페이지를 상태 코드 404 로 돌려줍니다.
    if (assetResponse.status === 404) {
      const locale = localeFromPath(pathname);
      const notFound = await env.ASSETS.fetch(new URL(`/${locale}/404/`, url).href);
      if (notFound.ok) {
        return new Response(notFound.body, {
          status: 404,
          headers: notFound.headers,
        });
      }
    }

    return assetResponse;
  },
};
