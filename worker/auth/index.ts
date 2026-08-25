/**
 * 로그인 요청 처리.
 *
 * 흐름:
 *   1. GET  /api/auth/login     제공자로 보냅니다. state 를 쿠키에 심습니다
 *   2. GET  /api/auth/callback  돌아온 code 를 프로필로 바꾸고 세션을 만듭니다
 *   3. POST /api/auth/logout    세션을 지웁니다
 *
 * state 는 CSRF 방지용입니다. 공격자가 자기 계정의 인가 코드로 콜백을
 * 부르면 피해자가 공격자 계정에 로그인된 채로 쇼핑하게 됩니다. 시작할 때
 * 만든 난수를 쿠키에 넣고 콜백에서 대조해 막습니다.
 */
import { kakaoAuth } from './kakao';
import { mockAuth } from './mock';
import type { AuthProvider } from './types';
import {
  findOrCreateUser,
  createSession,
  deleteSession,
  purgeExpiredSessions,
  userFromToken,
  SESSION_COOKIE,
  SESSION_DAYS,
  newToken,
  type User,
} from '../accounts';

const PROVIDERS: Record<string, AuthProvider> = {
  kakao: kakaoAuth,
  // 테스트 전용. 운영 설정에 두면 배포 전 점검이 막습니다.
  mock: mockAuth,
};

const STATE_COOKIE = 'avora_oauth_state';

export interface AuthEnv {
  DB?: D1Database;
  /** 어떤 제공자를 쓸지. 미설정이면 계정 기능이 꺼져 있습니다. */
  AUTH_PROVIDER?: string;
  KAKAO_REST_API_KEY?: string;
  KAKAO_CLIENT_SECRET?: string;
}

export function providerFor(env: AuthEnv): AuthProvider | null {
  const name = env.AUTH_PROVIDER;
  if (!name) return null;
  const provider = PROVIDERS[name];
  if (!provider || !provider.isConfigured(env as unknown as Record<string, unknown>)) return null;
  return provider;
}

function cookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    // Lax 면 외부에서 돌아오는 GET 리다이렉트에는 쿠키가 실립니다.
    // OAuth 콜백이 정확히 그 경우라 Strict 는 쓸 수 없습니다.
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/** 로컬 개발(http)에서는 Secure 쿠키가 저장되지 않습니다. */
function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

/** 로그인 후 돌아갈 곳. 외부 주소로 보내지 않도록 우리 경로만 허용합니다. */
function safeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/ko/account';
  return raw;
}

export async function handleLogin(request: Request, env: AuthEnv): Promise<Response> {
  const provider = providerFor(env);
  if (!provider) {
    return json({ error: 'AUTH_NOT_CONFIGURED', message: '로그인이 아직 설정되지 않았습니다.' }, 503);
  }

  const url = new URL(request.url);
  const redirectUri = new URL('/api/auth/callback', url).href;
  const state = newToken();
  const returnTo = safeReturnPath(url.searchParams.get('returnTo'));

  const { authorizeUrl } = provider.start(redirectUri, state, env as unknown as Record<string, unknown>);

  const headers = new Headers({ Location: authorizeUrl, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', cookie(STATE_COOKIE, `${state}.${encodeURIComponent(returnTo)}`, 600, isSecure(request)));
  return new Response(null, { status: 302, headers });
}

export async function handleCallback(request: Request, env: AuthEnv): Promise<Response> {
  const provider = providerFor(env);
  if (!provider) {
    return json({ error: 'AUTH_NOT_CONFIGURED' }, 503);
  }
  if (!env.DB) {
    return json({ error: 'ACCOUNTS_NOT_CONFIGURED', message: 'D1 바인딩(DB)이 없습니다.' }, 503);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const stored = readCookie(request, STATE_COOKIE);

  if (!code || !state || !stored) {
    return json({ error: 'INVALID_CALLBACK', message: '로그인 정보가 없습니다. 다시 시도해 주세요.' }, 400);
  }

  const [expectedState, encodedReturn] = stored.split('.');
  if (state !== expectedState) {
    // 우리가 시작하지 않은 로그인입니다.
    return json({ error: 'STATE_MISMATCH', message: '로그인 요청이 확인되지 않았습니다.' }, 400);
  }

  const redirectUri = new URL('/api/auth/callback', url).href;
  const result = await provider.exchange(code, redirectUri, env as unknown as Record<string, unknown>);
  if (!result.ok) {
    console.error('로그인 실패', { provider: provider.name, error: result.error });
    return json({ error: result.error, message: '로그인에 실패했습니다. 다시 시도해 주세요.' }, 502);
  }

  const now = new Date();
  const user = await findOrCreateUser(env.DB, provider.name, result.profile, now.toISOString());
  const token = await createSession(env.DB, user.id, now);

  // 세션을 만들 때마다 만료된 것을 조금씩 치웁니다. 따로 배치를 돌리지
  // 않아도 되고, 로그인 자체가 느려질 만큼 무거운 질의도 아닙니다.
  await purgeExpiredSessions(env.DB, now.toISOString());

  const headers = new Headers({
    Location: safeReturnPath(encodedReturn ? decodeURIComponent(encodedReturn) : null),
    'Cache-Control': 'no-store',
  });
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, token, SESSION_DAYS * 24 * 60 * 60, isSecure(request)));
  // 다 쓴 state 쿠키는 즉시 지웁니다.
  headers.append('Set-Cookie', cookie(STATE_COOKIE, '', 0, isSecure(request)));
  return new Response(null, { status: 302, headers });
}

export async function handleLogout(request: Request, env: AuthEnv): Promise<Response> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token && env.DB) await deleteSession(env.DB, token);
  return json({ ok: true }, 200, {
    'Set-Cookie': cookie(SESSION_COOKIE, '', 0, isSecure(request)),
  });
}

/** 요청에 실린 세션의 주인. 로그인하지 않았으면 null. */
export async function currentUser(request: Request, env: AuthEnv): Promise<User | null> {
  if (!env.DB) return null;
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return userFromToken(env.DB, token, new Date().toISOString());
}
