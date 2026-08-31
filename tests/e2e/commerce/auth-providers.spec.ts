import { test, expect, type Page } from '@playwright/test';
import { mockAuth, mockAuth2 } from '../../../worker/auth/mock';
import { googleAuth } from '../../../worker/auth/google';
import { kakaoAuth } from '../../../worker/auth/kakao';

/**
 * 여러 로그인 수단.
 *
 * 사람과 로그인 수단을 나눈 뒤(0005_identities) 생긴 것들을 봅니다.
 * 한 사람이 구글로도, 카카오로도 들어올 수 있어야 하고, 그 둘이 **같은
 * 사람**이 되려면 로그인한 상태에서 직접 연결해야 합니다.
 *
 * 여기서 가장 중요한 두 가지:
 *   1. 켜지지 않은 제공자로는 로그인할 수 없다 — 특히 테스트용 가짜.
 *   2. 남의 계정에 붙은 수단을 가져올 수 없다 — 가져오면 원래 계정의
 *      주문 내역이 사라지고 그 계정에는 다시 들어갈 수 없습니다.
 */

/**
 * 제공자를 지정해 로그인합니다.
 *
 * 리다이렉트를 따라가지 않고 단계마다 직접 갑니다 — 끝까지 따라가면 콜백의
 * code 를 손볼 틈이 없어 모든 테스트가 같은 사람으로 로그인됩니다.
 */
async function loginWith(page: Page, provider: string, code: string): Promise<void> {
  const start = await page.request.get(
    `/api/auth/login?provider=${provider}&returnTo=%2Fko%2Faccount`,
    { maxRedirects: 0 },
  );
  expect(start.status(), `${provider} 로그인 시작`).toBe(302);
  const callback = new URL(start.headers()['location']);
  callback.searchParams.set('code', code);
  const done = await page.request.get(callback.href, { maxRedirects: 0 });
  expect(done.status()).toBe(302);
}

/** 로그인한 상태에서 다른 수단을 붙입니다. 붙이기 결과가 주소에 실려 옵니다. */
async function linkWith(page: Page, provider: string, code: string): Promise<string> {
  const start = await page.request.get(
    `/api/auth/link?provider=${provider}&returnTo=%2Fko%2Faccount`,
    { maxRedirects: 0 },
  );
  expect(start.status(), `${provider} 연결 시작`).toBe(302);
  const callback = new URL(start.headers()['location']);
  callback.searchParams.set('code', code);
  const done = await page.request.get(callback.href, { maxRedirects: 0 });
  return done.headers()['location'] ?? '';
}

/**
 * 실행마다 다른 사용자 id.
 *
 * 로컬 D1 은 테스트 실행 사이에 남습니다. 고정된 id 를 쓰면 지난 실행에서
 * 만든 연결이 그대로 남아 다음 실행을 망가뜨립니다 — 실제로 그렇게 세 건이
 * 실패했습니다. 각 테스트가 자기만의 사람을 씁니다.
 */
let seq = 0;
function freshUser(label: string): string {
  seq += 1;
  return `${label}-${Date.now().toString(36)}-${seq}`;
}

async function linkedProviders(page: Page): Promise<string[]> {
  const res = await page.request.get('/api/account/identities');
  expect(res.status()).toBe(200);
  const { linked } = await res.json();
  return linked.map((identity: { provider: string }) => identity.provider);
}

test.describe('🚨 테스트용 가짜는 운영에서 절대 켜지지 않는다', () => {
  /*
   * 이 검사는 서버가 아니라 함수를 직접 봅니다. 테스트 서버에는 늘
   * AUTH_PROVIDER 가 들어 있어서, 서버를 통해서는 "값이 없을 때" 를
   * 재현할 수 없기 때문입니다. 운영이 바로 그 "값이 없을 때" 입니다.
   *
   * 한때 isConfigured 가 무조건 true 였습니다. 제공자를 하나만 고르던
   * 시절에는 바깥에서 한 번 더 걸러 문제가 없었지만, 여러 제공자를
   * 지원하면서 그 관문이 사라졌습니다. 그대로 두었으면 누구나
   * /api/auth/login?provider=mock 으로 아무 계정에나 들어갔습니다.
   */
  test('AUTH_PROVIDER 가 없으면 가짜 제공자는 꺼져 있다', () => {
    expect(mockAuth.isConfigured({}), 'mock 이 켜져 있습니다').toBe(false);
    expect(mockAuth2.isConfigured({}), 'mock2 가 켜져 있습니다').toBe(false);
  });

  test('다른 제공자 이름이 적혀 있어도 켜지지 않는다', () => {
    expect(mockAuth.isConfigured({ AUTH_PROVIDER: 'google' })).toBe(false);
    // 부분 문자열로 새어나가면 안 됩니다 — 'mock2' 는 'mock' 이 아닙니다.
    expect(mockAuth.isConfigured({ AUTH_PROVIDER: 'mock2' })).toBe(false);
    expect(mockAuth2.isConfigured({ AUTH_PROVIDER: 'mock' })).toBe(false);
  });

  test('이름이 적혀 있을 때만 켜진다', () => {
    expect(mockAuth.isConfigured({ AUTH_PROVIDER: 'mock' })).toBe(true);
    expect(mockAuth2.isConfigured({ AUTH_PROVIDER: 'mock,mock2' })).toBe(true);
  });
});

test.describe('구글 어댑터', () => {
  /* 실제 구글을 부를 수는 없으므로, 순수한 부분만 봅니다. */
  test('키가 둘 다 있어야 켜진다', () => {
    expect(googleAuth.isConfigured({})).toBe(false);
    expect(googleAuth.isConfigured({ GOOGLE_CLIENT_ID: 'x' }), '시크릿 없이').toBe(false);
    expect(googleAuth.isConfigured({ GOOGLE_CLIENT_SECRET: 'y' }), 'id 없이').toBe(false);
    expect(googleAuth.isConfigured({ GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y' })).toBe(true);
  });

  test('보내는 주소에 민감한 범위가 없다', () => {
    // 민감 범위를 하나라도 넣으면 구글 심사 대상이 됩니다.
    const { authorizeUrl } = googleAuth.start(
      'https://avoralabs.co/api/auth/callback/google',
      'state-value',
      { GOOGLE_CLIENT_ID: 'client-id' },
    );
    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://avoralabs.co/api/auth/callback/google',
    );
    // 기기를 함께 쓰는 경우 직전 사람 계정으로 조용히 들어가지 않게 합니다.
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });

  test('시크릿이 로그인 주소에 실리지 않는다', () => {
    const { authorizeUrl } = googleAuth.start('https://avoralabs.co/api/auth/callback/google', 's', {
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'super-secret',
    });
    expect(authorizeUrl).not.toContain('super-secret');
  });
});

test.describe('카카오 어댑터', () => {
  /* 실제 카카오를 부를 수는 없으므로, 순수한 부분만 봅니다. */
  test('REST API 키가 있어야 켜진다', () => {
    expect(kakaoAuth.isConfigured({})).toBe(false);
    expect(kakaoAuth.isConfigured({ KAKAO_REST_API_KEY: '' })).toBe(false);
    expect(kakaoAuth.isConfigured({ KAKAO_REST_API_KEY: 'rest-key' })).toBe(true);
  });

  test('보내는 주소가 카카오 인가 주소이고 state 를 싣는다', () => {
    const { authorizeUrl } = kakaoAuth.start(
      'https://avoralabs.co/api/auth/callback/kakao',
      'state-value',
      { KAKAO_REST_API_KEY: 'rest-key' },
    );
    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://kauth.kakao.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('rest-key');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://avoralabs.co/api/auth/callback/kakao',
    );
    // 동의항목은 콘솔에서 정합니다 — 두 곳에서 정하면 어긋납니다.
    expect(url.searchParams.get('scope')).toBeNull();
  });

  test('시크릿이 로그인 주소에 실리지 않는다', () => {
    const { authorizeUrl } = kakaoAuth.start('https://avoralabs.co/api/auth/callback/kakao', 's', {
      KAKAO_REST_API_KEY: 'rest-key',
      KAKAO_CLIENT_SECRET: 'super-secret',
    });
    expect(authorizeUrl).not.toContain('super-secret');
  });

});

test.describe('검증되지 않은 이메일은 받지 않는다', () => {
  /**
   * 두 제공자가 다른 기준을 쓰면 그 자체가 구멍입니다. 실제 제공자를 부를
   * 수는 없으므로, 응답만 흉내 내어 **동작**을 봅니다 — 코드에 특정 단어가
   * 있는지 보는 검사는 이름만 바꿔도 통과해 버립니다.
   *
   * 이메일을 식별자로 쓰지는 않지만(식별자는 제공자가 주는 id), 저장하고
   * 화면에 보여주므로 남의 주소를 주장하는 값을 받아서는 안 됩니다.
   */
  const realFetch = globalThis.fetch;

  function stub(...responses: unknown[]) {
    let call = 0;
    globalThis.fetch = (async () => {
      const body = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
  }

  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const googleEnv = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
  const kakaoEnv = { KAKAO_REST_API_KEY: 'key' };

  test('구글 — 검증된 이메일은 받는다', async () => {
    stub({ access_token: 't' }, { sub: '123', email: 'ok@example.test', email_verified: true, name: '홍길동' });
    const result = await googleAuth.exchange('code', 'https://x/cb', googleEnv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.providerUserId).toBe('123');
      expect(result.profile.email).toBe('ok@example.test');
    }
  });

  test('구글 — 검증되지 않은 이메일은 버린다', async () => {
    stub({ access_token: 't' }, { sub: '123', email: 'spoof@example.test', email_verified: false });
    const result = await googleAuth.exchange('code', 'https://x/cb', googleEnv);
    expect(result.ok).toBe(true);
    // 로그인 자체는 됩니다 — 식별자는 sub 이지 이메일이 아니기 때문입니다.
    if (result.ok) expect(result.profile.email).toBeUndefined();
  });

  test('카카오 — 검증된 이메일은 받는다', async () => {
    stub(
      { access_token: 't' },
      {
        id: 987,
        kakao_account: {
          email: 'ok@example.test',
          is_email_valid: true,
          is_email_verified: true,
          profile: { nickname: '길동' },
        },
      },
    );
    const result = await kakaoAuth.exchange('code', 'https://x/cb', kakaoEnv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.providerUserId).toBe('987');
      expect(result.profile.email).toBe('ok@example.test');
      expect(result.profile.name).toBe('길동');
    }
  });

  test('카카오 — 검증되지 않은 이메일은 버린다', async () => {
    stub(
      { access_token: 't' },
      { id: 987, kakao_account: { email: 'spoof@example.test', is_email_verified: false } },
    );
    const result = await kakaoAuth.exchange('code', 'https://x/cb', kakaoEnv);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.email).toBeUndefined();
  });

  test('카카오 — 유효하지 않은 주소도 버린다', async () => {
    stub(
      { access_token: 't' },
      { id: 987, kakao_account: { email: 'bad@example.test', is_email_valid: false, is_email_verified: true } },
    );
    const result = await kakaoAuth.exchange('code', 'https://x/cb', kakaoEnv);
    if (result.ok) expect(result.profile.email).toBeUndefined();
  });

  test('카카오 — 이메일이 아예 없어도 로그인은 된다', async () => {
    // 카카오계정에 이메일을 등록하지 않은 사람이 실제로 있습니다.
    // 이메일을 필수로 삼았다면 그 사람은 로그인 자체가 막힙니다.
    stub({ access_token: 't' }, { id: 987, kakao_account: { profile: { nickname: '길동' } } });
    const result = await kakaoAuth.exchange('code', 'https://x/cb', kakaoEnv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.providerUserId).toBe('987');
      expect(result.profile.email).toBeUndefined();
    }
  });
});

test.describe('켜진 제공자만 쓸 수 있다', () => {
  test('공개 목록은 설정된 제공자만 알려준다', async ({ request }) => {
    const { providers } = await (await request.get('/api/auth/providers')).json();
    expect(providers).toContain('mock');
    expect(providers).toContain('mock2');
    // 이 서버에는 실제 키를 넣지 않았습니다 — 버튼이 나오면 안 됩니다.
    expect(providers).not.toContain('google');
    expect(providers).not.toContain('kakao');
  });

  test('설정되지 않은 제공자로는 로그인할 수 없다', async ({ request }) => {
    const res = await request.get('/api/auth/login?provider=google', { maxRedirects: 0 });
    expect(res.status()).toBe(503);
    expect((await res.json()).error).toBe('AUTH_NOT_CONFIGURED');
  });

  test('없는 제공자 이름도 거절한다', async ({ request }) => {
    const res = await request.get('/api/auth/login?provider=아무거나', { maxRedirects: 0 });
    expect(res.status()).toBe(503);
  });

  test('제공자가 둘 이상이면 이름 없이 시작할 수 없다', async ({ request }) => {
    // 어느 계정으로 로그인되는지 모른 채 진행되면 안 됩니다.
    const res = await request.get('/api/auth/login', { maxRedirects: 0 });
    expect(res.status()).toBe(503);
  });
});

test.describe('제공자가 다르면 다른 사람이다', () => {
  test('같은 code 라도 제공자가 다르면 계정이 갈린다', async ({ page }) => {
    const USER_SPLIT_USER = freshUser('split-user');
    await loginWith(page, 'mock', USER_SPLIT_USER);
    const first = await (await page.request.get('/api/account/me')).json();

    await page.request.post('/api/auth/logout');
    await loginWith(page, 'mock2', USER_SPLIT_USER);
    const second = await (await page.request.get('/api/account/me')).json();

    // 만든 시각이 같을 수는 있어도 서로 다른 계정이어야 합니다.
    expect(await linkedProviders(page)).toEqual(['mock2']);
    expect(second.user).not.toEqual(first.user);
  });
});

test.describe('로그인한 상태에서 수단을 연결한다', () => {
  test('연결하면 두 수단으로 같은 계정에 들어간다', async ({ page }) => {
    const USER_LINK_OWNER = freshUser('link-owner');
    await loginWith(page, 'mock', USER_LINK_OWNER);
    expect(await linkedProviders(page)).toEqual(['mock']);

    const location = await linkWith(page, 'mock2', USER_LINK_OWNER);
    expect(location).toContain('link=ok');
    expect((await linkedProviders(page)).sort()).toEqual(['mock', 'mock2']);

    // 두 번째 수단으로 다시 들어와도 같은 계정이어야 합니다.
    const before = await (await page.request.get('/api/account/me')).json();
    await page.request.post('/api/auth/logout');
    await loginWith(page, 'mock2', USER_LINK_OWNER);
    const after = await (await page.request.get('/api/account/me')).json();
    expect(after.user.createdAt).toBe(before.user.createdAt);
  });

  test('이미 붙어 있는 수단을 또 붙이려 하면 알려준다', async ({ page }) => {
    const USER_LINK_DUP = freshUser('link-dup');
    await loginWith(page, 'mock', USER_LINK_DUP);
    const location = await linkWith(page, 'mock', USER_LINK_DUP);
    expect(location).toContain('link=already_linked');
    expect(await linkedProviders(page)).toEqual(['mock']);
  });

  test('🚨 남의 계정에 붙은 수단은 가져올 수 없다', async ({ page, browser }) => {
    const USER_VICTIM = freshUser('victim');
    const USER_THIEF = freshUser('thief');
    // 조용히 옮기면 원래 계정의 주문 내역이 사라지고, 그 계정으로는
    // 다시 들어갈 수 없게 됩니다.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await loginWith(otherPage, 'mock2', USER_VICTIM);
    expect(await linkedProviders(otherPage)).toEqual(['mock2']);

    await loginWith(page, 'mock', USER_THIEF);
    const location = await linkWith(page, 'mock2', USER_VICTIM);
    expect(location).toContain('link=taken');
    expect(await linkedProviders(page)).toEqual(['mock']);

    // 피해자 계정은 그대로여야 합니다.
    expect(await linkedProviders(otherPage)).toEqual(['mock2']);
    await other.close();
  });

  test('로그인하지 않았으면 연결할 수 없다', async ({ request }) => {
    const res = await request.get('/api/auth/link?provider=mock', { maxRedirects: 0 });
    expect(res.status()).toBe(401);
  });

  test('연결 도중에 세션이 바뀌지 않는다', async ({ page }) => {
    const USER_LINK_SESSION = freshUser('link-session');
    // 연결은 로그인이 아닙니다. 새 세션을 만들면 방금까지 보던 계정이
    // 아닌 다른 계정으로 넘어가게 됩니다.
    await loginWith(page, 'mock', USER_LINK_SESSION);
    const before = (await page.context().cookies()).find((c) => c.name === 'avora_session')!.value;

    await linkWith(page, 'mock2', USER_LINK_SESSION);
    const after = (await page.context().cookies()).find((c) => c.name === 'avora_session')!.value;
    expect(after).toBe(before);
  });
});

test.describe('수단을 뗀다', () => {
  test('두 개 있으면 하나를 뗄 수 있다', async ({ page }) => {
    const USER_UNLINK_TWO = freshUser('unlink-two');
    await loginWith(page, 'mock', USER_UNLINK_TWO);
    await linkWith(page, 'mock2', USER_UNLINK_TWO);
    expect((await linkedProviders(page)).sort()).toEqual(['mock', 'mock2']);

    const res = await page.request.post('/api/account/identities/unlink', {
      data: { provider: 'mock2' },
    });
    expect(res.status()).toBe(200);
    expect(await linkedProviders(page)).toEqual(['mock']);
  });

  test('🚨 마지막 하나는 뗄 수 없다', async ({ page }) => {
    const USER_UNLINK_LAST = freshUser('unlink-last');
    // 떼는 순간 그 계정에 들어갈 방법이 사라지고, 주문 내역과 배송지가
    // 아무도 닿을 수 없는 곳에 남습니다.
    await loginWith(page, 'mock', USER_UNLINK_LAST);
    const res = await page.request.post('/api/account/identities/unlink', {
      data: { provider: 'mock' },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('LAST_IDENTITY');
    expect(await linkedProviders(page)).toEqual(['mock']);
  });

  test('붙어 있지 않은 수단은 뗄 수 없다', async ({ page }) => {
    const USER_UNLINK_NONE = freshUser('unlink-none');
    await loginWith(page, 'mock', USER_UNLINK_NONE);
    const res = await page.request.post('/api/account/identities/unlink', {
      data: { provider: 'mock2' },
    });
    expect(res.status()).toBe(404);
  });

  test('로그인하지 않았으면 뗄 수 없다', async ({ request }) => {
    const res = await request.post('/api/account/identities/unlink', {
      data: { provider: 'mock' },
    });
    expect(res.status()).toBe(401);
  });

  test('마지막 하나인지 화면이 알 수 있다', async ({ page }) => {
    const USER_UNLINK_FLAG = freshUser('unlink-flag');
    await loginWith(page, 'mock', USER_UNLINK_FLAG);
    let body = await (await page.request.get('/api/account/identities')).json();
    expect(body.canUnlink, '하나뿐이면 뗄 수 없어야 합니다').toBe(false);

    await linkWith(page, 'mock2', USER_UNLINK_FLAG);
    body = await (await page.request.get('/api/account/identities')).json();
    expect(body.canUnlink).toBe(true);
  });
});

test.describe('연결도 우리가 시작한 것만 받는다', () => {
  test('state 가 다르면 거절한다', async ({ page }) => {
    const USER_LINK_STATE = freshUser('link-state');
    await loginWith(page, 'mock', USER_LINK_STATE);
    await page.request.get('/api/auth/link?provider=mock2&returnTo=%2Fko%2Faccount', {
      maxRedirects: 0,
    });
    const res = await page.request.get('/api/auth/callback/mock2?code=link-state&state=위조', {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('STATE_MISMATCH');
  });

  test('연결 후에도 외부 주소로 보내지 않는다', async ({ page }) => {
    const USER_LINK_RETURN = freshUser('link-return');
    await loginWith(page, 'mock', USER_LINK_RETURN);
    const start = await page.request.get(
      '/api/auth/link?provider=mock2&returnTo=https%3A%2F%2Fevil.example%2Fx',
      { maxRedirects: 0 },
    );
    const callback = new URL(start.headers()['location']);
    callback.searchParams.set('code', USER_LINK_RETURN);
    const done = await page.request.get(callback.href, { maxRedirects: 0 });
    expect(done.headers()['location']).not.toContain('evil.example');
  });
});

test.describe('마이페이지 화면', () => {
  test('로그인 전에는 켜진 제공자만큼 버튼이 나온다', async ({ page }) => {
    await page.goto('/ko/account');
    const buttons = page.locator('[data-login-buttons] a');
    await expect(buttons).toHaveCount(2); // mock, mock2

    const hrefs = await buttons.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
    expect(hrefs.some((h) => h.includes('provider=mock'))).toBe(true);
    // 키가 없는 제공자의 버튼은 나오면 안 됩니다.
    expect(hrefs.some((h) => h.includes('provider=google'))).toBe(false);
  });

  test('로그인하면 붙어 있는 수단이 보인다', async ({ page }) => {
    const USER = freshUser('ui-linked');
    await loginWith(page, 'mock', USER);
    await page.goto('/ko/account');

    await expect(page.locator('[data-account-signed]')).toBeVisible();
    const list = page.locator('[data-identities] li');
    await expect(list).toHaveCount(1);
    await expect(list.first()).toContainText('테스트');
  });

  test('하나뿐이면 해제 버튼이 없고 이유가 적혀 있다', async ({ page }) => {
    const USER = freshUser('ui-last');
    await loginWith(page, 'mock', USER);
    await page.goto('/ko/account');

    await expect(page.locator('[data-identities] li')).toHaveCount(1);
    await expect(page.locator('[data-identities] button')).toHaveCount(0);
    await expect(page.locator('[data-identities-note]')).toBeVisible();
  });

  test('화면에서 연결하고 해제할 수 있다', async ({ page }) => {
    const USER = freshUser('ui-flow');
    await loginWith(page, 'mock', USER);
    await page.goto('/ko/account');

    // 아직 붙이지 않은 수단의 연결 버튼
    const connect = page.locator('[data-link-buttons] a');
    await expect(connect).toHaveCount(1);
    await connect.first().click();

    await expect(page.locator('[data-identities] li')).toHaveCount(2);
    await expect(page.locator('[data-identities-state]')).toContainText('연결되었습니다');

    // 둘이 되었으니 해제 버튼이 생깁니다.
    const unlink = page.locator('[data-identities] button');
    await expect(unlink).toHaveCount(2);
    await unlink.first().click();
    await expect(page.locator('[data-identities] li')).toHaveCount(1);
  });

  test('제공자가 준 이메일이 글자로만 들어간다', async ({ page }) => {
    // 이메일은 제공자가 준 값입니다. HTML 로 넣으면 저장형 XSS 자리가 됩니다.
    const USER = freshUser('<img src=x onerror="window.__pwnedId=1">');
    await loginWith(page, 'mock', USER);
    await page.goto('/ko/account');

    await expect(page.locator('[data-identities] li')).toHaveCount(1);
    expect(
      await page.evaluate(() => (window as never as { __pwnedId?: number }).__pwnedId),
    ).toBeUndefined();
  });
});

test.describe('개인정보처리방침이 실제 수집과 맞는다', () => {
  /**
   * 기능을 켤 때마다 받는 정보가 늘어나는데, 고지가 따라오지 않으면
   * **아직 하지 않는 수집을 적거나 하고 있는 수집을 빠뜨리게** 됩니다.
   * 둘 다 틀린 고지입니다.
   */
  test('회원 기능이 켜져 있으면 계정 수집 항목이 적혀 있다', async ({ page }) => {
    await page.goto('/ko/legal/privacy');
    // 이 화면에는 표가 넷입니다 — 수집 항목 표만 봅니다.
    const table = page.locator('[data-collect]');
    await expect(table).toContainText('로그인 제공자가 준 고유 식별자');
    await expect(table).toContainText('마지막 배송지');
  });

  test('후기를 받으면 후기 수집 항목도 적혀 있다', async ({ page }) => {
    await page.goto('/ko/legal/privacy');
    await expect(page.locator('[data-collect]')).toContainText('후기 내용');
    // 후기에 이름이 어떻게 나가는지도 밝힙니다.
    await expect(page.locator('main')).toContainText('가운데를 가려');
  });

  test('5개 언어 모두 같은 개수의 수집 항목이 나온다', async ({ page }) => {
    const counts: number[] = [];
    for (const lang of ['ko', 'en', 'zh', 'th', 'vi']) {
      await page.goto(`/${lang}/legal/privacy`);
      counts.push(await page.locator('[data-collect] tbody tr').count());
    }
    expect(new Set(counts).size, `언어별 항목 수가 다릅니다: ${counts.join(', ')}`).toBe(1);
  });
});

test.describe('실패 이유는 로그에만 남고 사용자에게는 가지 않는다', () => {
  /**
   * 제공자가 준 실패 이유(KOE010 같은 것)를 버리면, 설정이 어긋났을 때
   * 서버 밖에서 따로 토큰 요청을 만들어 봐야 원인을 알 수 있습니다.
   * 실제로 카카오 Client Secret 문제를 그렇게 진단해야 했습니다.
   *
   * 그렇다고 그 값을 사용자에게 보내면 안 됩니다 — 무엇이 틀렸는지
   * 알려주는 것은 공격자에게도 알려주는 것입니다.
   */
  const realFetch = globalThis.fetch;
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function failToken(body: unknown, status = 400) {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
  }

  test('카카오 — 오류 코드가 어댑터 메시지에 담긴다', async () => {
    failToken({ error: 'invalid_client', error_code: 'KOE010', error_description: 'Bad client credentials' });
    const result = await kakaoAuth.exchange('code', 'https://x/cb', { KAKAO_REST_API_KEY: 'k' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('TOKEN_FAILED');
      expect(result.message, '실패 이유가 없으면 로그만 보고는 알 수 없습니다').toContain('KOE010');
    }
  });

  test('구글 — 오류 코드가 어댑터 메시지에 담긴다', async () => {
    failToken({ error: 'invalid_grant', error_description: 'Bad Request' });
    const result = await googleAuth.exchange('code', 'https://x/cb', {
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('invalid_grant');
  });

  test('사용자에게는 일반적인 문구만 나간다', async ({ request }) => {
    // 콜백이 실패했을 때 응답 본문에 제공자의 오류가 섞여서는 안 됩니다.
    const start = await request.get('/api/auth/login?provider=mock&returnTo=%2Fko%2Faccount', {
      maxRedirects: 0,
    });
    const callback = new URL(start.headers()['location']);
    // mock 어댑터는 fail 로 시작하는 code 에 실패를 돌려줍니다.
    callback.searchParams.set('code', 'fail-on-purpose');
    const done = await request.get(callback.href, { maxRedirects: 0 });

    expect(done.status()).toBe(502);
    const body = await done.json();
    expect(body.message).toBe('로그인에 실패했습니다. 다시 시도해 주세요.');
    // 어댑터가 남긴 상세 내용이 사용자에게 가면 안 됩니다.
    expect(JSON.stringify(body)).not.toContain('테스트용 실패');
  });
});
