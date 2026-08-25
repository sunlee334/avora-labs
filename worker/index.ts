/**
 * AVORA — Cloudflare Worker
 *
 * 정적 페이지는 이 코드를 거치지 않습니다. Cloudflare 는 요청 URL 이 정적 에셋과
 * 맞으면 Worker 를 호출하지 않고 바로 내보냅니다(공식 문서: "served directly without
 * invoking Worker code"). 그래서 이 Worker 가 실제로 도는 경우는 셋뿐입니다.
 *
 *   1. `/`            — 언어를 판별해 /{lang}/ 으로 302
 *   2. `/api/*`       — wrangler.jsonc 의 run_worker_first 로 강제 진입
 *   3. 매칭 실패      — 404 페이지를 언어에 맞춰 돌려주기
 */
import { tossPayments } from './payments/tosspayments';
import type { PaymentAdapter } from './payments/types';

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
};

interface Env {
  ASSETS: Fetcher;
  /** 어떤 PG 어댑터를 쓸지. 미설정이면 결제 엔드포인트가 비활성입니다. */
  PAYMENT_PROVIDER?: string;
  TOSS_SECRET_KEY?: string;
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
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function handlePaymentConfirm(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const providerName = env.PAYMENT_PROVIDER;
  const adapter = providerName ? ADAPTERS[providerName] : undefined;

  // 1차 오픈에서는 자사 결제를 열지 않습니다. 설정이 없으면 조용히 실패시키지 않고
  // 왜 안 되는지 분명히 알려줍니다 — 나중에 켤 때 원인을 찾기 쉽게.
  if (!adapter) {
    return json(
      {
        error: 'PAYMENT_NOT_CONFIGURED',
        message:
          'PAYMENT_PROVIDER 가 설정되지 않았습니다. PG 계약과 도메인 확정 후 활성화하세요.',
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

  let body: { paymentKey?: string; orderId?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const { paymentKey, orderId, amount } = body;
  if (!paymentKey || !orderId || typeof amount !== 'number' || amount <= 0) {
    return json({ error: 'INVALID_REQUEST', message: 'paymentKey · orderId · amount 가 필요합니다.' }, 400);
  }

  const result = await adapter.confirm({ paymentKey, orderId, amount }, env as unknown as Record<string, unknown>);
  return json(result, result.ok ? 200 : 502);
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
