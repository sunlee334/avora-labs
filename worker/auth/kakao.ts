/**
 * 카카오 로그인.
 *
 * ⚠️ 실제 로그인을 거쳐 본 적이 없는 코드입니다. 엔드포인트와 응답 위치는
 * 공식 문서를 따랐지만, 실제로 한 번 돌려보기 전까지 "된다" 고 말하지 마세요.
 *
 * 켜려면 두 가지가 먼저 있어야 합니다.
 *   1. 도메인 — Redirect URI 를 등록해야 하고, 인가 코드는 등록된 주소로만
 *      전달됩니다. workers.dev 주소로 등록해 두면 도메인이 정해질 때 다시
 *      등록해야 합니다.
 *   2. 사업자등록번호 — 이메일을 필수 동의로 받으려면 비즈 앱이어야 하고,
 *      비즈 앱 전환에는 사업자등록번호 등록(또는 전화번호 본인인증)이
 *      필요합니다(공식 문서).
 *
 * 이메일은 필수 동의로 설정해도 안 올 수 있습니다 — 사용자가 카카오계정에
 * 이메일을 등록하지 않은 경우입니다. 그래서 profile.email 은 선택값입니다.
 */
import type { AuthProvider, AuthStart, ExchangeResult } from './types';

const AUTHORIZE = 'https://kauth.kakao.com/oauth/authorize';
const TOKEN = 'https://kauth.kakao.com/oauth/token';
const USER = 'https://kapi.kakao.com/v2/user/me';

export const kakaoAuth: AuthProvider = {
  name: 'kakao',

  isConfigured(env) {
    return typeof env.KAKAO_REST_API_KEY === 'string' && env.KAKAO_REST_API_KEY.length > 0;
  },

  start(redirectUri, state, env): AuthStart {
    const url = new URL(AUTHORIZE);
    url.searchParams.set('client_id', env.KAKAO_REST_API_KEY as string);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return { authorizeUrl: url.href, state };
  },

  async exchange(code, redirectUri, env): Promise<ExchangeResult> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.KAKAO_REST_API_KEY as string,
      redirect_uri: redirectUri,
      code,
    });
    // 클라이언트 시크릿은 활성화한 경우에만 보냅니다.
    if (typeof env.KAKAO_CLIENT_SECRET === 'string' && env.KAKAO_CLIENT_SECRET) {
      body.set('client_secret', env.KAKAO_CLIENT_SECRET);
    }

    let tokenRes: Response;
    try {
      tokenRes = await fetch(TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body,
      });
    } catch (cause) {
      return {
        ok: false,
        error: 'NETWORK_ERROR',
        message: cause instanceof Error ? cause.message : String(cause),
      };
    }

    const token = (await tokenRes.json().catch(() => null)) as { access_token?: string } | null;
    if (!tokenRes.ok || !token?.access_token) {
      return { ok: false, error: 'TOKEN_FAILED', message: `카카오 토큰 발급 실패 (${tokenRes.status})` };
    }

    const userRes = await fetch(USER, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const user = (await userRes.json().catch(() => null)) as {
      id?: number | string;
      kakao_account?: { email?: string; profile?: { nickname?: string } };
    } | null;

    if (!userRes.ok || user?.id == null) {
      return { ok: false, error: 'PROFILE_FAILED', message: `카카오 사용자 조회 실패 (${userRes.status})` };
    }

    return {
      ok: true,
      profile: {
        providerUserId: String(user.id),
        email: user.kakao_account?.email,
        name: user.kakao_account?.profile?.nickname,
      },
    };
  },
};
