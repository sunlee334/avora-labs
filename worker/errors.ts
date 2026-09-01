import { reportError, type SentryEnv } from './sentry';

/**
 * 처리 중 터진 예외를 손님이 읽을 수 있는 답으로 바꿉니다.
 *
 * 이전에는 어디서 무엇이 터지든 Cloudflare 의 기본 HTML 오류 화면이 나갔습니다.
 * 프런트는 전부 `res.json()` 으로 읽으므로 거기서 파싱이 다시 터지고, 손님은
 * "요청에 실패했습니다" 대신 아무 말도 없는 화면을 봅니다.
 *
 * 여기까지 오는 예외는 대부분 D1 입니다 — 마이그레이션이 안 돌았거나, 열이
 * 없거나, 잠깐 못 붙거나. 22개 핸들러가 전부 try/catch 없이 D1 을 부르므로,
 * 핸들러마다 감싸는 대신 문 하나에 두었습니다.
 */
export async function jsonOnError(
  request: Request,
  run: () => Promise<Response>,
  /*
   * 관측용입니다. 없으면 로그만 남기고 그대로 동작합니다 — 이 함수를 직접
   * 불러 검사하는 곳(tests/e2e/api-error-shape.spec.ts)이 워커 환경 없이
   * 돌아야 하기 때문입니다.
   */
  observe?: { env: SentryEnv; ctx: { waitUntil(p: Promise<unknown>): void } },
): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    const { pathname } = new URL(request.url);
    console.error('[worker] 처리 중 예외', pathname, err);

    /*
     * 로그는 남지만 아무도 보지 않습니다. observability 로그는 찾아 들어가야
     * 보이고, 장애는 손님이 알려주기 전까지 모릅니다. 여기가 워커의 모든
     * 예외가 지나는 한 자리이므로 알림도 여기서 겁니다.
     */
    if (observe) {
      reportError(observe.env, observe.ctx, err, request, {
        tags: { area: pathname.startsWith('/api/') ? 'api' : 'page' },
      });
    }

    /*
     * 페이지 요청은 다시 던집니다. 그쪽은 Cloudflare 의 오류 화면이 지금까지의
     * 동작이고, HTML 을 기다리는 브라우저에 JSON 을 주면 그게 더 이상합니다.
     */
    if (!pathname.startsWith('/api/')) throw err;

    /*
     * 무엇이 터졌는지는 말하지 않습니다 — D1 오류 문구에는 테이블·열 이름이
     * 그대로 들어 있습니다. 그건 로그로 갑니다(observability 켜져 있습니다).
     */
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: '잠시 후 다시 시도해 주세요.' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
