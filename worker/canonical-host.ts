/**
 * 정식 호스트로 모으기.
 *
 * 정식 주소는 하나입니다(`src/config/site.ts` 의 ORIGIN). www 가 같은 내용을
 * 그대로 서빙하면 검색엔진이 색인을 나눠 갖고, 사람들이 두 가지 주소를
 * 공유하게 됩니다.
 *
 * ── 왜 여기(Worker)인가 ─────────────────────────────────────
 * 원래는 Cloudflare Redirect Rule 이 할 일입니다. 그 규칙은 Worker 보다 먼저
 * 돌아 정적 파일까지 잡습니다. 그것을 쓸 수 없어 Worker 에서 처리하며, 그래서
 * `wrangler.jsonc` 의 `run_worker_first` 가 페이지 경로 전체를 포함합니다.
 *
 * ── 왜 별도 파일인가 ────────────────────────────────────────
 * `worker/index.ts` 는 D1·결제·인증 어댑터를 줄줄이 불러옵니다. 이 규칙 하나를
 * 확인하려고 그 전부를 세울 수는 없습니다. 의존이 없는 함수로 떼어 두면
 * 테스트가 이것만 직접 부를 수 있습니다.
 */

/**
 * 정식 호스트가 아니면 301 응답을, 맞으면 null 을 돌려줍니다.
 *
 * 301(영구)입니다. 302 로 두면 검색엔진이 www 를 계속 정본 후보로 봅니다.
 * 경로와 쿼리는 그대로 옮깁니다 — 공유된 링크가 홈으로 떨어지면 안 됩니다.
 */
export function canonicalHostRedirect(request: Request): Response | null {
  const url = new URL(request.url);

  // 요청한 호스트는 Host 헤더가 정본입니다. `request.url` 의 호스트는 앞단
  // 프록시에 따라 달라질 수 있습니다 — 실제로 로컬 `wrangler dev` 에서는
  // 127.0.0.1 이 들어옵니다.
  const host = (request.headers.get('host') ?? url.hostname).split(':')[0];
  if (!host.startsWith('www.')) return null;

  const canonical = new URL(url);
  canonical.protocol = 'https:';
  canonical.hostname = host.slice(4);
  canonical.port = '';
  return Response.redirect(canonical.href, 301);
}
