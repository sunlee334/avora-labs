/**
 * 테스트 전용 로그인 제공자.
 *
 * 카카오·네이버는 도메인과 사업자 정보가 있어야 붙일 수 있어서, 그때까지
 * 계정 기능 전체가 검증되지 않은 채로 남습니다. 그건 위험합니다 —
 * 세션·주문 연결·배송지 저장은 실제 제공자와 무관한 우리 코드인데,
 * 그 부분마저 못 돌려보게 되기 때문입니다.
 *
 * 그래서 제공자 자리만 대신하는 가짜를 둡니다. 인가 코드 대신 넘어온
 * 문자열을 그대로 사용자 id 로 씁니다.
 *
 * 🚨 **AUTH_PROVIDER 에 이름이 적혀 있을 때만 켜집니다.**
 * 한때 isConfigured 가 무조건 true 를 돌려준 적이 있는데, 제공자를 하나만
 * 고르던 시절에는 바깥에서 한 번 더 걸러 문제가 없었습니다. 여러 제공자를
 * 지원하면서 그 관문이 사라졌고, 그대로 두었으면 **운영에서 누구나 아무
 * 계정으로 로그인**할 수 있었습니다. 배포 전 점검도 이 값을 막습니다.
 *
 * mock2 는 계정 연결을 시험하기 위한 두 번째 가짜입니다 — 연결은 서로 다른
 * 제공자 사이에서만 일어나므로 하나로는 검증할 수 없습니다.
 */
import type { AuthProvider, AuthStart, ExchangeResult } from './types';

/** AUTH_PROVIDER 에 이 이름이 들어 있는가. 쉼표로 여러 개를 적을 수 있습니다. */
function enabled(env: Record<string, unknown>, name: string): boolean {
  const raw = env.AUTH_PROVIDER;
  if (typeof raw !== 'string') return false;
  return raw.split(',').map((part) => part.trim()).includes(name);
}

export const mockAuth: AuthProvider = {
  name: 'mock',

  isConfigured(env) {
    return enabled(env, 'mock');
  },

  start(redirectUri, state): AuthStart {
    // 실제 제공자 대신, 콜백으로 바로 돌아오는 주소를 만듭니다.
    //
    // code 는 state 에서 가져옵니다. 고정값을 쓰면 **브라우저로 흐름을
    // 따라가는 테스트가 매번 같은 사람이 되고**, 로컬 D1 은 실행 사이에
    // 남으므로 지난 실행의 연결이 이번 실행을 망가뜨립니다.
    // code 를 직접 정하고 싶은 테스트는 이 주소의 code 를 바꿔 부르면 됩니다.
    const url = new URL(redirectUri);
    url.searchParams.set('code', `mock-${state.slice(0, 12)}`);
    url.searchParams.set('state', state);
    return { authorizeUrl: url.href, state };
  },

  async exchange(code): Promise<ExchangeResult> {
    // 실패 경로도 시험할 수 있어야 합니다.
    if (code.startsWith('fail')) {
      return { ok: false, error: 'TOKEN_FAILED', message: '테스트용 실패' };
    }
    // 이메일이 오지 않는 경우가 실제로 있으므로(카카오 문서), 그 상황도
    // 코드로 만들 수 있게 합니다.
    const noEmail = code.startsWith('noemail');
    return {
      ok: true,
      profile: {
        providerUserId: code,
        email: noEmail ? undefined : `${code}@example.test`,
        name: '테스트 사용자',
      },
    };
  },
};

/**
 * 두 번째 가짜 제공자.
 *
 * 계정 연결은 **서로 다른 제공자 사이**에서만 일어납니다. 가짜가 하나뿐이면
 * 연결·해제·마지막 하나 보호를 아예 시험할 수 없습니다.
 */
export const mockAuth2: AuthProvider = {
  ...mockAuth,
  name: 'mock2',
  isConfigured(env) {
    return enabled(env, 'mock2');
  },
  async exchange(code) {
    const result = await mockAuth.exchange(code, '', {});
    // 같은 code 라도 다른 제공자면 다른 사람입니다.
    // 접두어를 붙여 두 제공자의 id 가 섞이지 않게 합니다.
    if (result.ok) {
      return { ok: true, profile: { ...result.profile, providerUserId: `m2-${code}` } };
    }
    return result;
  },
};
