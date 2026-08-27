/**
 * 카카오 로그인.
 *
 * ⚠️ 실제 로그인을 거쳐 본 적이 없는 코드입니다. 엔드포인트와 응답 위치는
 * 공식 문서를 따랐지만, 실제로 한 번 돌려보기 전까지 "된다" 고 말하지 마세요.
 *
 * 켜는 데 필요한 두 가지는 이미 갖춰졌습니다.
 *   1. 도메인 — Redirect URI 는 https://avoralabs.co/api/auth/callback/kakao
 *   2. 사업자등록번호 — 이메일을 필수 동의로 받으려면 비즈 앱이어야 하고,
 *      비즈 앱 전환에는 사업자등록번호 등록(또는 전화번호 본인인증)이
 *      필요합니다(공식 문서).
 *
 * 동의항목(scope)은 여기서 보내지 않고 카카오 개발자 콘솔의 설정을 따릅니다.
 * 콘솔에서 켜지 않은 항목을 scope 로 보내면 오류가 나므로, 한 곳에서만
 * 정하는 편이 어긋날 여지가 적습니다.
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

    const token = (await tokenRes.json().catch(() => null)) as {
      access_token?: string;
      error?: string;
      error_code?: string;
      error_description?: string;
    } | null;

    if (!tokenRes.ok || !token?.access_token) {
      /*
       * 카카오가 준 실패 이유를 그대로 남깁니다.
       *
       * 예전에는 상태 코드만 남겼는데, 그것만으로는 무엇이 틀렸는지 알 수
       * 없었습니다. 실제로 KOE010(Client Secret 을 콘솔에서 켰는데 보내지
       * 않음)을 진단하려고 서버 밖에서 따로 토큰 요청을 만들어 봐야 했습니다.
       *
       * 사용자에게는 이 값이 가지 않습니다 — 호출하는 쪽이 일반적인 문구로
       * 바꿔 내보냅니다(worker/auth/index.ts).
       */
      return {
        ok: false,
        error: 'TOKEN_FAILED',
        message:
          `카카오 토큰 발급 실패 (${tokenRes.status})` +
          ` ${token?.error_code ?? ''} ${token?.error ?? ''} ${token?.error_description ?? ''}`.trimEnd(),
      };
    }

    let userRes: Response;
    try {
      userRes = await fetch(USER, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
    } catch (cause) {
      // 토큰 요청과 달리 여기를 감싸지 않으면, 네트워크가 끊겼을 때 예외가
      // 그대로 올라가 500 이 나갑니다. 사용자에게는 같은 실패인데 로그와
      // 응답만 달라집니다.
      return {
        ok: false,
        error: 'NETWORK_ERROR',
        message: cause instanceof Error ? cause.message : String(cause),
      };
    }

    const user = (await userRes.json().catch(() => null)) as {
      id?: number | string;
      kakao_account?: {
        email?: string;
        is_email_valid?: boolean;
        is_email_verified?: boolean;
        profile?: { nickname?: string };
      };
    } | null;

    if (!userRes.ok || user?.id == null) {
      const failure = user as unknown as { msg?: string; code?: number } | null;
      return {
        ok: false,
        error: 'PROFILE_FAILED',
        message:
          `카카오 사용자 조회 실패 (${userRes.status})` +
          ` ${failure?.code ?? ''} ${failure?.msg ?? ''}`.trimEnd(),
      };
    }

    /*
     * 이메일은 세 가지가 모두 맞아야 받습니다.
     *
     * 카카오는 이메일과 함께 `is_email_valid`(유효한 주소인가)와
     * `is_email_verified`(본인 확인을 마쳤는가)를 줍니다. 검증되지 않은
     * 주소를 그대로 저장하면, 남의 이메일을 주장하는 계정을 그대로 받아
     * 화면에 보여주게 됩니다. 구글 어댑터도 같은 이유로 email_verified 를
     * 봅니다 — 두 제공자가 다른 기준을 쓰면 그 자체가 구멍입니다.
     *
     * 이메일이 없어도 로그인은 됩니다. 식별자는 카카오가 주는 id 이지
     * 이메일이 아니기 때문입니다 — 이메일을 필수로 삼았다면 카카오계정에
     * 이메일을 등록하지 않은 사람은 로그인 자체가 막힙니다.
     */
    const account = user.kakao_account;
    const usableEmail =
      account?.email && account.is_email_valid !== false && account.is_email_verified !== false
        ? account.email
        : undefined;

    return {
      ok: true,
      profile: {
        providerUserId: String(user.id),
        email: usableEmail,
        name: account?.profile?.nickname,
      },
    };
  },
};
