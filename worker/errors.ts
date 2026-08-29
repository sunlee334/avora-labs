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
): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    const { pathname } = new URL(request.url);
    console.error('[worker] 처리 중 예외', pathname, err);

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
