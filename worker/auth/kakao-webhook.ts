/**
 * 카카오 계정 상태 변경 웹훅.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────
 * 사용자가 **우리 사이트 밖에서** 연결을 끊을 수 있습니다 — 카카오 앱 목록에서
 * 우리 앱을 지우거나, 카카오계정을 탈퇴하는 경우입니다. 그때 알림을 받지
 * 못하면 **탈퇴한 사람의 이메일·이름·배송지가 우리 DB 에 계속 남습니다.**
 * 개인정보처리방침에 적은 것과 어긋나고, 파기 의무를 지키지 못하게 됩니다.
 *
 * ── 아무나 부를 수 있으면 안 됩니다 ─────────────────────────
 * 이 엔드포인트는 **계정을 지웁니다.** 인증이 없으면 누구나 남의 사용자 id 를
 * 넣어 계정을 지울 수 있습니다.
 *
 * 다행히 카카오는 OpenID 재단의 SSF(Shared Signals and Events) 규격을 씁니다.
 * 본문은 카카오가 서명한 JWT(SET, Security Event Token)이고, 공개키는
 * `https://kauth.kakao.com/.well-known/jwks.json` 에 있습니다. 관리 화면의
 * Cloudflare Access JWT 를 검증하는 것과 같은 방식입니다(worker/admin.ts).
 *
 * 서명·발급자·대상을 모두 확인합니다.
 *   서명    카카오만 만들 수 있습니다
 *   iss     https://kauth.kakao.com
 *   aud     우리 앱 키 — 다른 앱의 이벤트가 우리에게 오는 것을 막습니다.
 *           카카오 사용자 id 는 앱마다 다르게 발급되므로, aud 를 보지 않으면
 *           다른 앱의 id 가 우리 id 와 우연히 겹칠 때 엉뚱한 계정이 지워집니다.
 *
 * ── 3초 안에 답해야 합니다 ──────────────────────────────────
 * 공식 문서 기준입니다. 성공은 202, 실패는 400 입니다.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { removeIdentity } from '../accounts';

const ISSUER = 'https://kauth.kakao.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;

/** SSF 이벤트 타입. 우리가 실제로 처리하는 것만 적었습니다. */
const USER_UNLINKED = 'https://schemas.openid.net/secevent/oauth/event-type/user-unlinked';

/**
 * 공개키 집합.
 *
 * `createRemoteJWKSet` 이 돌려주는 함수가 키를 자기 안에 캐시합니다.
 * 요청마다 새로 만들면 그 캐시가 매번 버려져 웹훅마다 외부 요청이 한 번씩
 * 더 붙고, 3초 제한이 그만큼 빠듯해집니다.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function keys() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(JWKS_URL));
  return jwks;
}

export interface KakaoWebhookEnv {
  DB?: D1Database;
  KAKAO_REST_API_KEY?: string;
  /**
   * 테스트 전용 통로를 여는 열쇠. mock 로그인 제공자와 **같은 값**을 씁니다.
   *
   * 이 웹훅은 계정을 지웁니다. 그런데 그 동작을 시험하려면 카카오가 서명한
   * JWT 가 있어야 하고, 그건 테스트에서 만들 수 없습니다. 삭제 경로를
   * 검증하지 못한 채 두는 것이 더 위험하다고 판단해, mock 제공자와 같은
   * 조건에서만 열리는 통로를 둡니다.
   *
   * 🚨 배포 전 점검이 wrangler.jsonc 에서 이 이름에 mock 이 들어 있으면
   *    배포를 멈춥니다(.github/workflows/deploy.yml).
   */
  AUTH_PROVIDER?: string;
}

/** AUTH_PROVIDER 에 mock 이 적혀 있는가. 운영에는 이 값이 없습니다. */
function testGateOpen(env: KakaoWebhookEnv): boolean {
  const raw = env.AUTH_PROVIDER;
  if (typeof raw !== 'string') return false;
  return raw.split(',').map((part) => part.trim()).includes('mock');
}

/** 이벤트가 담긴 클레임. events 의 **키**가 이벤트 타입입니다. */
interface SetPayload extends JWTPayload {
  events?: Record<string, { subject?: { sub?: string } }>;
  /**
   * 시험 통로에서만 읽습니다. 서명된 요청은 언제나 'kakao' 입니다.
   *
   * 이게 없으면 삭제 경로를 아예 시험할 수 없습니다 — 테스트가 만들 수 있는
   * 로그인 수단은 mock 뿐인데 웹훅은 kakao 만 처리하므로, 지워질 것이 하나도
   * 없는 상태만 확인하게 됩니다.
   */
  $testProvider?: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function handleKakaoWebhook(
  request: Request,
  env: KakaoWebhookEnv,
): Promise<Response> {
  if (!env.DB) {
    return json({ err: 'not_configured', description: '웹훅이 설정되지 않았습니다.' }, 400);
  }

  // 본문은 JSON 이 아니라 JWT 문자열 그대로입니다
  // (Content-Type: application/secevent+jwt).
  const token = (await request.text()).trim();
  if (!token) {
    return json({ err: 'invalid_request', description: '본문이 비었습니다.' }, 400);
  }

  let payload: SetPayload;

  /*
   * 테스트 통로 — 서명 없는 JSON 을 받습니다.
   *
   * `test.` 로 시작할 때만, 그리고 AUTH_PROVIDER 에 mock 이 있을 때만
   * 열립니다. 운영에는 그 값이 없으므로 이 분기는 존재하지 않는 것과 같고,
   * 열쇠가 새더라도 접두어가 없는 실제 요청은 그대로 서명 검증을 지납니다.
   */
  if (token.startsWith('test.') && testGateOpen(env)) {
    try {
      payload = JSON.parse(token.slice('test.'.length)) as SetPayload;
    } catch {
      return json({ err: 'invalid_request', description: '본문을 읽지 못했습니다.' }, 400);
    }
    // 시험 통로에서만 제공자를 지정할 수 있습니다.
    return applyEvents(payload, env, payload.$testProvider ?? 'kakao');
  }

  /*
   * 앱 키가 없으면 서명을 검증할 수 없습니다.
   *
   * 키 없이도 서명과 발급자는 확인할 수 있지만, 그러면 **aud 를 못 봅니다.**
   * 카카오 사용자 id 는 앱마다 따로 발급되므로, aud 를 보지 않으면 다른 앱의
   * id 가 우리 id 와 겹칠 때 엉뚱한 계정이 지워집니다. 검증을 반쯤 하느니
   * 거절합니다.
   */
  if (!env.KAKAO_REST_API_KEY) {
    return json({ err: 'not_configured', description: '웹훅이 설정되지 않았습니다.' }, 400);
  }

  try {
    const verified = await jwtVerify(token, keys(), {
      issuer: ISSUER,
      audience: env.KAKAO_REST_API_KEY,
    });
    payload = verified.payload as SetPayload;
  } catch {
    // 서명 불일치·만료·다른 앱의 토큰이 모두 여기로 옵니다.
    // 무엇이 틀렸는지는 알려주지 않습니다.
    console.error('카카오 웹훅 검증 실패');
    return json({ err: 'invalid_token', description: '검증에 실패했습니다.' }, 400);
  }

  // 서명된 요청은 언제나 카카오입니다 — 본문의 값을 믿지 않습니다.
  return applyEvents(payload, env, 'kakao');
}

/** 검증을 마친 이벤트를 실제로 처리합니다. */
async function applyEvents(
  payload: SetPayload,
  env: KakaoWebhookEnv,
  provider: string,
): Promise<Response> {
  const events = payload.events ?? {};

  for (const [type, detail] of Object.entries(events)) {
    if (type !== USER_UNLINKED) {
      // 처리하지 않는 이벤트도 202 로 받습니다. 400 으로 답하면 카카오가
      // 실패로 보고 계속 다시 보냅니다.
      console.log('카카오 웹훅 — 처리하지 않는 이벤트', { type });
      continue;
    }

    // 사용자 식별자는 이벤트 안의 subject.sub 이고, 없으면 최상위 sub 입니다.
    const providerUserId = detail?.subject?.sub ?? (typeof payload.sub === 'string' ? payload.sub : null);
    if (!providerUserId) {
      console.error('카카오 웹훅 — 사용자 식별자가 없습니다', { type });
      continue;
    }

    const result = await removeIdentity(env.DB!, provider, providerUserId);
    console.log('연결 해제 처리', {
      provider,
      found: result.found,
      userRemoved: result.userRemoved,
      ordersDetached: result.ordersDetached,
    });
  }

  // 처리할 것이 없어도 202 입니다. 같은 이벤트가 다시 와도(카카오는 재전송할
  // 수 있습니다) 결과가 같아야 합니다.
  return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}

export { USER_UNLINKED };
