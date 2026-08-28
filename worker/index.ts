/**
 * AVORA — Cloudflare Worker
 *
 * 정적 페이지는 이 코드를 거치지 않습니다. Cloudflare 는 요청 URL 이 정적 에셋과
 * 맞으면 Worker 를 호출하지 않고 바로 내보냅니다(공식 문서: "served directly without
 * invoking Worker code"). 그래서 이 Worker 가 실제로 도는 경우는 넷뿐입니다.
 *
 *   1. `/`            — 언어를 판별해 /{lang}/ 으로 302
 *   2. `/api/*`       — wrangler.jsonc 의 run_worker_first 로 강제 진입
 *   3. `/admin*`      — 같은 이유로 강제 진입. 인증을 통과해야 화면이 나갑니다
 *   4. 매칭 실패      — 404 페이지를 언어에 맞춰 돌려주기
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
  listOrders,
  orderCounts,
  updateFulfillment,
  FULFILLMENTS,
  type OrderDraft,
  type OrderStatus,
  type Fulfillment,
} from './orders';
import { priceOrder, currencyOf, isAllowedCurrency } from './catalog';
import { verifyAdmin, type AdminEnv } from './admin';
import {
  createInquiry,
  inquiriesForOrder,
  inquiriesForUser,
  answerInquiry,
  listInquiries,
  openInquiryCount,
  publicInquiry,
} from './inquiries';
import { canonicalHostRedirect } from './canonical-host';
import { renderReviewsPage } from './reviews-page';
import { handleKakaoWebhook } from './auth/kakao-webhook';
import {
  createReview,
  getReview,
  listAllReviews,
  listVisibleReviews,
  publicReview,
  reviewSummary,
  setReviewStatus,
  type ReviewStatus,
} from './reviews';
import { notifyNewOrder, toNotification } from './notify';
import { notifyNewInquiry } from './notify/inquiry';
import {
  handleLogin,
  handleCallback,
  handleLogout,
  handleLinkStart,
  handleIdentities,
  handleProviders,
  handleUnlink,
  currentUser,
  type AuthEnv,
} from './auth';
import { publicUser, ordersForUser, saveAddress, claimOrder } from './accounts';

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

interface Env extends AdminEnv, AuthEnv {
  ASSETS: Fetcher;
  DB?: D1Database;
  /** 어떤 PG 어댑터를 쓸지. 미설정이면 결제 엔드포인트가 비활성입니다. */
  PAYMENT_PROVIDER?: string;
  TOSS_SECRET_KEY?: string;
  /** 가격 확정 전 흐름을 돌려보기 위한 임시 가격. 운영에서는 설정하지 않습니다. */
  PRODUCT_PRICE?: string;
  /** 새 주문 알림을 보낼 웹훅(Slack·Discord 등). 없으면 알림을 건너뜁니다. */
  NOTIFY_WEBHOOK_URL?: string;
  NOTIFY_EMAIL_FROM?: string;
  NOTIFY_EMAIL_TO?: string;
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

  // 로그인 상태면 주문을 계정에 잇고, 배송지를 기억해 둡니다.
  // 로그인하지 않았어도 주문은 그대로 진행됩니다.
  const buyer = await currentUser(request, env);

  try {
    await createOrder(env.DB, orderId, draft, now, buyer?.id ?? null);
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

  if (buyer) {
    await saveAddress(
      env.DB,
      buyer.id,
      {
        recipientName: draft.recipientName,
        recipientPhone: draft.recipientPhone,
        postalCode: draft.postalCode,
        address1: draft.address1,
        address2: draft.address2,
      },
      now,
    );
  }

  return json({ ok: true, orderId, amount: priced.total });
}

/**
 * 결제 승인. 결제창이 성공으로 돌아온 뒤 호출합니다.
 *
 * 순서가 중요합니다 — 저장된 주문의 금액과 대조한 다음에야 PG 에 승인을 요청합니다.
 * 클라이언트가 보낸 amount 는 검증용으로만 쓰고, 실제 승인에는 서버 금액을 씁니다.
 */
async function handlePaymentConfirm(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
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

  /**
   * 이 요청이 pending → paid 전이를 **직접** 해냈는가.
   *
   * 완료 화면에서 새로고침을 연타하면 승인 요청이 동시에 여러 개 날아옵니다.
   * 전부 pending 을 읽고 전부 승인까지 갑니다(결제사 중복 승인은 orderId 를
   * 멱등 키로 넘겨 막습니다). 그중 markPaid 로 실제 행을 바꾼 것은 하나뿐이고,
   * 나머지는 0행을 갱신합니다. 판매자에게 알림이 요청 수만큼 가면 안 되므로,
   * 전이를 해낸 요청만 알립니다.
   */
  let didTransition = updated;

  if (!updated) {
    // 갱신이 안 된 이유가 둘입니다. 하나는 위의 경쟁이고, 다른 하나는 상태가
    // 정말로 어긋난 경우(예: failed 로 닫혔는데 뒤늦게 승인이 성공)입니다.
    // 앞은 정상이고 뒤는 사람이 봐야 하므로 구분해서 다룹니다.
    const concurrent = (await getOrder(env.DB, orderId))?.status === 'paid';

    if (!concurrent) {
      // 이미 돈이 빠져나간 상태이므로 실패로 두면 안 됩니다 — 강제로 맞춥니다.
      console.error('승인 성공 후 상태 갱신 실패 — 강제 정정', { orderId });
      await forcePaid(env.DB, orderId, paymentKeyToStore, result.status ?? null, result.approvedAt ?? now, now);
      didTransition = true;
    }
  }

  const finalOrder = await getOrder(env.DB, orderId);

  // 발송할 것이 생겼으니 판매자에게 알립니다.
  //
  // 여기까지 온 요청만 알립니다. 위쪽의 "이미 결제됨" 분기가 먼저 돌아가므로,
  // 완료 페이지를 새로고침하거나 승인을 재시도해도 알림은 한 번만 나갑니다.
  //
  // waitUntil 로 응답 뒤에 돌립니다 — 고객은 이미 결제를 마쳤고, 알림이
  // 느리다고 완료 화면이 기다려야 할 이유가 없습니다.
  if (finalOrder && didTransition) {
    const adminUrl = new URL('/admin', request.url).href;
    ctx.waitUntil(
      notifyNewOrder(toNotification(finalOrder, adminUrl), env as unknown as Record<string, unknown>),
    );
  }

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


// ── 구매 후기 ────────────────────────────────────────────────
// 자격은 주문이 정합니다. 결제가 끝난 주문의 주문번호와 연락처를 아는 사람만
// 쓸 수 있고, 주문 하나에 리뷰 하나입니다. 그래서 "구매 확인" 이 사실입니다.

/** 리뷰 본문 길이. 너무 짧으면 후기가 아니고, 너무 길면 화면과 저장이 무너집니다. */
const REVIEW_BODY_MIN = 10;
const REVIEW_BODY_MAX = 2000;

async function handleReviewList(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return json({ error: 'REVIEWS_NOT_CONFIGURED' }, 503);

  const url = new URL(request.url);
  const limit = clampInt(url.searchParams.get('limit'), 20, 1, 50);
  const offset = clampInt(url.searchParams.get('offset'), 0, 0, 100000);

  const [reviews, summary] = await Promise.all([
    listVisibleReviews(env.DB, limit, offset),
    reviewSummary(env.DB),
  ]);

  return json({
    ok: true,
    summary,
    reviews: reviews.map(publicReview),
  });
}

async function handleReviewCreate(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return json({ error: 'REVIEWS_NOT_CONFIGURED' }, 503);

  let body: {
    orderId?: string;
    phone?: string;
    rating?: unknown;
    body?: string;
    locale?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const orderId = text(body.orderId, 40);
  const phone = text(body.phone, 30);
  const reviewBody = text(body.body, REVIEW_BODY_MAX);
  const rating = Number(body.rating);

  if (!orderId || !phone || !reviewBody) return json({ error: 'MISSING_FIELDS' }, 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json({ error: 'INVALID_RATING', message: '별점은 1점부터 5점까지입니다.' }, 400);
  }
  if (reviewBody.length < REVIEW_BODY_MIN) {
    return json(
      { error: 'BODY_TOO_SHORT', message: `후기는 ${REVIEW_BODY_MIN}자 이상 적어주세요.` },
      400,
    );
  }

  // 주문번호와 연락처가 함께 맞아야 합니다. 주문 조회와 같은 열쇠입니다.
  const order = await findOrderForCustomer(env.DB, orderId, phone);
  // 없는 주문과 연락처 불일치를 같은 응답으로 돌려줍니다 —
  // 다르게 답하면 주문번호가 존재하는지를 알려주는 셈이 됩니다.
  if (!order) return json({ error: 'ORDER_NOT_FOUND' }, 404);

  if (order.status !== 'paid') {
    return json(
      {
        error: 'ORDER_NOT_PAID',
        message: '결제가 완료된 주문에만 후기를 남길 수 있습니다.',
      },
      409,
    );
  }

  const requested = String(body.locale ?? '');
  const locale = (LOCALES as readonly string[]).includes(requested) ? requested : order.locale;

  const created = await createReview(
    env.DB,
    {
      orderId: order.id,
      rating,
      body: reviewBody,
      authorName: order.recipientName,
      locale,
    },
    new Date(),
  );

  if (!created.ok) {
    return json(
      { error: 'ALREADY_REVIEWED', message: '이 주문에는 이미 후기를 남기셨습니다.' },
      409,
    );
  }

  return json({ ok: true, review: publicReview(created.review) }, 201);
}

async function handleAdminReviewList(env: Env, url: URL, who: string): Promise<Response> {
  if (!env.DB) return json({ error: 'REVIEWS_NOT_CONFIGURED' }, 503);
  const limit = clampInt(url.searchParams.get('limit'), 20, 1, 100);
  const offset = clampInt(url.searchParams.get('offset'), 0, 0, 100000);
  const { reviews, total } = await listAllReviews(env.DB, limit, offset);
  return json({ ok: true, who, total, reviews });
}

async function handleAdminReviewPatch(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  if (!env.DB) return json({ error: 'REVIEWS_NOT_CONFIGURED' }, 503);

  let body: { status?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const status = body.status === 'visible' || body.status === 'hidden' ? body.status : null;
  if (!status) return json({ error: 'INVALID_STATUS' }, 400);

  const reason = text(body.reason, 200);
  // 숨길 때는 이유가 반드시 있어야 합니다. 기준 없이 지운 기록이 없으면,
  // 부정적 리뷰만 골라 숨겼는지 아닌지를 나중에 아무도 증명할 수 없습니다.
  if (status === 'hidden' && !reason) {
    return json(
      { error: 'REASON_REQUIRED', message: '숨기는 이유를 남겨야 합니다.' },
      400,
    );
  }

  const changed = await setReviewStatus(
    env.DB,
    id,
    status as ReviewStatus,
    reason,
    new Date().toISOString(),
  );
  if (!changed) return json({ error: 'REVIEW_NOT_FOUND' }, 404);

  const review = await getReview(env.DB, id);
  return json({ ok: true, review });
}

// ── 문의 ─────────────────────────────────────────────────────
// 공개 게시판이 아닙니다. 본인과 관리자만 봅니다.
//
// 들어오는 길이 둘입니다 — 로그인, 그리고 주문번호+연락처. 요청에 주문번호와
// 연락처가 함께 오면 **세션 여부와 무관하게** 주문 경로로 저장하고, 알 수
// 있으면 user_id 도 함께 채웁니다. 그래야 로그인한 사람이 주문조회에서
// 남긴 문의를 마이페이지에서도 볼 수 있습니다.

/** 문의 길이. 리뷰와 같은 기준을 씁니다. */
const INQUIRY_SUBJECT_MAX = 100;
const INQUIRY_BODY_MIN = 10;
const INQUIRY_BODY_MAX = 2000;

async function handleInquiryCreate(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!env.DB) return json({ error: 'INQUIRIES_NOT_CONFIGURED' }, 503);

  let body: { orderId?: string; phone?: string; subject?: string; body?: string; locale?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const subject = text(body.subject, INQUIRY_SUBJECT_MAX);
  const message = text(body.body, INQUIRY_BODY_MAX);
  if (!subject || !message) return json({ error: 'MISSING_FIELDS' }, 400);

  if (message.length < INQUIRY_BODY_MIN) {
    return json(
      {
        error: 'BODY_TOO_SHORT',
        message: `문의 내용을 ${INQUIRY_BODY_MIN}자 이상 적어 주세요.`,
      },
      400,
    );
  }

  const requested = text(body.locale, 8) ?? '';
  const locale = (LOCALES as readonly string[]).includes(requested) ? requested : 'ko';

  // 로그인 여부는 알아만 둡니다. 아래에서 경로를 정할 때 씁니다.
  const user = await currentUser(request, env);

  const orderId = text(body.orderId, 40);
  const phone = text(body.phone, 40);

  if (orderId && phone) {
    // 주문 경로. 주문번호와 연락처가 둘 다 맞아야 합니다.
    // 없는 주문과 연락처 불일치를 같은 응답으로 돌려줍니다 —
    // 다르게 답하면 주문번호가 존재하는지를 알려주는 셈이 됩니다.
    const order = await findOrderForCustomer(env.DB, orderId, phone);
    if (!order) return json({ error: 'ORDER_NOT_FOUND' }, 404);

    const inquiry = await createInquiry(
      env.DB,
      {
        userId: user?.id ?? null,
        orderId: order.id,
        contactPhone: phone,
        subject,
        body: message,
        locale,
      },
      new Date(),
    );
    // 응답 뒤에 보냅니다 — 손님은 이미 남겼고, 알림이 느리다고 "받았습니다"
    // 화면이 기다려야 할 이유가 없습니다. 실패해도 문의는 D1 에 있습니다.
    ctx.waitUntil(
      notifyNewInquiry(
        {
          inquiryId: inquiry.id,
          locale,
          via: 'order',
          adminUrl: new URL('/admin', request.url).href,
        },
        env as unknown as Record<string, unknown>,
      ),
    );
    return json({ ok: true, inquiry: publicInquiry(inquiry) }, 201);
  }

  // 로그인 경로. 주문이 없어도 됩니다 — 구매 전 질문을 받기 위해서입니다.
  if (!user) return json({ error: 'NOT_LOGGED_IN' }, 401);

  const inquiry = await createInquiry(
    env.DB,
    { userId: user.id, subject, body: message, locale },
    new Date(),
  );
  ctx.waitUntil(
    notifyNewInquiry(
      {
        inquiryId: inquiry.id,
        locale,
        via: 'account',
        adminUrl: new URL('/admin', request.url).href,
      },
      env as unknown as Record<string, unknown>,
    ),
  );
  return json({ ok: true, inquiry: publicInquiry(inquiry) }, 201);
}

async function handleInquiryList(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'NOT_LOGGED_IN' }, 401);
  if (!env.DB) return json({ error: 'INQUIRIES_NOT_CONFIGURED' }, 503);

  const inquiries = await inquiriesForUser(env.DB, user.id);
  return json({ ok: true, inquiries: inquiries.map(publicInquiry) });
}

async function handleInquiryLookup(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return json({ error: 'INQUIRIES_NOT_CONFIGURED' }, 503);

  let body: { orderId?: string; phone?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const orderId = text(body.orderId, 40);
  const phone = text(body.phone, 40);
  if (!orderId || !phone) return json({ error: 'MISSING_FIELDS' }, 400);

  const inquiries = await inquiriesForOrder(env.DB, orderId, phone);
  return json({ ok: true, inquiries: inquiries.map(publicInquiry) });
}

async function handleAdminInquiryList(env: Env, url: URL, who: string): Promise<Response> {
  if (!env.DB) return json({ error: 'INQUIRIES_NOT_CONFIGURED' }, 503);

  const status = url.searchParams.get('status');
  const limit = clampInt(url.searchParams.get('limit'), 20, 1, ADMIN_MAX_LIMIT);
  const offset = clampInt(url.searchParams.get('offset'), 0, 0, 100000);

  const { inquiries, total } = await listInquiries(env.DB, {
    status: status === 'open' || status === 'answered' ? status : undefined,
    limit,
    offset,
  });

  return json({
    ok: true,
    who,
    total,
    open: await openInquiryCount(env.DB),
    // 관리 화면은 연락처를 봐야 합니다 — 답을 전할 길이 화면뿐이라
    // 누구의 문의인지 확인할 수 있어야 합니다.
    inquiries,
  });
}

async function handleAdminInquiryAnswer(
  request: Request,
  env: Env,
  id: string,
  who: string,
): Promise<Response> {
  if (!env.DB) return json({ error: 'INQUIRIES_NOT_CONFIGURED' }, 503);

  let body: { answer?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const answer = text(body.answer, INQUIRY_BODY_MAX);
  if (!answer) return json({ error: 'MISSING_FIELDS' }, 400);

  const result = await answerInquiry(env.DB, id, answer, who, new Date());
  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return json({ error: 'INQUIRY_NOT_FOUND' }, 404);
    return json(
      { error: 'ALREADY_ANSWERED', message: '이미 답변한 문의입니다.' },
      409,
    );
  }

  return json({ ok: true, inquiry: result.inquiry });
}

// ── 회원 계정 ────────────────────────────────────────────────
// 로그인은 선택입니다. 비회원 주문은 앞으로도 계속 받습니다 —
// 결제 직전에 로그인을 요구하면 거기서 이탈합니다.

async function handleAccountMe(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'NOT_LOGGED_IN' }, 401);
  return json({ user: publicUser(user) });
}

async function handleAccountOrders(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'NOT_LOGGED_IN' }, 401);
  if (!env.DB) return json({ error: 'ACCOUNTS_NOT_CONFIGURED' }, 503);

  const orders = await ordersForUser(env.DB, user.id);
  return json({ orders: orders.map(publicView) });
}

async function handleAccountAddress(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'NOT_LOGGED_IN' }, 401);
  if (!env.DB) return json({ error: 'ACCOUNTS_NOT_CONFIGURED' }, 503);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const recipientName = text(body.recipientName, 60);
  const recipientPhone = text(body.recipientPhone, 30);
  const postalCode = text(body.postalCode, 12);
  const address1 = text(body.address1, 200);
  if (!recipientName || !recipientPhone || !postalCode || !address1) {
    return json({ error: 'MISSING_FIELDS' }, 400);
  }

  await saveAddress(
    env.DB,
    user.id,
    { recipientName, recipientPhone, postalCode, address1, address2: text(body.address2, 200) ?? undefined },
    new Date().toISOString(),
  );
  const refreshed = await currentUser(request, env);
  return json({ user: refreshed ? publicUser(refreshed) : null });
}

/**
 * 로그인 전에 넣은 주문을 계정으로 가져옵니다.
 *
 * 연락처만으로 자동 연결하지 않는 이유는 accounts.ts 에 적어 두었습니다 —
 * 번호는 재사용되고 오타도 나서, 남의 주문이 붙을 수 있습니다.
 */
async function handleAccountClaim(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'NOT_LOGGED_IN' }, 401);
  if (!env.DB) return json({ error: 'ACCOUNTS_NOT_CONFIGURED' }, 503);

  let body: { orderId?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const orderId = text(body.orderId, 40);
  const phone = text(body.phone, 30);
  if (!orderId || !phone || !ORDER_ID_PATTERN.test(orderId)) {
    return json({ error: 'INVALID_REQUEST' }, 400);
  }

  const result = await claimOrder(env.DB, user.id, orderId, phone, new Date().toISOString());
  if (result === 'not_found') {
    // 이미 다른 계정에 붙은 주문도 여기로 옵니다. 구분해서 알려주면
    // "이 주문번호는 누군가의 계정에 있다" 를 알려주는 셈이 됩니다.
    return json({ error: 'ORDER_NOT_FOUND', message: '일치하는 주문을 찾을 수 없습니다.' }, 404);
  }
  return json({ ok: true, alreadyClaimed: result === 'already_claimed' });
}

// ── 관리 화면 ────────────────────────────────────────────────
// 아래 응답에는 연락처·배송지·요청사항이 그대로 들어갑니다.
// 모든 진입점이 verifyAdmin 을 먼저 통과하는지 확인하세요.

const ORDER_STATUSES: readonly OrderStatus[] = ['pending', 'paid', 'failed', 'cancelled'];

/** 한 화면에 뿌릴 최대 건수. 관리자라도 DB 를 통째로 끌어가게 두지 않습니다. */
const ADMIN_MAX_LIMIT = 100;

/**
 * 쿼리스트링의 숫자를 범위 안으로 가둡니다.
 *
 * 값이 아예 없는 경우를 먼저 걸러야 합니다. Number(null) 과 Number('') 은 둘 다
 * 0 이고 0 은 정수라, 이 검사를 뒤에 두면 "값 없음" 이 0 으로 통과해 버립니다.
 * 그러면 limit 기본값 20 이 한 번도 쓰이지 않고 최솟값 1 이 적용됩니다 —
 * 한 페이지에 한 건만 나오는데 왜인지 알 수 없는 상태가 됩니다.
 */
function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

async function handleAdminList(request: Request, env: Env, who: string): Promise<Response> {
  if (!env.DB) {
    return json({ error: 'ORDERS_NOT_CONFIGURED', message: 'D1 바인딩(DB)이 없습니다.' }, 503);
  }

  const params = new URL(request.url).searchParams;

  // 모르는 값이 오면 조용히 무시합니다. 필터가 안 걸리는 편이,
  // 관리자가 이유 없는 오류 화면을 보는 것보다 낫습니다.
  const rawStatus = params.get('status');
  const rawFulfillment = params.get('fulfillment');
  const search = (params.get('search') ?? '').trim().slice(0, 80);

  const result = await listOrders(env.DB, {
    status: ORDER_STATUSES.includes(rawStatus as OrderStatus)
      ? (rawStatus as OrderStatus)
      : undefined,
    fulfillment: FULFILLMENTS.includes(rawFulfillment as Fulfillment)
      ? (rawFulfillment as Fulfillment)
      : undefined,
    search: search || undefined,
    limit: clampInt(params.get('limit'), 20, 1, ADMIN_MAX_LIMIT),
    offset: clampInt(params.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER),
  });

  return json({
    orders: result.orders,
    total: result.total,
    counts: await orderCounts(env.DB),
    who,
  });
}

async function handleAdminPatch(request: Request, env: Env, orderId: string): Promise<Response> {
  if (!env.DB) {
    return json({ error: 'ORDERS_NOT_CONFIGURED', message: 'D1 바인딩(DB)이 없습니다.' }, 503);
  }
  if (!ORDER_ID_PATTERN.test(orderId)) {
    return json({ error: 'INVALID_ORDER_ID' }, 400);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const patch: Parameters<typeof updateFulfillment>[2] = {};

  if (body.fulfillment !== undefined) {
    if (!FULFILLMENTS.includes(body.fulfillment as Fulfillment)) {
      return json(
        { error: 'INVALID_FULFILLMENT', message: '알 수 없는 배송 상태입니다.' },
        400,
      );
    }
    patch.fulfillment = body.fulfillment as Fulfillment;
  }

  // null 은 "지우기" 라 undefined 와 구분해서 받습니다.
  // 빈 문자열도 지우기로 봅니다 — 폼에서 지운 칸이 그렇게 넘어옵니다.
  for (const key of ['carrier', 'trackingNumber', 'adminMemo'] as const) {
    if (body[key] === undefined) continue;
    if (body[key] === null) {
      patch[key] = null;
      continue;
    }
    const value = text(body[key], key === 'adminMemo' ? 1000 : 60);
    if (value === null) {
      return json(
        { error: 'INVALID_FIELD', message: `${key} 값이 비어 있거나 너무 깁니다.` },
        400,
      );
    }
    patch[key] = value;
  }

  if (Object.keys(patch).length === 0) {
    return json({ error: 'NOTHING_TO_UPDATE', message: '바꿀 내용이 없습니다.' }, 400);
  }

  const current = await getOrder(env.DB, orderId);
  if (!current) {
    return json({ error: 'ORDER_NOT_FOUND', message: '주문을 찾을 수 없습니다.' }, 404);
  }

  // 송장번호를 넣으면서 상태는 그대로 두는 실수를 막습니다.
  if (patch.trackingNumber && patch.fulfillment === undefined) {
    if (current.fulfillment !== 'shipped' && current.fulfillment !== 'delivered') {
      patch.fulfillment = 'shipped';
    }
  }

  /**
   * 결제되지 않은 주문은 발송할 수 없습니다.
   *
   * 관리 화면 목록에는 결제 대기·실패 주문도 함께 나옵니다(그래야 무슨 일이
   * 있었는지 보입니다). 그 상태에서 송장번호를 넣으면 **돈을 받지 않은 주문의
   * 물건이 나갑니다.** 바쁠 때 한 줄 잘못 눌러 생기는 사고라, 화면 경고만으로는
   * 부족하고 서버가 막아야 합니다.
   *
   * '미발송' 으로 되돌리는 것은 결제 상태와 무관하게 허용합니다 —
   * 잘못 누른 것을 되돌리는 길까지 막으면 안 됩니다.
   */
  if (patch.fulfillment && patch.fulfillment !== 'unfulfilled' && current.status !== 'paid') {
    return json(
      {
        error: 'ORDER_NOT_PAID',
        message: '결제가 완료되지 않은 주문은 발송 처리할 수 없습니다.',
        status: current.status,
      },
      409,
    );
  }

  const changed = await updateFulfillment(env.DB, orderId, patch, new Date().toISOString());
  if (!changed) {
    return json({ error: 'ORDER_NOT_FOUND', message: '주문을 찾을 수 없습니다.' }, 404);
  }

  const order = await getOrder(env.DB, orderId);
  return json({ order });
}

/**
 * 관리 화면 페이지 자체도 Worker 를 거치게 해서 잠급니다.
 *
 * 이 페이지에 주문 데이터가 박혀 있지는 않지만(전부 API 로 가져옵니다),
 * 인증이 설정되지 않은 채 화면만 열려 있으면 관리 화면이 있다는 사실과
 * 그 구조가 그대로 드러납니다. 문은 하나로 잠급니다.
 */
async function handleAdminPage(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAdmin(request, env);
  if (!auth.ok) {
    // 평문으로 돌려주면 브라우저가 lang 도 title 도 없는 빈 문서로 감쌉니다.
    // 화면을 못 보는 사람에게는 "제목 없음" 만 읽히므로 최소한의 문서를 만듭니다.
    const escaped = auth.message.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return new Response(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>접근 권한 없음 — AVORA 주문 관리</title></head>` +
        `<body><main><h1>접근 권한이 없습니다</h1><p>${escaped}</p></main></body></html>`,
      {
        status: auth.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          // 검색엔진이 잠긴 문 앞에서 서성이지 않게 합니다.
          'X-Robots-Tag': 'noindex, nofollow',
        },
      },
    );
  }
  const page = await env.ASSETS.fetch(request);
  // 공용 PC 의 뒤로가기로 화면이 되살아나지 않게 합니다.
  const headers = new Headers(page.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(page.body, { status: page.status, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // 0 — 정식 호스트가 아니면(www 등) 여기서 301 로 보냅니다.
    //     규칙과 이유는 worker/canonical-host.ts 에 있습니다.
    const canonical = canonicalHostRedirect(request);
    if (canonical) return canonical;

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
      return handlePaymentConfirm(request, env, ctx);
    }

    // 후기
    if (pathname === '/api/reviews' && request.method === 'GET') {
      return handleReviewList(request, env);
    }
    if (pathname === '/api/reviews' && request.method === 'POST') {
      return handleReviewCreate(request, env);
    }

    // 문의 — 공개 게시판이 아닙니다. 조회는 본인 확인을 지납니다.
    if (pathname === '/api/inquiries' && request.method === 'POST') {
      return handleInquiryCreate(request, env, ctx);
    }
    if (pathname === '/api/inquiries' && request.method === 'GET') {
      return handleInquiryList(request, env);
    }
    if (pathname === '/api/inquiries/lookup' && request.method === 'POST') {
      return handleInquiryLookup(request, env);
    }

    // 로그인
    if (pathname === '/api/auth/login' && request.method === 'GET') {
      return handleLogin(request, env);
    }
    // 제공자 이름이 경로에 있습니다 — 제공자마다 Redirect URI 를 따로
    // 등록해야 하고, 등록된 주소와 한 글자라도 다르면 코드가 오지 않습니다.
    const callback = pathname.match(/^\/api\/auth\/callback(?:\/([a-z0-9-]+))?$/);
    if (callback && request.method === 'GET') {
      return handleCallback(request, env, callback[1] ?? null);
    }
    if (pathname === '/api/auth/link' && request.method === 'GET') {
      return handleLinkStart(request, env);
    }
    if (pathname === '/api/auth/providers' && request.method === 'GET') {
      return handleProviders(request, env);
    }

    /*
     * 카카오 계정 상태 변경 웹훅.
     *
     * 사용자가 우리 사이트 밖에서(카카오 앱 목록·계정 탈퇴) 연결을 끊었을 때
     * 알림을 받습니다. 받지 못하면 탈퇴한 사람의 개인정보가 계속 남습니다.
     * 본문은 카카오가 서명한 JWT 이고, 서명·발급자·대상을 모두 확인합니다.
     */
    if (pathname === '/api/webhooks/kakao' && request.method === 'POST') {
      return handleKakaoWebhook(request, env);
    }
    if (pathname === '/api/auth/logout' && request.method === 'POST') {
      return handleLogout(request, env);
    }

    // 계정
    if (pathname === '/api/account/me' && request.method === 'GET') {
      return handleAccountMe(request, env);
    }
    if (pathname === '/api/account/orders' && request.method === 'GET') {
      return handleAccountOrders(request, env);
    }
    if (pathname === '/api/account/address' && request.method === 'PUT') {
      return handleAccountAddress(request, env);
    }
    if (pathname === '/api/account/claim' && request.method === 'POST') {
      return handleAccountClaim(request, env);
    }
    if (pathname === '/api/account/identities' && request.method === 'GET') {
      return handleIdentities(request, env);
    }
    if (pathname === '/api/account/identities/unlink' && request.method === 'POST') {
      return handleUnlink(request, env);
    }

    // 관리 API — 무엇을 하려는지 보기 전에 먼저 신원을 확인합니다.
    if (pathname.startsWith('/api/admin/')) {
      const auth = await verifyAdmin(request, env);
      if (!auth.ok) {
        return json({ error: auth.error, message: auth.message }, auth.status);
      }

      if (pathname === '/api/admin/orders' && request.method === 'GET') {
        return handleAdminList(request, env, auth.who);
      }
      const detail = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
      if (detail && request.method === 'PATCH') {
        return handleAdminPatch(request, env, decodeURIComponent(detail[1]));
      }

      if (pathname === '/api/admin/reviews' && request.method === 'GET') {
        return handleAdminReviewList(env, url, auth.who);
      }
      const reviewDetail = pathname.match(/^\/api\/admin\/reviews\/([^/]+)$/);
      if (reviewDetail && request.method === 'PATCH') {
        return handleAdminReviewPatch(request, env, decodeURIComponent(reviewDetail[1]));
      }

      if (pathname === '/api/admin/inquiries' && request.method === 'GET') {
        return handleAdminInquiryList(env, url, auth.who);
      }
      const inquiryDetail = pathname.match(/^\/api\/admin\/inquiries\/([^/]+)$/);
      if (inquiryDetail && request.method === 'PATCH') {
        return handleAdminInquiryAnswer(
          request,
          env,
          decodeURIComponent(inquiryDetail[1]),
          auth.who,
        );
      }

      return json({ error: 'NOT_FOUND' }, 404);
    }

    if (pathname.startsWith('/api/')) {
      return json({ error: 'NOT_FOUND' }, 404);
    }

    // 3 — 관리 화면 페이지
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return handleAdminPage(request, env);
    }

    /*
     * 4 — 리뷰 페이지는 정적 껍데기에 실제 후기를 채워 내보냅니다.
     *
     * 자바스크립트로만 채우면 답변엔진과 크롤러가 후기를 보지 못합니다.
     * 리뷰 페이지의 값어치는 대부분 거기서 나오므로 초기 HTML 에 넣습니다.
     * 후기가 0건이면 정적 페이지를 그대로 내보냅니다 — 그 화면이 이미
     * "아직 리뷰가 없습니다" 라고 말하고 있고, 그게 사실입니다.
     */
    const reviewsPage = pathname.match(/^\/([a-z]{2})\/reviews\/?$/);
    if (reviewsPage && env.DB && (LOCALES as readonly string[]).includes(reviewsPage[1])) {
      const page = await env.ASSETS.fetch(request);
      if (page.ok) {
        return renderReviewsPage(
          page,
          env.DB,
          new URL(`/${reviewsPage[1]}/product`, url).href,
        );
      }
      return page;
    }

    // 5 — 그 외에는 정적 에셋에 넘깁니다.
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
