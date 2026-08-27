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
import { googleAuth } from './google';
import { kakaoAuth } from './kakao';
import { mockAuth, mockAuth2 } from './mock';
import type { AuthProvider } from './types';
import {
  findOrCreateUser,
  identitiesForUser,
  linkIdentity,
  unlinkIdentity,
  createSession,
  deleteSession,
  purgeExpiredSessions,
  userFromToken,
  SESSION_COOKIE,
  SESSION_DAYS,
  newToken,
  type User,
} from '../accounts';

/**
 * 붙일 수 있는 제공자. **키가 들어 있는 것만** 실제로 켜집니다.
 * 순서가 화면의 버튼 순서입니다.
 */
const PROVIDERS: AuthProvider[] = [
  googleAuth,
  kakaoAuth,
  // 테스트 전용. 운영 설정에 두면 배포 전 점검이 막습니다.
  mockAuth,
  mockAuth2,
];

const STATE_COOKIE = 'avora_oauth_state';

export interface AuthEnv {
  DB?: D1Database;
  /** 테스트 전용 제공자를 켜는 열쇠. 운영에는 절대 두지 않습니다. */
  AUTH_PROVIDER?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  KAKAO_REST_API_KEY?: string;
  KAKAO_CLIENT_SECRET?: string;
}

/**
 * 지금 실제로 쓸 수 있는 제공자들.
 *
 * 키가 없는 제공자는 목록에 들어가지 않고, 따라서 화면에 버튼도 나오지
 * 않습니다. 눌러도 아무 일이 없는 로그인 버튼은 없는 것만 못합니다.
 */
export function providersFor(env: AuthEnv): AuthProvider[] {
  const record = env as unknown as Record<string, unknown>;
  return PROVIDERS.filter((provider) => provider.isConfigured(record));
}

/**
 * 이름으로 하나 고릅니다.
 *
 * 이름이 없으면, **설정된 제공자가 하나뿐일 때만** 그것을 씁니다. 둘 이상이면
 * 고르지 않습니다 — 어느 계정으로 로그인되는지 사용자가 모른 채 진행되면
 * 안 되기 때문입니다.
 */
export function providerByName(env: AuthEnv, name: string | null): AuthProvider | null {
  const available = providersFor(env);
  if (!name) return available.length === 1 ? available[0] : null;
  return available.find((provider) => provider.name === name) ?? null;
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

/**
 * 제공자로 보냅니다.
 *
 * `mode` 는 돌아왔을 때 무엇을 할지입니다.
 *   login  처음 들어오는 사람 — 세션을 만듭니다
 *   link   이미 로그인한 사람 — 그 사람에게 이 수단을 붙입니다
 */
async function startOAuth(request: Request, env: AuthEnv, mode: 'login' | 'link'): Promise<Response> {
  const url = new URL(request.url);
  const provider = providerByName(env, url.searchParams.get('provider'));
  if (!provider) {
    return json(
      { error: 'AUTH_NOT_CONFIGURED', message: '로그인이 아직 설정되지 않았습니다.' },
      503,
    );
  }

  const redirectUri = new URL(`/api/auth/callback/${provider.name}`, url).href;
  const state = newToken();
  const returnTo = safeReturnPath(url.searchParams.get('returnTo'));

  const { authorizeUrl } = provider.start(
    redirectUri,
    state,
    env as unknown as Record<string, unknown>,
  );

  const headers = new Headers({ Location: authorizeUrl, 'Cache-Control': 'no-store' });
  // 구분자는 `|` 입니다. encodeURIComponent 가 `|` 를 %7C 로 바꾸므로
  // 돌아갈 경로 안에 구분자가 섞일 수 없습니다.
  headers.append(
    'Set-Cookie',
    cookie(STATE_COOKIE, `${state}|${mode}|${encodeURIComponent(returnTo)}`, 600, isSecure(request)),
  );
  return new Response(null, { status: 302, headers });
}

export async function handleLogin(request: Request, env: AuthEnv): Promise<Response> {
  return startOAuth(request, env, 'login');
}

/** 로그인한 사람이 다른 로그인 수단을 붙이러 갑니다. */
export async function handleLinkStart(request: Request, env: AuthEnv): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) {
    return json({ error: 'NOT_SIGNED_IN', message: '로그인이 필요합니다.' }, 401);
  }
  return startOAuth(request, env, 'link');
}

/**
 * 제공자에서 돌아온 요청.
 *
 * 제공자 이름은 **경로**에 있습니다(`/api/auth/callback/google`). 쿼리나
 * 쿠키가 아니라 경로인 이유: 제공자마다 Redirect URI 를 따로 등록해야 하고,
 * 등록된 주소와 한 글자라도 다르면 인가 코드가 오지 않기 때문입니다.
 */
export async function handleCallback(
  request: Request,
  env: AuthEnv,
  providerName: string | null,
): Promise<Response> {
  const provider = providerByName(env, providerName);
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

  const [expectedState, mode, encodedReturn] = stored.split('|');
  if (state !== expectedState) {
    // 우리가 시작하지 않은 로그인입니다.
    return json({ error: 'STATE_MISMATCH', message: '로그인 요청이 확인되지 않았습니다.' }, 400);
  }

  const redirectUri = new URL(`/api/auth/callback/${provider.name}`, url).href;
  const result = await provider.exchange(code, redirectUri, env as unknown as Record<string, unknown>);
  if (!result.ok) {
    console.error('로그인 실패', { provider: provider.name, error: result.error });
    return json({ error: result.error, message: '로그인에 실패했습니다. 다시 시도해 주세요.' }, 502);
  }

  const now = new Date();
  const returnTo = safeReturnPath(encodedReturn ? decodeURIComponent(encodedReturn) : null);
  const clearState = cookie(STATE_COOKIE, '', 0, isSecure(request));

  /*
   * 연결 모드 — 이미 로그인한 사람에게 이 수단을 붙입니다.
   *
   * 세션을 새로 만들지 않습니다. 붙이는 도중에 세션이 바뀌면, 방금까지
   * 보고 있던 계정이 아닌 다른 계정으로 넘어가게 됩니다.
   */
  if (mode === 'link') {
    const user = await currentUser(request, env);
    if (!user) {
      return json({ error: 'NOT_SIGNED_IN', message: '로그인이 필요합니다.' }, 401, {
        'Set-Cookie': clearState,
      });
    }

    const linked = await linkIdentity(
      env.DB,
      user.id,
      provider.name,
      result.profile,
      now.toISOString(),
    );

    // 실패해도 화면으로 돌려보냅니다 — 사람이 보는 것은 JSON 이 아니라
    // 마이페이지여야 합니다. 무엇이 잘못됐는지는 주소에 실어 보냅니다.
    const target = new URL(returnTo, url);
    if (!linked.ok) target.searchParams.set('link', linked.reason.toLowerCase());
    else target.searchParams.set('link', 'ok');

    return new Response(null, {
      status: 302,
      headers: new Headers([
        ['Location', target.pathname + target.search],
        ['Cache-Control', 'no-store'],
        ['Set-Cookie', clearState],
      ]),
    });
  }

  const user = await findOrCreateUser(env.DB, provider.name, result.profile, now.toISOString());
  const token = await createSession(env.DB, user.id, now);

  // 세션을 만들 때마다 만료된 것을 조금씩 치웁니다. 따로 배치를 돌리지
  // 않아도 되고, 로그인 자체가 느려질 만큼 무거운 질의도 아닙니다.
  await purgeExpiredSessions(env.DB, now.toISOString());

  const headers = new Headers({ Location: returnTo, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, token, SESSION_DAYS * 24 * 60 * 60, isSecure(request)));
  // 다 쓴 state 쿠키는 즉시 지웁니다.
  headers.append('Set-Cookie', clearState);
  return new Response(null, { status: 302, headers });
}

/**
 * 지금 쓸 수 있는 로그인 수단의 이름들.
 *
 * 화면이 이걸 보고 버튼을 그립니다. 키가 없는 제공자는 목록에 없으므로
 * 버튼도 나오지 않습니다 — 눌러도 아무 일이 없는 로그인 버튼은 없는 것만
 * 못합니다. 로그인하지 않은 사람도 볼 수 있어야 하므로 공개 엔드포인트입니다.
 */
export function handleProviders(_request: Request, env: AuthEnv): Response {
  return json({ ok: true, providers: providersFor(env).map((provider) => provider.name) });
}

/** 이 사람에게 붙어 있는 로그인 수단과, 아직 붙일 수 있는 것들. */
export async function handleIdentities(request: Request, env: AuthEnv): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'NOT_SIGNED_IN', message: '로그인이 필요합니다.' }, 401);
  if (!env.DB) return json({ error: 'ACCOUNTS_NOT_CONFIGURED' }, 503);

  const linked = await identitiesForUser(env.DB, user.id);
  const linkedNames = new Set(linked.map((identity) => identity.provider));

  return json({
    ok: true,
    linked: linked.map((identity) => ({
      provider: identity.provider,
      email: identity.email,
      createdAt: identity.createdAt,
    })),
    available: providersFor(env)
      .map((provider) => provider.name)
      .filter((name) => !linkedNames.has(name)),
    // 마지막 하나는 뗄 수 없습니다. 화면이 버튼을 잠그는 데 씁니다.
    canUnlink: linked.length > 1,
  });
}

export async function handleUnlink(request: Request, env: AuthEnv): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'NOT_SIGNED_IN', message: '로그인이 필요합니다.' }, 401);
  if (!env.DB) return json({ error: 'ACCOUNTS_NOT_CONFIGURED' }, 503);

  let body: { provider?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }
  if (!body.provider) return json({ error: 'MISSING_FIELDS' }, 400);

  const result = await unlinkIdentity(env.DB, user.id, body.provider);
  if (!result.ok) {
    const message =
      result.reason === 'LAST_IDENTITY'
        ? '마지막 로그인 수단은 뗄 수 없습니다. 먼저 다른 수단을 연결해 주세요.'
        : '연결되지 않은 로그인 수단입니다.';
    return json({ error: result.reason, message }, result.reason === 'LAST_IDENTITY' ? 409 : 404);
  }
  return json({ ok: true });
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
