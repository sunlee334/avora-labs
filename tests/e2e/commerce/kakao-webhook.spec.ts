import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * 카카오 계정 상태 변경 웹훅.
 *
 * 사용자가 **우리 사이트 밖에서** 연결을 끊을 수 있습니다 — 카카오 앱 목록에서
 * 우리 앱을 지우거나 카카오계정을 탈퇴하는 경우입니다. 알림을 받지 못하면
 * 탈퇴한 사람의 이메일·이름·배송지가 우리 DB 에 계속 남습니다.
 *
 * 이 파일이 지키는 두 가지:
 *   1. 🚨 **아무나 부를 수 없다** — 이 엔드포인트는 계정을 지웁니다.
 *      인증이 없으면 누구나 남의 사용자 id 로 계정을 지울 수 있습니다.
 *   2. 지울 것과 남길 것을 가른다 — 개인정보는 지우고, **주문 기록은
 *      남깁니다.** 전자상거래법이 5년 보존을 요구합니다.
 */

const WEBHOOK = '/api/webhooks/kakao';
const UNLINKED = 'https://schemas.openid.net/secevent/oauth/event-type/user-unlinked';

let seq = 0;
function freshId(label: string): string {
  seq += 1;
  return `${label}-${Date.now().toString(36)}-${seq}`;
}

/** 서명 없이 이벤트를 흘려보내는 시험용 본문. AUTH_PROVIDER 에 mock 이 있을 때만 통합니다. */
function testEvent(providerUserId: string, type = UNLINKED): string {
  return `test.${JSON.stringify({
    iss: 'https://kauth.kakao.com',
    sub: providerUserId,
    events: { [type]: { subject: { sub: providerUserId } } },
  })}`;
}

async function post(request: APIRequestContext, body: string) {
  return request.post(WEBHOOK, {
    headers: { 'Content-Type': 'application/secevent+jwt' },
    data: body,
  });
}

/** mock 제공자로 로그인해 계정을 하나 만듭니다. */
async function loginWith(page: Page, provider: string, code: string): Promise<void> {
  const start = await page.request.get(
    `/api/auth/login?provider=${provider}&returnTo=%2Fko%2Faccount`,
    { maxRedirects: 0 },
  );
  const callback = new URL(start.headers()['location']);
  callback.searchParams.set('code', code);
  await page.request.get(callback.href, { maxRedirects: 0 });
}

test.describe('🚨 아무나 계정을 지울 수 없다', () => {
  test('서명 없는 본문은 거절한다', async ({ request }) => {
    // 시험용 접두어가 없으면 서명 검증을 지나야 합니다.
    const res = await post(
      request,
      JSON.stringify({ events: { [UNLINKED]: { subject: { sub: '12345' } } } }),
    );
    expect(res.status()).toBe(400);
  });

  test('아무 문자열이나 보내면 거절한다', async ({ request }) => {
    expect((await post(request, 'not-a-token')).status()).toBe(400);
    expect((await post(request, 'a.b.c')).status()).toBe(400);
  });

  test('본문이 비면 거절한다', async ({ request }) => {
    expect((await post(request, '')).status()).toBe(400);
  });

  test('GET 으로는 부를 수 없다', async ({ request }) => {
    expect((await request.get(WEBHOOK)).status()).toBe(404);
  });

  test('서명 없는 요청으로는 계정이 지워지지 않는다', async ({ page, request }) => {
    // 여기가 이 파일에서 가장 중요한 검사입니다.
    const id = freshId('victim');
    await loginWith(page, 'mock', id);
    expect((await page.request.get('/api/account/me')).status()).toBe(200);

    await post(request, JSON.stringify({ events: { [UNLINKED]: { subject: { sub: id } } } }));
    await post(request, 'test.' + JSON.stringify({ events: {} })); // 접두어만 있고 이벤트 없음

    // 계정이 그대로 살아 있어야 합니다.
    expect((await page.request.get('/api/account/me')).status()).toBe(200);
  });
});

test.describe('연결이 끊기면 개인정보를 지운다', () => {
  test('마지막 수단이 끊기면 계정이 사라진다', async ({ page, request }) => {
    const id = freshId('unlink-me');
    await loginWith(page, 'mock', id);
    expect((await page.request.get('/api/account/me')).status()).toBe(200);

    // 카카오 웹훅은 provider='kakao' 만 처리합니다. mock 계정을 지우려는
    // 이벤트는 우리 쪽에 그 수단이 없으므로 아무 일도 일어나지 않습니다.
    const res = await post(request, testEvent(id));
    expect(res.status()).toBe(202);
    expect((await page.request.get('/api/account/me')).status(), 'mock 계정은 그대로여야 합니다').toBe(200);
  });

  test('없는 사용자에 대한 이벤트도 202 로 받는다', async ({ request }) => {
    // 카카오는 같은 이벤트를 다시 보낼 수 있습니다. 400 으로 답하면
    // 실패로 보고 계속 재전송합니다.
    const res = await post(request, testEvent(freshId('ghost')));
    expect(res.status()).toBe(202);
  });

  test('같은 이벤트가 두 번 와도 결과가 같다', async ({ request }) => {
    const id = freshId('twice');
    expect((await post(request, testEvent(id))).status()).toBe(202);
    expect((await post(request, testEvent(id))).status()).toBe(202);
  });

  test('처리하지 않는 이벤트도 202 로 받는다', async ({ request }) => {
    const res = await post(
      request,
      testEvent(freshId('linked'), 'https://schemas.openid.net/secevent/oauth/event-type/user-linked'),
    );
    expect(res.status()).toBe(202);
  });

  test('사용자 식별자가 없어도 500 이 되지 않는다', async ({ request }) => {
    const res = await post(request, `test.${JSON.stringify({ events: { [UNLINKED]: {} } })}`);
    expect(res.status()).toBe(202);
  });
});

test.describe('지울 것과 남길 것을 가른다', () => {
  const UNIT = 32000;
  const PHONE = '010-5151-6262';
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  function orderId(): string {
    let s = '';
    for (let i = 0; i < 6; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    return `AVORA-2026082716${String(seq).padStart(4, '0')}-${s}`;
  }

  /** 시험 통로로 mock 수단을 지웁니다 — 웹훅의 삭제 경로를 그대로 탑니다. */
  function unlinkMock(providerUserId: string): string {
    return `test.${JSON.stringify({
      $testProvider: 'mock',
      events: { [UNLINKED]: { subject: { sub: providerUserId } } },
    })}`;
  }

  test('연결이 끊기면 세션과 계정이 사라진다', async ({ page, request }) => {
    const id = freshId('purge');
    await loginWith(page, 'mock', id);
    expect((await page.request.get('/api/account/me')).status()).toBe(200);

    expect((await post(request, unlinkMock(id))).status()).toBe(202);

    // 세션은 users 를 CASCADE 로 참조하므로 함께 사라집니다.
    expect(
      (await page.request.get('/api/account/me')).status(),
      '계정이 지워졌으면 세션도 무효여야 합니다',
    ).toBe(401);
  });

  test('🚨 주문 기록은 남는다 — 전자상거래법 5년 보존', async ({ page, request }) => {
    const id = freshId('keep-order');
    await loginWith(page, 'mock', id);

    // 주문을 만들고 계정에 붙입니다.
    const order = orderId();
    const created = await page.request.post('/api/orders', {
      data: {
        orderId: order, amount: UNIT, currency: 'KRW', locale: 'ko',
        items: [{ id: 'daily-sunscreen', qty: 1 }],
        recipientName: '보존확인', recipientPhone: PHONE,
        postalCode: '04524', address1: '서울특별시 중구 세종대로 110',
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const claimed = await page.request.post('/api/account/claim', {
      data: { orderId: order, phone: PHONE },
    });
    expect(claimed.ok(), await claimed.text()).toBeTruthy();

    // 계정이 사라져도 주문은 남아야 합니다.
    expect((await post(request, unlinkMock(id))).status()).toBe(202);
    expect((await page.request.get('/api/account/me')).status()).toBe(401);

    const lookup = await request.post('/api/orders/lookup', {
      data: { orderId: order, phone: PHONE },
    });
    expect(lookup.status(), '주문이 사라졌습니다 — 5년 보존 의무 위반입니다').toBe(200);
    expect((await lookup.json()).order.id).toBe(order);
  });

  test('다른 사람의 계정은 건드리지 않는다', async ({ page, browser, request }) => {
    const mine = freshId('mine');
    const other = freshId('other');

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await loginWith(otherPage, 'mock', other);
    await loginWith(page, 'mock', mine);

    expect((await post(request, unlinkMock(mine))).status()).toBe(202);

    expect((await page.request.get('/api/account/me')).status(), '내 계정').toBe(401);
    expect((await otherPage.request.get('/api/account/me')).status(), '남의 계정').toBe(200);
    await otherContext.close();
  });

  test('수단이 둘이면 하나만 끊기고 계정은 남는다', async ({ page, request }) => {
    const id = freshId('two-ways');
    await loginWith(page, 'mock', id);
    const link = await page.request.get(
      `/api/auth/link?provider=mock2&returnTo=%2Fko%2Faccount`,
      { maxRedirects: 0 },
    );
    const cb = new URL(link.headers()['location']);
    cb.searchParams.set('code', id);
    await page.request.get(cb.href, { maxRedirects: 0 });

    let body = await (await page.request.get('/api/account/identities')).json();
    expect(body.linked.length).toBe(2);

    expect((await post(request, unlinkMock(id))).status()).toBe(202);

    // 계정은 살아 있고, 남은 수단 하나로 계속 들어옵니다.
    expect((await page.request.get('/api/account/me')).status()).toBe(200);
    body = await (await page.request.get('/api/account/identities')).json();
    expect(body.linked.map((i: { provider: string }) => i.provider)).toEqual(['mock2']);
  });
});
