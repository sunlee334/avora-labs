/**
 * 워커에서 터진 예외를 Sentry 로 보냅니다.
 *
 * ── 왜 SDK 를 쓰지 않는가 ───────────────────────────────────
 * `@sentry/cloudflare` 는 잘 만들어져 있지만, 여기서 필요한 것은 "예외 한 건을
 * 봉투에 담아 POST" 하나뿐입니다. 그 하나를 위해 워커 번들에 의존성을 더하지
 * 않습니다 — 이 워커는 모든 요청의 앞단이라 번들이 커지면 콜드 스타트가
 * 그만큼 늘어납니다.
 *
 * 브라우저 쪽은 다릅니다. 거기는 스택 되감기·소스맵·브레드크럼처럼 직접
 * 만들면 안 되는 것들이 필요해서 공식 SDK(`@sentry/astro`)를 씁니다.
 *
 * ── 보내지 못해도 요청은 성공해야 합니다 ────────────────────
 * 관측 장치가 서비스를 무너뜨리면 안 됩니다. 전송은 `waitUntil` 로 응답 뒤에
 * 붙이고, 실패하면 조용히 삼킵니다. Sentry 가 죽었다고 손님의 주문이 실패할
 * 이유는 없습니다.
 */

/** DSN 을 Sentry 가 받는 주소와 키로 나눕니다. */
function parseDsn(dsn: string): { url: string; key: string } | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    if (!u.username || !projectId) return null;
    return {
      url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
      key: u.username,
    };
  } catch {
    return null;
  }
}

/**
 * 요청에서 남길 것.
 *
 * 쿼리와 헤더는 통째로 버립니다. 주소에 이메일이나 토큰이 실려 오는 경로가
 * 있고(해지 링크의 `?t=`), 헤더에는 쿠키가 들어 있습니다. 무엇이 안전한지
 * 하나씩 고르는 대신 **경로만** 남깁니다 — 어디서 터졌는지는 그것으로 압니다.
 */
function safeRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return {
    url: pathname,
    method: request.method,
    headers: {
      // 지역과 브라우저는 재현에 필요합니다. 개인을 짚지는 못합니다.
      'user-agent': request.headers.get('user-agent') ?? '',
      'accept-language': request.headers.get('accept-language') ?? '',
    },
  };
}

type Level = 'error' | 'warning';

/** 여기서만 이벤트를 보냅니다. `src/config/site.ts` 의 ORIGIN 과 같아야 합니다. */
export const PRODUCTION_HOST = 'avoralabs.co';

export interface SentryEnv {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  CF_VERSION_METADATA?: { id?: string };
}

/**
 * 예외 한 건.
 *
 * `tags` 로 갈라 두면 Sentry 에서 종류별로 알림을 따로 걸 수 있습니다. 지시서
 * H1-2 가 "폼 제출 실패는 반드시 별도 이벤트로" 라고 한 것이 이 자리입니다 —
 * 일반 예외에 묻히면 알림을 걸어도 소용이 없습니다.
 */
export function reportError(
  env: SentryEnv,
  ctx: { waitUntil(p: Promise<unknown>): void } | undefined,
  err: unknown,
  request?: Request,
  extra?: { tags?: Record<string, string>; level?: Level },
): void {
  const target = parseDsn(env.SENTRY_DSN ?? '');
  if (!target) return;

  /*
   * 운영 호스트에서만 보냅니다.
   *
   * `wrangler dev` 는 운영과 같은 설정 파일을 읽습니다. 그래서 DSN 만 보고
   * 판단하면 **로컬 개발과 E2E 검사에서도 이벤트가 나갑니다.** 검사는 806 건이고
   * 그중 일부가 일부러 500 을 냅니다 — 무료 한도가 하루도 못 가고, 정작 진짜
   * 장애가 났을 때 이벤트가 안 들어오는 상태가 됩니다.
   *
   * 환경변수로 가르지 않는 이유: 그러면 "운영에 넣는 것을 잊었다" 와 "일부러
   * 껐다" 가 구분되지 않습니다. 호스트는 요청 자체가 들고 오므로 잊을 수가
   * 없습니다.
   */
  if (request && new URL(request.url).hostname !== PRODUCTION_HOST) return;

  const now = new Date().toISOString();
  const error = err instanceof Error ? err : new Error(String(err));

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: extra?.level ?? 'error',
    environment: env.SENTRY_ENVIRONMENT ?? 'production',
    release: env.CF_VERSION_METADATA?.id,
    server_name: 'cloudflare-worker',
    tags: { runtime: 'cloudflare-worker', ...extra?.tags },
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          /*
           * 스택은 문자열 그대로 둡니다. Sentry 는 구조화된 프레임을 더 잘
           * 다루지만, 그러려면 스택 문자열을 되감아야 하고 그건 런타임마다
           * 형식이 다릅니다. 직접 만들면 틀린 줄 번호를 자신 있게 보여 주는
           * 쪽이 되므로, 원문을 남기고 사람이 읽게 합니다.
           */
          stacktrace: undefined,
          mechanism: { type: 'generic', handled: true },
        },
      ],
    },
    extra: { stack: error.stack ?? '(스택 없음)' },
    ...(request ? { request: safeRequest(request) } : {}),
  };

  const body =
    JSON.stringify({ event_id: event.event_id, sent_at: now, dsn: env.SENTRY_DSN }) +
    '\n' +
    JSON.stringify({ type: 'event' }) +
    '\n' +
    JSON.stringify(event) +
    '\n';

  const send = fetch(target.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': [
        'Sentry sentry_version=7',
        'sentry_client=avora-worker/1.0',
        `sentry_key=${target.key}`,
      ].join(', '),
    },
    body,
  }).then(
    () => undefined,
    () => undefined, // 전송 실패는 삼킵니다 — 위 주석 참조.
  );

  if (ctx) ctx.waitUntil(send);
}
