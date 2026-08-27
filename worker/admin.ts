/**
 * 관리 화면 인증.
 *
 * 관리 API 는 주문의 연락처·배송지·메모를 그대로 돌려줍니다. 로그인 화면을
 * 직접 만들면 비밀번호 저장·세션·재설정까지 우리가 책임져야 하는데, 그건
 * 자사몰 하나 때문에 지기에는 무거운 짐입니다.
 *
 * 그래서 Cloudflare Access 를 앞에 세웁니다. Access 가 먼저 사람을 확인하고,
 * 통과한 요청에만 서명된 토큰(`Cf-Access-Jwt-Assertion`)을 붙여 보냅니다.
 * 우리는 그 서명을 검증하기만 하면 됩니다.
 *
 * ── 닫힌 것이 기본값 ──────────────────────────────────────────
 * Access 설정이 없으면 "인증 없이 통과"가 아니라 **거절**합니다.
 * 설정을 깜빡한 채 배포하면 주문 정보가 인터넷에 열려 버리는데,
 * 그건 조용히 일어나서는 안 되는 일입니다.
 *
 * 공식 문서 권고에 따라 쿠키(`CF_Authorization`)가 아니라 헤더를 봅니다.
 * 쿠키는 오리진까지 전달된다는 보장이 없습니다.
 */
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';

export interface AdminEnv {
  /** 예: https://myteam.cloudflareaccess.com — 끝에 슬래시 없이 */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access 애플리케이션의 Audience(AUD) 태그 */
  ACCESS_POLICY_AUD?: string;
  /**
   * 관리 화면에 들어올 수 있는 사람. 쉼표로 구분한 이메일 목록입니다.
   *
   * ── 왜 서명 검증만으로는 부족한가 ───────────────────────────
   * 서명이 확인해 주는 것은 "Cloudflare Access 가 이 사람을 통과시켰다" 까지
   * 입니다. **누구를** 통과시킬지는 대시보드의 정책이 정합니다. 정책이
   * 넓게(예: 아무 이메일이나, 또는 gmail.com 전체) 잡혀 있으면 서명은
   * 멀쩡한 채로 남이 들어옵니다.
   *
   * 그 정책은 이 저장소 밖에 있어서 코드 리뷰에도, 테스트에도 잡히지
   * 않습니다. 누가 대시보드에서 한 줄 바꾸면 주문의 연락처·배송지가
   * 열리는데, 그 변경은 어디에도 기록으로 남지 않습니다.
   *
   * 그래서 자물쇠를 하나 더 겁니다. 이 목록은 저장소 안에 있으므로
   * 바뀌면 diff 에 남습니다.
   */
  ADMIN_ALLOWED_EMAILS?: string;
  /**
   * 로컬·E2E 전용 우회 열쇠.
   *
   * Access 는 Cloudflare 가 요청 앞단에서 붙이는 것이라 `wrangler dev` 로는
   * 재현할 수 없습니다. 테스트가 관리 API 를 두드리려면 다른 문이 필요합니다.
   *
   * 위험한 물건이라 두 가지로 묶어 둡니다.
   *   1. Access 가 설정돼 있으면 이 값은 아예 읽지 않습니다(아래 순서 참고).
   *   2. 배포 전 점검이 wrangler.jsonc 에서 이 이름을 찾으면 배포를 멈춥니다.
   */
  ADMIN_DEV_TOKEN?: string;
}

export type AccessResult =
  | { ok: true; who: string }
  | { ok: false; status: number; error: string; message: string };

/**
 * 팀 도메인별 공개키 집합.
 *
 * `createRemoteJWKSet` 이 돌려주는 함수가 키를 자기 안에 캐시합니다.
 * 요청마다 새로 만들면 그 캐시가 매번 버려져 인증마다 외부 요청이 한 번씩
 * 더 붙습니다. isolate 가 사는 동안 재사용합니다.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/** 길이가 같은 문자열끼리 시간차 없이 비교합니다. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 토큰이 누구를 가리키는지 — 화면 오른쪽 위에 표시하고 감사에도 씁니다. */
function whoFrom(payload: JWTPayload): string {
  const email = payload.email;
  if (typeof email === 'string' && email) return email;
  // 서비스 토큰에는 email 이 없고 common_name 이 있습니다.
  const commonName = payload.common_name;
  if (typeof commonName === 'string' && commonName) return commonName;
  return '인증된 사용자';
}

/**
 * 허용 목록을 읽습니다. 빈 칸과 대소문자를 정리합니다.
 *
 * 이메일의 도메인 부분은 원래 대소문자를 가리지 않고, 제공자마다 표기가
 * 다르게 올 수 있습니다. 양쪽 다 소문자로 맞춰 비교합니다.
 */
export function parseAllowlist(env: AdminEnv): string[] {
  const raw = env.ADMIN_ALLOWED_EMAILS;
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * 이 사람이 허용 목록에 있는가.
 *
 * 목록이 비어 있으면 **아무도 통과하지 못합니다.** "설정하지 않았으니 전부
 * 허용" 은 설정을 깜빡한 순간 조용히 문이 열리는 쪽이라, 이 파일이 지키는
 * 원칙과 반대입니다. 잠기는 쪽이 기본값입니다 — 그건 눈에 띄고, 고치기도
 * 쉽습니다.
 *
 * 서비스 토큰(email 없이 common_name 만 있는 토큰)도 통과하지 못합니다.
 * 지금 쓰지 않고, 쓰게 되면 그때 목록과 별개로 명시해야 합니다.
 */
export function isAllowedAdmin(email: unknown, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return false;
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return allowlist.includes(normalized);
}

/**
 * 이 요청이 관리자의 것인지 확인합니다.
 *
 * 순서가 중요합니다. Access 가 설정돼 있으면 그것만이 유일한 문이고,
 * 개발용 토큰은 쳐다보지도 않습니다. 운영 환경에 개발용 토큰이 실수로
 * 섞여 들어와도 통로가 열리지 않게 하기 위해서입니다.
 */
export async function verifyAdmin(request: Request, env: AdminEnv): Promise<AccessResult> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN?.replace(/\/+$/, '');
  const audience = env.ACCESS_POLICY_AUD;

  if (teamDomain && audience) {
    const token = request.headers.get('cf-access-jwt-assertion');
    if (!token) {
      return {
        ok: false,
        status: 401,
        error: 'ACCESS_TOKEN_MISSING',
        message: 'Cloudflare Access 로그인이 필요합니다.',
      };
    }

    try {
      const { payload } = await jwtVerify(token, jwksFor(teamDomain), {
        issuer: teamDomain,
        audience,
      });

      /*
       * 서명은 맞습니다. 이제 **누구인지** 봅니다.
       *
       * 여기까지 온 사람은 Access 정책을 통과한 사람입니다. 그 정책이
       * 우리가 의도한 것보다 넓을 수 있으므로 한 번 더 거릅니다.
       */
      const allowlist = parseAllowlist(env);
      if (!isAllowedAdmin(payload.email, allowlist)) {
        /*
         * 남깁니다. 이 로그가 없으면 "왜 못 들어가지" 와 "누가 두드렸지" 를
         * 둘 다 알 수 없습니다. 서명이 확인된 뒤이므로 이 이메일은 실제로
         * Access 가 인증한 값입니다 — 지어낸 값이 아닙니다.
         */
        console.warn('관리 화면 접근 거절 — 허용 목록에 없습니다', {
          who: whoFrom(payload),
          allowlistSize: allowlist.length,
        });
        return {
          ok: false,
          status: 403,
          error: 'ACCESS_NOT_ALLOWED',
          message: allowlist.length
            ? '이 계정은 관리 화면에 접근할 수 없습니다.'
            : '관리자 목록이 비어 있어 잠겨 있습니다. ADMIN_ALLOWED_EMAILS 를 설정하세요.',
        };
      }

      return { ok: true, who: whoFrom(payload) };
    } catch {
      // 만료·서명 불일치·다른 애플리케이션의 토큰이 모두 여기로 옵니다.
      // 무엇이 틀렸는지는 알려주지 않습니다.
      return {
        ok: false,
        status: 403,
        error: 'ACCESS_TOKEN_INVALID',
        message: '인증 정보가 유효하지 않습니다. 다시 로그인해 주세요.',
      };
    }
  }

  if (env.ADMIN_DEV_TOKEN) {
    const supplied = request.headers.get('x-admin-dev-token');
    if (supplied && timingSafeEqual(supplied, env.ADMIN_DEV_TOKEN)) {
      return { ok: true, who: '개발용 토큰' };
    }
    return {
      ok: false,
      status: 401,
      error: 'ACCESS_TOKEN_MISSING',
      message: '인증이 필요합니다.',
    };
  }

  return {
    ok: false,
    status: 403,
    error: 'ACCESS_NOT_CONFIGURED',
    message:
      '관리 화면 인증이 설정되지 않아 잠겨 있습니다. Cloudflare Access 애플리케이션을 만들고 ACCESS_TEAM_DOMAIN·ACCESS_POLICY_AUD 를 설정하세요.',
  };
}
