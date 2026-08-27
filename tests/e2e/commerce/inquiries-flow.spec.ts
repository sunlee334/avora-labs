import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN_DEV_TOKEN } from '../../../playwright.config';

/**
 * 문의 왕복.
 *
 * ── 명세가 요구한 완료 조건입니다 ───────────────────────────
 * "기술 완결성 + 문의가 한 번 왔다 가는 것". API 가 200 을 돌려주는 것과
 * **손님이 화면에서 답을 읽는 것**은 다릅니다. 그 사이에 마운트·자격증명·
 * 렌더가 있고, 어느 하나가 어긋나면 API 는 멀쩡한데 화면은 비어 있습니다.
 *
 * 두 경로를 모두 봅니다.
 *   로그인    /account       세션 쿠키로
 *   주문번호   /order/lookup   조회에 성공한 뒤에야 폼이 나타남
 */

const AUTH = { 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN };
const UNIT_PRICE = 32000;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function nextOrderId(): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const stamp = String(20261025000000 + Math.floor(Math.random() * 999999))
    .padEnd(14, '0')
    .slice(0, 14);
  return `AVORA-${stamp}-${suffix}`;
}

/** 실행마다 다른 제목. 로컬 D1 은 실행 간에 남아 같은 제목이 쌓입니다. */
function freshSubject(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

function freshPhone(): string {
  return `010${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
}

async function seedOrder(request: APIRequestContext, phone: string): Promise<string> {
  const orderId = nextOrderId();
  const res = await request.post('/api/orders', {
    data: {
      orderId,
      amount: UNIT_PRICE,
      currency: 'KRW',
      locale: 'ko',
      items: [{ id: 'daily-sunscreen', qty: 1 }],
      recipientName: '문의왕복',
      recipientPhone: phone,
      postalCode: '04039',
      address1: '서울특별시 마포구',
    },
  });
  expect(res.status(), `주문 생성 실패: ${await res.text()}`).toBe(200);
  return orderId;
}

/**
 * mock 제공자로 로그인합니다.
 *
 * 버튼을 누르는 대신 인가 흐름을 직접 태웁니다 — `mypage.spec.ts` 가 쓰는
 * 방식이고, code 를 우리가 정하므로 매번 다른 사람이 됩니다(병렬 실행에서
 * 서로의 문의를 보지 않게).
 */
async function signIn(page: Page, code: string): Promise<void> {
  const start = await page.request.get(
    '/api/auth/login?provider=mock&returnTo=%2Fko%2Faccount',
    { maxRedirects: 0 },
  );
  const cb = new URL(start.headers()['location']);
  cb.searchParams.set('code', code);
  await page.request.get(cb.href, { maxRedirects: 0 });
  await page.goto('/ko/account');
}

test.describe('주문번호로 남기고 답을 읽는다', () => {
  test('조회 전에는 문의 폼이 없다', async ({ page }) => {
    // 주문번호를 모르면 문의를 남길 곳도 없습니다. 폼만 먼저 띄우면
    // 무엇을 근거로 남기는지가 흐려집니다.
    await page.goto('/ko/order/lookup');
    await expect(page.locator('[data-inquiry-form]')).toBeHidden();
  });

  test('조회 → 문의 → 답변 → 화면에서 확인', async ({ page, request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);

    await page.goto('/ko/order/lookup');
    await page.fill('input[name="orderId"]', orderId);
    await page.fill('input[name="phone"]', phone);
    await page.click('[data-lookup-submit]');

    // 조회에 성공하면 문의 섹션이 나타납니다.
    const form = page.locator('[data-inquiry-form]');
    await expect(form).toBeVisible();

    await page.fill('#inq-subject', '배송 언제 되나요');
    await page.fill('#inq-body', '주문한 지 며칠 지났는데 아직 소식이 없어 여쭙습니다.');
    await page.click('[data-inquiry-submit]');

    // 방금 남긴 것이 목록에 보여야 "받았다" 가 사실이 됩니다.
    const list = page.locator('[data-inquiry-list]');
    await expect(list).toContainText('배송 언제 되나요');
    await expect(list.locator('[data-status="open"]')).toBeVisible();

    // 관리자가 답합니다.
    const { inquiries } = await (
      await request.post('/api/inquiries/lookup', { data: { orderId, phone } })
    ).json();
    const answered = await request.patch(`/api/admin/inquiries/${inquiries[0].id}`, {
      headers: AUTH,
      data: { answer: '오늘 발송했습니다. 송장번호는 주문 조회에서 보실 수 있습니다.' },
    });
    expect(answered.status()).toBe(200);

    // 손님이 다시 조회하면 답이 보입니다.
    await page.reload();
    await page.fill('input[name="orderId"]', orderId);
    await page.fill('input[name="phone"]', phone);
    await page.click('[data-lookup-submit]');

    await expect(list).toContainText('오늘 발송했습니다');
    await expect(list.locator('[data-status="answered"]')).toBeVisible();
  });

  test('본문이 짧으면 보내기 전에 막는다', async ({ page, request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);

    await page.goto('/ko/order/lookup');
    await page.fill('input[name="orderId"]', orderId);
    await page.fill('input[name="phone"]', phone);
    await page.click('[data-lookup-submit]');
    await expect(page.locator('[data-inquiry-form]')).toBeVisible();

    await page.fill('#inq-subject', '가');
    await page.fill('#inq-body', '짧음');
    await page.click('[data-inquiry-submit]');

    await expect(page.locator('[data-inquiry-error]')).toBeVisible();
  });
});

test.describe('로그인해서 남기고 답을 읽는다', () => {
  test('주문이 없어도 남길 수 있다 — 구매 전 질문', async ({ page, request }) => {
    await signIn(page, `inq-${Date.now()}-${Math.floor(Math.random() * 100000)}`);

    const form = page.locator('[data-inquiry-form]');
    await expect(form).toBeVisible();

    await page.fill('#inq-subject', '사기 전에 묻습니다');
    await page.fill('#inq-body', '지성 피부에도 괜찮은지 알고 싶어 여쭙습니다.');
    await page.click('[data-inquiry-submit]');

    const list = page.locator('[data-inquiry-list]');
    await expect(list).toContainText('사기 전에 묻습니다');

    // 관리 목록에서 찾아 답합니다.
    const admin = await (
      await request.get('/api/admin/inquiries?status=open', { headers: AUTH })
    ).json();
    const mine = admin.inquiries.find((i: any) => i.subject === '사기 전에 묻습니다');
    expect(mine, '관리 화면에 문의가 안 보입니다').toBeTruthy();
    expect(mine.orderId, '구매 전 질문에는 주문번호가 없습니다').toBeNull();

    await request.patch(`/api/admin/inquiries/${mine.id}`, {
      headers: AUTH,
      data: { answer: '지성 피부에도 쓰실 수 있습니다.' },
    });

    await page.reload();
    await expect(list).toContainText('지성 피부에도 쓰실 수 있습니다');
  });

  test('로그인하지 않으면 문의 폼이 안 보인다', async ({ page }) => {
    await page.goto('/ko/account');
    await expect(page.locator('[data-inquiry-form]')).toBeHidden();
  });
});

test.describe('남이 쓴 글이 실행되지 않는다', () => {
  test('문의 본문의 스크립트가 실행되지 않는다', async ({ page, request }) => {
    /*
     * 문의 본문은 인증 없이 누구나 넣는 문자열입니다. innerHTML 로 넣으면
     * 그대로 실행됩니다 — 관리 화면에서 수령인 이름을 그렇게 넣었다가
     * 고친 적이 있습니다(`admin.spec.ts` 의 같은 검사).
     */
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    const payload = '<img src=x onerror="window.__pwned = true"> 열 자가 넘는 본문입니다.';

    await request.post('/api/inquiries', {
      data: { orderId, phone, subject: '<script>window.__pwned=true</script>', body: payload },
    });

    await page.goto('/ko/order/lookup');
    await page.fill('input[name="orderId"]', orderId);
    await page.fill('input[name="phone"]', phone);
    await page.click('[data-lookup-submit]');
    await expect(page.locator('[data-inquiry-list]')).toBeVisible();

    expect(await page.evaluate(() => (window as any).__pwned), '스크립트가 실행됐습니다').toBeUndefined();
    // 그리고 글자 그대로 보여야 합니다 — 지워 버리면 무엇을 썼는지 모릅니다.
    await expect(page.locator('[data-inquiry-list]')).toContainText('onerror');
  });
});

test.describe('관리 화면 문의 탭', () => {
  test.use({ extraHTTPHeaders: AUTH });

  test('탭을 눌러야 문의가 보인다', async ({ page }) => {
    await page.goto('/admin');
    // 처음에는 주문 탭입니다.
    await expect(page.locator('[data-panel="orders"]')).toBeVisible();
    await expect(page.locator('[data-panel="inquiries"]')).toBeHidden();

    await page.click('[data-tab="inquiries"]');
    await expect(page.locator('[data-panel="inquiries"]')).toBeVisible();
    await expect(page.locator('[data-panel="orders"]')).toBeHidden();
  });

  test('두 탭이 표를 공유하지 않는다', async ({ page, request }) => {
    /*
     * 같은 [data-rows] 를 쓰면 탭을 오갈 때 한쪽 데이터가 다른 쪽 표에
     * 남습니다. 화면만 봐서는 알아채기 어려운 상태입니다.
     */
    const subject = freshSubject('탭 분리 시험');
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    await request.post('/api/inquiries', {
      data: { orderId, phone, subject, body: '표가 섞이지 않는지 봅니다.' },
    });

    await page.goto('/admin');
    await expect(page.locator('[data-rows] tr').first()).toBeVisible();

    await page.click('[data-tab="inquiries"]');
    await expect(page.locator('[data-inq-rows]')).toContainText(subject);
    // 주문 표는 그대로 남아 있되 감춰져 있어야 합니다.
    await expect(page.locator('[data-inq-rows]')).not.toContainText('AVORA-');
  });

  test('답하면 목록에서 사라진다 — 미답변 필터', async ({ page, request }) => {
    const subject = freshSubject('관리 답변 시험');
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    const created = await (
      await request.post('/api/inquiries', {
        data: { orderId, phone, subject, body: '여기서 답을 달아 봅니다.' },
      })
    ).json();

    await page.goto('/admin');
    await page.click('[data-tab="inquiries"]');
    await expect(page.locator('[data-inq-rows]')).toContainText(subject);

    // 행을 눌러 상세를 엽니다.
    await page.locator('[data-inq-rows] tr', { hasText: subject }).click();
    await expect(page.locator('[data-inq-detail]')).toBeVisible();
    await expect(page.locator('[data-inq-d-body]')).toContainText('여기서 답을 달아 봅니다');

    await page.fill('#inq-answer', '확인했습니다. 오늘 중으로 발송하겠습니다.');
    await page.click('[data-inq-save]');

    // 미답변 필터이므로 목록에서 빠집니다.
    await expect(page.locator('[data-inq-rows]')).not.toContainText(subject);

    // 그리고 손님 쪽에 실제로 전달됐는지.
    const { inquiries } = await (
      await request.post('/api/inquiries/lookup', { data: { orderId, phone } })
    ).json();
    expect(inquiries[0].answer.body).toContain('오늘 중으로 발송하겠습니다');
    expect(created.inquiry.id).toBe(inquiries[0].id);
  });

  test('이미 답한 문의는 답변 폼이 닫혀 있다', async ({ page, request }) => {
    // 쓸 수 있게 두었다가 409 로 거절하는 것은 답을 두 번 쓰게 만드는 일입니다.
    const subject = freshSubject('이미 답한 문의');
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    const created = await (
      await request.post('/api/inquiries', {
        data: { orderId, phone, subject, body: '답이 달린 상태를 봅니다.' },
      })
    ).json();
    await request.patch(`/api/admin/inquiries/${created.inquiry.id}`, {
      data: { answer: '먼저 단 답변입니다.' },
    });

    await page.goto('/admin');
    await page.click('[data-tab="inquiries"]');
    await page.selectOption('#inq-status', 'answered');
    await page.click('[data-inq-filters] button[type="submit"]');
    await expect(page.locator('[data-inq-rows]')).toContainText(subject);

    await page.locator('[data-inq-rows] tr', { hasText: subject }).click();
    await expect(page.locator('[data-inq-answered]')).toBeVisible();
    await expect(page.locator('[data-inq-d-answer]')).toContainText('먼저 단 답변입니다');
    await expect(page.locator('[data-inq-form]')).toBeHidden();
  });

  test('손님이 쓴 글이 관리 화면에서도 실행되지 않는다', async ({ page, request }) => {
    const phone = freshPhone();
    const orderId = await seedOrder(request, phone);
    await request.post('/api/inquiries', {
      data: {
        orderId,
        phone,
        subject: '<img src=x onerror="window.__admin_pwned=true">',
        body: '<script>window.__admin_pwned = true</script> 열 자가 넘는 본문입니다.',
      },
    });

    await page.goto('/admin');
    await page.click('[data-tab="inquiries"]');
    await expect(page.locator('[data-inq-rows] tr').first()).toBeVisible();
    await page.locator('[data-inq-rows] tr').first().click();
    await expect(page.locator('[data-inq-detail]')).toBeVisible();

    expect(await page.evaluate(() => (window as any).__admin_pwned)).toBeUndefined();
  });
});
