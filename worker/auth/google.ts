/**
 * 구글 로그인.
 *
 * 요청하는 범위는 셋뿐입니다 — `openid`, `email`, `profile`. 전부 비민감
 * 범위라 구글 심사(verification)를 거치지 않습니다. Gmail 이나 드라이브처럼
 * 민감한 범위를 하나라도 넣는 순간 심사 대상이 되므로 늘리지 마세요.
 *
 * 앱 등록:
 *   Google Cloud → Google Auth Platform → Clients → Web application
 *   Authorized redirect URI: https://<도메인>/api/auth/callback/google
 *   Audience 는 External, 그리고 **Publish app** 을 눌러야 실제 고객이
 *   로그인할 수 있습니다(테스트 모드에서는 등록한 테스트 사용자만).
 *
 * ⚠️ 이메일 검증 여부를 반드시 봅니다. 구글은 `email_verified` 를 주는데,
 *    검증되지 않은 이메일을 그대로 믿으면 남의 이메일을 주장하는 계정을
 *    받아들이게 됩니다. 우리는 이메일을 계정 식별자로 쓰지 않지만
 *    (식별자는 sub 입니다), 화면에 보여주고 저장하므로 걸러 둡니다.
 */
import type { AuthProvider, AuthStart, ExchangeResult } from './types';

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

export const googleAuth: AuthProvider = {
  name: 'google',

  isConfigured(env) {
    return (
      typeof env.GOOGLE_CLIENT_ID === 'string' &&
      env.GOOGLE_CLIENT_ID.length > 0 &&
      typeof env.GOOGLE_CLIENT_SECRET === 'string' &&
      env.GOOGLE_CLIENT_SECRET.length > 0
    );
  },

  start(redirectUri, state, env): AuthStart {
    const url = new URL(AUTHORIZE);
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID as string);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    // 계정 선택 화면을 항상 띄웁니다. 기기를 함께 쓰는 경우 직전 사람의
    // 계정으로 조용히 로그인되는 것을 막습니다.
    url.searchParams.set('prompt', 'select_account');
    return { authorizeUrl: url.href, state };
  },

  async exchange(code, redirectUri, env): Promise<ExchangeResult> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.GOOGLE_CLIENT_ID as string,
      client_secret: env.GOOGLE_CLIENT_SECRET as string,
      redirect_uri: redirectUri,
      code,
    });

    let tokenRes: Response;
    try {
      tokenRes = await fetch(TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch {
      return {
        ok: false,
        error: 'PROVIDER_UNREACHABLE',
        message: '로그인 제공자에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      };
    }

    if (!tokenRes.ok) {
      // 무엇이 틀렸는지는 알려주지 않습니다 — 인가 코드 재사용, 만료,
      // redirect_uri 불일치가 모두 여기로 옵니다.
      return {
        ok: false,
        error: 'TOKEN_EXCHANGE_FAILED',
        message: '로그인에 실패했습니다. 다시 시도해 주세요.',
      };
    }

    const token = (await tokenRes.json().catch(() => null)) as { access_token?: string } | null;
    if (!token?.access_token) {
      return {
        ok: false,
        error: 'TOKEN_EXCHANGE_FAILED',
        message: '로그인에 실패했습니다. 다시 시도해 주세요.',
      };
    }

    let profileRes: Response;
    try {
      profileRes = await fetch(USERINFO, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
    } catch {
      return {
        ok: false,
        error: 'PROVIDER_UNREACHABLE',
        message: '로그인 제공자에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      };
    }

    if (!profileRes.ok) {
      return {
        ok: false,
        error: 'PROFILE_FETCH_FAILED',
        message: '로그인 정보를 가져오지 못했습니다. 다시 시도해 주세요.',
      };
    }

    const profile = (await profileRes.json().catch(() => null)) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    } | null;

    // sub 가 이 사람의 식별자입니다. 이메일은 바뀔 수 있어 쓰지 않습니다.
    if (!profile?.sub) {
      return {
        ok: false,
        error: 'PROFILE_INCOMPLETE',
        message: '로그인 정보를 가져오지 못했습니다. 다시 시도해 주세요.',
      };
    }

    return {
      ok: true,
      profile: {
        providerUserId: String(profile.sub),
        // 검증되지 않은 이메일은 받지 않습니다. 없는 편이 틀린 것보다 낫습니다.
        email: profile.email_verified === true ? profile.email : undefined,
        name: profile.name,
      },
    };
  },
};
