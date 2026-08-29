/**
 * 공개 쓰기 엔드포인트의 문턱.
 *
 * 로그인 없이 우리 DB 에 행을 만들 수 있는 자리가 넷입니다 — 주문·후기·문의·
 * 출시 알림. 넷 다 손님에게 열려 있어야 하는 문이라 닫을 수는 없고, 대신
 * "사람 한 명이 낼 수 있는 속도" 를 넘으면 막습니다.
 *
 * 가장 아픈 쪽은 출시 알림입니다. 그 명단의 값어치는 통째로 "적힌 주소가
 * 진짜 사람인가" 에 달려 있고, 그 숫자가 펀딩 초반 달성률을 좌우합니다.
 * 아무 방어가 없을 때 로컬에서 초당 245건이 들어갔습니다.
 */

export interface RateLimitEnv {
  WRITE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /**
   * 테스트 서버 전용 우회 열쇠.
   *
   * 테스트는 한 아이피(127.0.0.1)에서 수백 건을 씁니다 — 문턱을 그대로 두면
   * 스위트가 자기 자신에 걸립니다. 이 값을 헤더로 들고 온 요청만 건너뜁니다.
   *
   * **끄는 열쇠이지 켜는 열쇠가 아닙니다.** 한 번 반대로(켜는 열쇠로) 만들었다가
   * 되돌렸습니다. 그쪽은 변수 하나가 운영에 잘못 들어가면 네 엔드포인트의 문턱이
   * 통째로 조용히 꺼집니다 — 열리는 쪽으로 실패합니다. 이쪽은 변수가 없으면
   * 우회 자체가 성립하지 않아 닫히는 쪽으로 실패합니다. 그 대가로 테스트가
   * 헤더를 빠뜨리면 애먼 곳이 429 로 죽는데, 그건 시끄럽게 드러납니다.
   * (실제로 한 번 겪었습니다 — `test.use({ extraHTTPHeaders })` 가 최상위 설정을
   * 병합하지 않고 덮습니다. 지금은 rate-limit.spec.ts 가 소스를 훑어 막습니다.)
   *
   * 운영에서는 절대 설정하지 않으며, 배포 전 점검이 wrangler.jsonc 에서 이
   * 이름을 발견하면 배포를 멈춥니다. ADMIN_DEV_TOKEN 과 같은 방식입니다.
   */
  RATE_LIMIT_BYPASS?: string;
}

/**
 * 손님 한 명을 가리키는 값.
 *
 * CF-Connecting-IP 는 Cloudflare 가 가장자리에서 붙입니다. wrangler dev 로컬에는
 * 없어서 그때는 전부 한 칸('unknown')에 모입니다 — 로컬에서 이걸로 신원을
 * 나눌 생각이 없으므로 그대로 둡니다.
 */
function clientKey(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

/**
 * 이 요청이 문턱을 넘었는가.
 *
 * 바인딩이 없으면(예전 wrangler, 바인딩을 뺀 환경) 통과시킵니다. 제한이 없는
 * 상태는 지금까지의 상태와 같고, 여기서 요청을 떨어뜨리면 없던 장애가 생깁니다.
 */
export async function overWriteLimit(
  request: Request,
  env: RateLimitEnv,
  bucket: string,
): Promise<boolean> {
  if (!env.WRITE_LIMITER) return false;

  if (env.RATE_LIMIT_BYPASS && request.headers.get('x-rate-limit-bypass') === env.RATE_LIMIT_BYPASS) {
    return false;
  }

  const { success } = await env.WRITE_LIMITER.limit({ key: `${bucket}:${clientKey(request)}` });
  return !success;
}

/**
 * 문턱에 걸렸을 때 돌려줄 답.
 *
 * 무엇이 막혔는지는 말하되 왜 막혔는지의 숫자는 말하지 않습니다 — 문턱을
 * 알려주면 그 바로 아래로 맞춰 오면 그만입니다.
 */
export function tooManyRequests(): Response {
  return new Response(
    JSON.stringify({
      error: 'RATE_LIMITED',
      message: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '60',
      },
    },
  );
}
