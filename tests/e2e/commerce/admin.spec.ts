import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ADMIN_DEV_TOKEN } from '../../../playwright.config';

/**
 * 관리 화면과 관리 API.
 *
 * 여기서 가장 중요한 것은 기능이 아니라 **잠겨 있는지**입니다. 이 API 는
 * 주문의 연락처·배송지·요청사항을 그대로 돌려주므로, 인증 없이 한 건이라도
 * 새면 그것으로 사고입니다. 그래서 잠금 테스트를 먼저 둡니다.
 */

const UNIT_PRICE = 32000;
const AUTH = { 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN };

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function nextOrderId(): string {
  const stamp = String(20261025000000 + Math.floor(Math.random() * 999999)).padEnd(14, '0').slice(0, 14);
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `AVORA-${stamp}-${suffix}`;
}

/** 테스트가 만질 주문 하나를 실제로 만들어 둡니다. */
async function seedOrder(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const orderId = nextOrderId();
  const res = await request.post('/api/orders', {
    data: {
      orderId,
      amount: UNIT_PRICE,
      currency: 'KRW',
      locale: 'ko',
      items: [{ id: 'daily-sunscreen', qty: 1 }],
      recipientName: '김서연',
      recipientPhone: '010-2345-6789',
      postalCode: '04524',
      address1: '서울 중구 세종대로 110',
      memo: '부재 시 경비실에 맡겨주세요',
      ...overrides,
    },
  });
  expect(res.status()).toBe(200);
  return orderId;
}

/**
 * 결제까지 끝난 주문.
 *
 * 배송 상태를 만지는 테스트는 이걸 써야 합니다. 결제되지 않은 주문은
 * 발송 처리가 서버에서 막히기 때문입니다 — 돈을 받지 않은 물건이 나가면 안 됩니다.
 */
async function seedPaidOrder(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const orderId = await seedOrder(request, overrides);
  const res = await request.post('/api/payments/confirm', {
    data: { paymentKey: `ok_${orderId}`, orderId, amount: UNIT_PRICE },
  });
  expect(res.status(), '결제 처리 실패').toBe(200);
  return orderId;
}

test.describe('관리 API 는 잠겨 있다', () => {
  test('토큰 없이 목록을 볼 수 없다', async ({ request }) => {
    const res = await request.get('/api/admin/orders');
    expect(res.status()).toBe(401);

    // 거절 응답에 주문이 섞여 나가지 않아야 합니다.
    const body = await res.text();
    expect(body).not.toContain('recipientName');
  });

  test('틀린 토큰도 거절한다', async ({ request }) => {
    const res = await request.get('/api/admin/orders', {
      headers: { 'X-Admin-Dev-Token': 'wrong-token' },
    });
    expect(res.status()).toBe(401);
  });

  test('토큰 없이 배송 상태를 바꿀 수 없다', async ({ request }) => {
    const orderId = await seedOrder(request);
    const res = await request.patch(`/api/admin/orders/${orderId}`, {
      data: { fulfillment: 'shipped' },
    });
    expect(res.status()).toBe(401);

    // 그리고 실제로 아무것도 바뀌지 않았어야 합니다.
    const lookup = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-2345-6789' },
    });
    expect((await lookup.json()).order.fulfillment).toBe('unfulfilled');
  });

  test('관리 화면 페이지도 토큰 없이는 열리지 않는다', async ({ request }) => {
    const res = await request.get('/admin');
    expect(res.status()).toBe(401);
    expect(await res.text()).not.toContain('<table');
  });

  test('없는 관리 경로도 인증 뒤에 404 를 준다', async ({ request }) => {
    // 인증 없이 404 를 주면, 어떤 관리 경로가 존재하는지 밖에서 훑어볼 수 있습니다.
    const anonymous = await request.get('/api/admin/nope');
    expect(anonymous.status()).toBe(401);

    const authorized = await request.get('/api/admin/nope', { headers: AUTH });
    expect(authorized.status()).toBe(404);
  });
});

test.describe('주문 목록', () => {
  test('만든 주문이 목록에 보이고 개인정보가 함께 온다', async ({ request }) => {
    const orderId = await seedOrder(request);

    const res = await request.get(`/api/admin/orders?search=${orderId}`, { headers: AUTH });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.who).toBeTruthy();

    const order = body.orders[0];
    expect(order.id).toBe(orderId);
    expect(order.recipientName).toBe('김서연');
    // 배송하려면 연락처와 요청사항이 있어야 합니다 — 고객용 응답에는 없는 것들입니다.
    expect(order.recipientPhone).toBe('01023456789');
    expect(order.memo).toBe('부재 시 경비실에 맡겨주세요');
    expect(order.fulfillment).toBe('unfulfilled');
  });

  test('연락처로 검색할 때 하이픈이 있어도 찾는다', async ({ request }) => {
    const orderId = await seedOrder(request, { recipientPhone: '010-9999-0001' });

    // 저장은 숫자만 되어 있으므로, 검색어를 그대로 넣으면 못 찾습니다.
    const res = await request.get('/api/admin/orders?search=010-9999-0001', { headers: AUTH });
    const ids = (await res.json()).orders.map((o: { id: string }) => o.id);
    expect(ids).toContain(orderId);
  });

  test('이름으로 검색하면 그 주문만 나온다', async ({ request }) => {
    // 연락처는 숫자만 저장하므로 검색어에서 숫자만 뽑아 함께 봤는데,
    // 이름처럼 숫자가 없는 검색어에서는 그 패턴이 '%%' 가 되어 모든 행에 걸렸습니다.
    // 결과적으로 이름을 검색하면 전체 주문이 나왔습니다.
    // 두 브라우저 프로젝트가 같은 로컬 DB 를 쓰므로 이름이 겹치지 않게 합니다.
    const name = `검색대상${Math.floor(Math.random() * 1e9)}`;
    await seedOrder(request, { recipientName: name });
    await seedOrder(request, { recipientName: '다른사람' });

    const res = await request.get(`/api/admin/orders?search=${encodeURIComponent(name)}`, {
      headers: AUTH,
    });
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.orders[0].recipientName).toBe(name);
  });

  test('LIKE 와일드카드를 검색어로 넣어도 전체가 나오지 않는다', async ({ request }) => {
    // '%' 와 '_' 는 LIKE 의 와일드카드라, 그대로 넘기면 검색어가 아니라 패턴이 됩니다.
    // 이스케이프하면 글자 그대로 찾으므로, 그 글자가 없는 주문은 걸리지 않아야 합니다.
    //
    // "결과가 0건" 으로 단정하지 않습니다 — 두 브라우저 프로젝트가 같은 로컬 DB 를
    // 쓰는 데다, 다른 테스트가 밑줄이 든 이름(__pwned 같은)을 넣어 두기 때문입니다.
    // 그건 검색이 옳게 동작한 결과이지 결함이 아닙니다.
    const name = `와일드카드대조${Math.floor(Math.random() * 1e9)}`;
    await seedOrder(request, { recipientName: name });

    const all = await request.get('/api/admin/orders?limit=1', { headers: AUTH });
    const everything = (await all.json()).total;
    expect(everything).toBeGreaterThan(0);

    for (const term of ['%', '_']) {
      const res = await request.get(
        `/api/admin/orders?search=${encodeURIComponent(term)}&limit=100`,
        { headers: AUTH },
      );
      const body = await res.json();
      expect(body.total, `검색어 "${term}" 가 전체를 반환하면 안 됩니다`).toBeLessThan(everything);
      expect(
        body.orders.some((o: { recipientName: string }) => o.recipientName === name),
        `검색어 "${term}" 가 그 글자 없는 주문을 잡으면 안 됩니다`,
      ).toBe(false);
    }
  });

  test('모르는 필터 값은 오류가 아니라 무시한다', async ({ request }) => {
    const res = await request.get('/api/admin/orders?status=바나나&fulfillment=zzz', {
      headers: AUTH,
    });
    expect(res.status()).toBe(200);
  });

  test('limit 을 안 보내면 기본값 20 건이 온다', async ({ request }) => {
    // 리뷰가 잡은 결함: Number(null) 은 0 이고 0 은 정수라, "값 없음" 검사가
    // 뒤에 있으면 기본값 20 이 한 번도 쓰이지 않고 최솟값 1 이 적용됐습니다.
    // 한 페이지에 한 건만 나오는데 왜인지 알 수 없는 상태였습니다.
    for (let i = 0; i < 21; i++) await seedOrder(request);

    for (const query of ['', '?limit=', '?limit=abc']) {
      const res = await request.get(`/api/admin/orders${query}`, { headers: AUTH });
      expect((await res.json()).orders.length, `limit 쿼리: "${query}"`).toBe(20);
    }
  });

  test('한 번에 가져갈 수 있는 건수에 상한이 있다', async ({ request }) => {
    const res = await request.get('/api/admin/orders?limit=100000', { headers: AUTH });
    expect(res.status()).toBe(200);
    expect((await res.json()).orders.length).toBeLessThanOrEqual(100);
  });
});

test.describe('배송 상태 변경', () => {
  test('송장을 넣으면 발송으로 넘어가고 발송 시각이 남는다', async ({ request }) => {
    const orderId = await seedPaidOrder(request);

    const res = await request.patch(`/api/admin/orders/${orderId}`, {
      headers: AUTH,
      data: { carrier: 'CJ대한통운', trackingNumber: '1234567890' },
    });
    expect(res.status()).toBe(200);

    const { order } = await res.json();
    // 상태를 따로 안 골라도 발송으로 넘어갑니다 — 송장이 있는데 '미발송'일 수는 없습니다.
    expect(order.fulfillment).toBe('shipped');
    expect(order.shippedAt).toBeTruthy();
    expect(order.trackingNumber).toBe('1234567890');
  });

  test('고객 주문조회 화면에 배송 정보가 실제로 그려진다', async ({ page, request }) => {
    // 리뷰가 잡은 결함: API 는 송장번호를 돌려주는데 화면이 그리지 않았습니다.
    // 아래 "고객도 조회할 수 있게 된다" 테스트는 JSON 만 봐서 통과했고,
    // README 와 배송안내 페이지는 화면에 나온다고 적혀 있었습니다 — 둘 다 거짓이었습니다.
    const orderId = await seedPaidOrder(request);
    await request.patch(`/api/admin/orders/${orderId}`, {
      headers: AUTH,
      data: { fulfillment: 'shipped', carrier: '한진택배', trackingNumber: '4444333322' },
    });

    await page.goto('/ko/order/lookup');
    await page.locator('[name="orderId"]').fill(orderId);
    await page.locator('[name="phone"]').fill('010-2345-6789');
    await page.locator('[data-lookup-submit]').click();

    const result = page.locator('[data-lookup-result]');
    await expect(result).toBeVisible();
    await expect(result.locator('[data-r-fulfillment]')).toHaveText('발송');
    await expect(result.locator('[data-r-tracking]')).toContainText('한진택배');
    await expect(result.locator('[data-r-tracking]')).toContainText('4444333322');
  });

  test('발송 전에는 배송 정보 줄을 아예 감춘다', async ({ page, request }) => {
    // "택배사: —" 가 보이면 뭔가 잘못됐다고 읽습니다.
    const orderId = await seedOrder(request);

    await page.goto('/ko/order/lookup');
    await page.locator('[name="orderId"]').fill(orderId);
    await page.locator('[name="phone"]').fill('010-2345-6789');
    await page.locator('[data-lookup-submit]').click();

    await expect(page.locator('[data-lookup-result]')).toBeVisible();
    await expect(page.locator('[data-r-fulfillment]')).toHaveText('미발송');
    await expect(page.locator('[data-r-shipping-row]')).toBeHidden();
  });

  test('고객도 송장번호를 조회할 수 있게 된다', async ({ request }) => {
    const orderId = await seedPaidOrder(request);
    await request.patch(`/api/admin/orders/${orderId}`, {
      headers: AUTH,
      data: { fulfillment: 'shipped', carrier: '롯데택배', trackingNumber: '9876543210' },
    });

    const lookup = await request.post('/api/orders/lookup', {
      data: { orderId, phone: '010-2345-6789' },
    });
    const order = (await lookup.json()).order;
    expect(order.carrier).toBe('롯데택배');
    expect(order.trackingNumber).toBe('9876543210');
    // 관리 메모는 내부용이라 고객에게 나가면 안 됩니다.
    expect(order.adminMemo).toBeUndefined();
  });

  test('발송을 되돌리면 발송 시각도 지워진다', async ({ request }) => {
    const orderId = await seedPaidOrder(request);
    await request.patch(`/api/admin/orders/${orderId}`, {
      headers: AUTH,
      data: { fulfillment: 'shipped', trackingNumber: '111' },
    });

    // 잘못 눌렀을 때 되돌릴 수 있어야 하고, 되돌렸으면 흔적도 맞아야 합니다.
    const res = await request.patch(`/api/admin/orders/${orderId}`, {
      headers: AUTH,
      data: { fulfillment: 'preparing' },
    });
    const { order } = await res.json();
    expect(order.fulfillment).toBe('preparing');
    expect(order.shippedAt).toBeNull();
  });

  test('모르는 배송 상태는 거절한다', async ({ request }) => {
    const orderId = await seedOrder(request);
    const res = await request.patch(`/api/admin/orders/${orderId}`, {
      headers: AUTH,
      data: { fulfillment: 'teleported' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('INVALID_FULFILLMENT');
  });

  test('없는 주문은 404 다', async ({ request }) => {
    const res = await request.patch(`/api/admin/orders/${nextOrderId()}`, {
      headers: AUTH,
      data: { fulfillment: 'shipped' },
    });
    expect(res.status()).toBe(404);
  });

  test('바꿀 내용이 없으면 알려준다', async ({ request }) => {
    const orderId = await seedOrder(request);
    const res = await request.patch(`/api/admin/orders/${orderId}`, {
      headers: AUTH,
      data: {},
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('NOTHING_TO_UPDATE');
  });

  test('null 을 보내면 지운다', async ({ request }) => {
    const orderId = await seedPaidOrder(request);
    await request.patch(`/api/admin/orders/${orderId}`, {
      headers: AUTH,
      data: { carrier: 'CJ대한통운', trackingNumber: '222' },
    });

    const res = await request.patch(`/api/admin/orders/${orderId}`, {
      headers: AUTH,
      data: { carrier: null, trackingNumber: null },
    });
    const { order } = await res.json();
    expect(order.carrier).toBeNull();
    expect(order.trackingNumber).toBeNull();
  });
});

test.describe('관리 화면', () => {
  // 페이지는 Worker 가 인증한 뒤에야 나가므로, 브라우저 컨텍스트에도 토큰이 필요합니다.
  test.use({ extraHTTPHeaders: AUTH });

  test('주문이 표에 뜨고 상세를 열어 발송 처리할 수 있다', async ({ page, request }) => {
    const orderId = await seedPaidOrder(request);

    await page.goto('/admin');
    await page.locator('[data-filters] [name="search"]').fill(orderId);
    await page.locator('[data-filters] [name="search"]').press('Enter');

    const row = page.locator('[data-rows] tr', { hasText: orderId });
    await expect(row).toBeVisible();

    await row.click();
    const detail = page.locator('[data-detail]');
    await expect(detail).toBeVisible();
    await expect(page.locator('[data-d-phone]')).toContainText('2345');

    await detail.locator('[name="fulfillment"]').selectOption('shipped');
    await detail.locator('[name="carrier"]').fill('CJ대한통운');
    await detail.locator('[name="trackingNumber"]').fill('5555555555');
    await detail.locator('[data-save]').click();

    await expect(detail).toBeHidden();
    // '미발송' 도 '발송' 을 포함하므로 부분 일치로는 구분되지 않습니다.
    await expect(row.locator('.pill').last()).toHaveText('발송');
  });

  test('고객 이름에 담긴 HTML 이 실행되지 않는다', async ({ page, request }) => {
    // 리뷰가 잡은 결함: 표를 innerHTML 로 그리면서 수령인 이름을 그대로 넣었습니다.
    // 이름은 인증 없이 누구나 주문 API 로 보낼 수 있고, 이 화면은 Access 를 통과한
    // 관리자 세션 안입니다. 실제로 window.__pwned 가 세팅되는 것을 확인했습니다.
    // 여기서 뚫리면 전 고객의 연락처와 주소가 그대로 새 나갑니다.
    const orderId = await seedOrder(request, {
      recipientName: '<img src=x onerror="window.__pwned=1">',
    });

    await page.goto('/admin');
    await page.locator('[data-filters] [name="search"]').fill(orderId);
    await page.locator('[data-filters] [name="search"]').press('Enter');

    const row = page.locator('[data-rows] tr', { hasText: orderId });
    await expect(row).toBeVisible();

    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
    // 태그가 아니라 글자로 보여야 합니다.
    await expect(row).toContainText('<img src=x');
    await expect(row.locator('img')).toHaveCount(0);
  });

  test('상세 패널에서도 실행되지 않는다', async ({ page, request }) => {
    const orderId = await seedOrder(request, {
      recipientName: '<img src=x onerror="window.__pwned2=1">',
      address1: '<svg onload="window.__pwned2=1">서울 중구 세종대로 110',
    });

    await page.goto('/admin');
    await page.locator('[data-filters] [name="search"]').fill(orderId);
    await page.locator('[data-filters] [name="search"]').press('Enter');
    await page.locator('[data-rows] tr', { hasText: orderId }).click();

    await expect(page.locator('[data-detail]')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__pwned2)).toBeUndefined();
  });

  test('검색엔진에 잡히지 않는다', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/,
    );
  });
});

test.describe('Access 설정이 어긋났을 때 무엇이 잘못됐는지 알려준다', () => {
  /**
   * Cloudflare Access 를 붙일 때 가장 빠지기 쉬운 함정을 재현합니다.
   *
   * Access 애플리케이션을 `/admin` 에만 걸고 `/api/admin` 을 빠뜨리면,
   * 사람은 로그인에 성공해 화면까지 옵니다. 그런데 Cloudflare 는
   * `Cf-Access-Jwt-Assertion` 헤더를 **Access 가 덮는 경로에만** 붙이므로
   * 화면이 부르는 API 에는 토큰이 없습니다.
   *
   * 이때 "로그인이 필요합니다" 라고 안내하면, 이미 로그인한 사람을 로그인
   * 화면으로 무한히 돌려보내게 됩니다. 진짜 원인은 경로 설정입니다.
   */
  test.use({ extraHTTPHeaders: AUTH });

  test('화면은 열렸는데 API 에만 토큰이 없으면 경로 설정을 지목한다', async ({ page }) => {
    // 페이지 요청에는 토큰이 붙고, /api/admin 요청에서만 떼어냅니다.
    await page.route('**/api/admin/**', async (route) => {
      const headers = { ...route.request().headers() };
      delete headers['x-admin-dev-token'];
      await route.continue({ headers });
    });

    await page.goto('/admin');

    const state = page.locator('[data-state]');
    await expect(state).toBeVisible();
    await expect(state).toContainText('/api/admin');
    // 이미 로그인한 사람에게 다시 로그인하라고 하지 않습니다.
    await expect(state).not.toContainText('로그인이 필요합니다');
  });
});

test.describe('운영 배포 설정에 Access 가 실제로 들어 있다', () => {
  /**
   * 이 테스트가 보는 것은 **로컬 서버가 아니라 배포 설정 파일**입니다.
   *
   * Cloudflare Access 는 요청이 Worker 에 닿기 전에 Cloudflare 가 처리하는
   * 것이라 `wrangler dev` 로는 재현할 수 없습니다. 그래서 위의 테스트들은
   * 전부 개발용 토큰으로 돕니다 — 즉 **운영에 Access 가 설정돼 있는지는
   * 아무도 확인하지 않습니다.**
   *
   * 설정이 비면 화면은 잠긴 채로 있으므로(열리지 않으므로) 정보가 새지는
   * 않습니다. 대신 주문이 들어와도 아무도 못 여는 상태가 조용히 지속됩니다.
   * 그래서 여기서 파일을 직접 읽어 확인합니다.
   */
  const wrangler = readFileSync(new URL('../../../wrangler.jsonc', import.meta.url), 'utf-8');
  const varOf = (name: string): string | null => {
    const m = wrangler.match(new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`));
    return m ? m[1] : null;
  };

  test('팀 도메인과 AUD 가 둘 다 있다', () => {
    // 하나만 있으면 worker/admin.ts 는 "미설정" 으로 보고 잠급니다.
    expect(varOf('ACCESS_TEAM_DOMAIN'), 'ACCESS_TEAM_DOMAIN 이 없습니다').toBeTruthy();
    expect(varOf('ACCESS_POLICY_AUD'), 'ACCESS_POLICY_AUD 가 없습니다').toBeTruthy();
  });

  test('팀 도메인 형식이 JWT 의 issuer 와 맞는다', () => {
    // jwtVerify 가 issuer 를 문자열 그대로 비교하므로 끝 슬래시 하나로 어긋납니다.
    const domain = varOf('ACCESS_TEAM_DOMAIN')!;
    expect(domain).toMatch(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/);
  });

  test('AUD 가 애플리케이션 태그 형식이다', () => {
    // 64자 16진수입니다. 다른 값을 넣으면 로그인은 되는데 검증에서 떨어집니다.
    expect(varOf('ACCESS_POLICY_AUD')!).toMatch(/^[0-9a-f]{64}$/);
  });

  test('테스트 전용 열쇠가 배포 설정에 섞여 있지 않다', () => {
    // 배포 전 점검(.github/workflows/deploy.yml)도 같은 것을 보지만,
    // 그건 푸시한 뒤에야 돕니다. 여기서 먼저 걸립니다.
    expect(wrangler).not.toContain('ADMIN_DEV_TOKEN');
  });
});
