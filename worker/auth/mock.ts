/**
 * 테스트 전용 로그인 제공자.
 *
 * 카카오·네이버는 도메인과 사업자 정보가 있어야 붙일 수 있어서, 그때까지
 * 계정 기능 전체가 검증되지 않은 채로 남습니다. 그건 위험합니다 —
 * 세션·주문 연결·배송지 저장은 실제 제공자와 무관한 우리 코드인데,
 * 그 부분마저 못 돌려보게 되기 때문입니다.
 *
 * 그래서 제공자 자리만 대신하는 가짜를 둡니다. 인가 코드 대신 넘어온
 * 문자열을 그대로 사용자 id 로 씁니다. AUTH_PROVIDER=mock 일 때만 잡히며,
 * 배포 전 점검이 운영 설정에서 이 값을 발견하면 배포를 멈춥니다.
 */
import type { AuthProvider, AuthStart, ExchangeResult } from './types';

export const mockAuth: AuthProvider = {
  name: 'mock',

  isConfigured() {
    return true;
  },

  start(redirectUri, state): AuthStart {
    // 실제 제공자 대신, 콜백으로 바로 돌아오는 주소를 만듭니다.
    const url = new URL(redirectUri);
    url.searchParams.set('code', 'mock-user-1');
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
