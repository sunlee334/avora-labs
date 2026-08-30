import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN_DEV_TOKEN, TEST_HEADERS } from '../../../playwright.config';
import ko from '../../../src/i18n/ko.json' with { type: 'json' };

/**
 * 문자·알림톡 수신 동의 — 주문 단계.
 *
 * 기획안 9-5: 이메일 수신 동의는 알림 신청 폼에서 이미 받고 있지만, 문자와
 * 알림톡은 **별도 항목** 이라 주문 단계에서 따로 받아야 9-3 의 재구매 안내를
 * 알림톡으로 보낼 수 있습니다.
 *
 * 이 파일이 지키는 것은 하나로 요약됩니다 — **묶이지 않았는가.**
 * 필수 동의와 한 칸으로 묶이면 "주문하려면 광고도 받아야 한다" 가 되고,
 * 그건 동의를 받은 것이 아닙니다.
 */

const LANGS = ['ko', 'en', 'zh', 'th', 'vi'] as const;

const ALPHABET = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789';

/** 주문번호는 서버가 형식을 검사합니다 — AVORA-{14자리}-{6자리}. */
function nextOrderId(): string {
  const stamp = String(20261025000000 + Math.floor(Math.random() * 999999));
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `AVORA-${stamp.padEnd(14, '0').slice(0, 14)}-${suffix}`;
}

function draft(marketingSms?: unknown) {
  return {
    orderId: nextOrderId(),
    amount: 32000,
    currency: 'KRW',
    locale: 'ko',
    items: [{ id: 'daily-sunscreen', name: 'Daily Sunscreen', qty: 1, unitPrice: 32000 }],
    recipientName: '홍길동',
    recipientPhone: '010-1234-5678',
    postalCode: '04524',
    address1: '서울 중구 세종대로 110',
    ...(marketingSms === undefined ? {} : { marketingSms }),
  };
}

async function findOrder(request: APIRequestContext, orderId: string) {
  const res = await request.get('/api/admin/orders?limit=50&offset=0', {
    headers: { ...TEST_HEADERS, 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN },
  });
  expect(res.status(), '관리 주문 목록을 읽지 못했습니다').toBe(200);
  // 이 API 는 `rows` 가 아니라 `orders` 로 돌려줍니다 — 명단 API 와 다릅니다.
  const data = (await res.json()) as { orders: Array<Record<string, unknown>> };
  return data.orders.find((r) => r.id === orderId);
}

test.describe('화면 — 두 동의가 갈라져 있다', () => {
  test('5개 언어 모두 선택 동의 칸이 따로 있다', async ({ page }) => {
    for (const lang of LANGS) {
      await page.goto(`/${lang}/checkout`);
      await expect(page.locator('input[name="agree"]'), lang).toHaveCount(1);
      await expect(page.locator('input[name="marketingSms"]'), lang).toHaveCount(1);
    }
  });

  test('필수는 필수이고 선택은 선택이다', async ({ page }) => {
    // 이 한 줄이 이 기능의 전부입니다. 선택 칸에 required 가 붙는 순간
    // 두 동의를 나눈 의미가 사라집니다.
    await page.goto('/ko/checkout');
    await expect(page.locator('input[name="agree"]')).toHaveAttribute('required', '');
    await expect(page.locator('input[name="marketingSms"]')).not.toHaveAttribute('required', '');
  });

  test('선택 동의는 기본으로 꺼져 있다', async ({ page }) => {
    // 미리 체크해 두고 받는 동의는 동의가 아닙니다.
    await page.goto('/ko/checkout');
    await expect(page.locator('input[name="marketingSms"]')).not.toBeChecked();
  });

  test('무엇에 동의하는지와 어떻게 끊는지가 화면에 있다', async ({ page }) => {
    await page.goto('/ko/checkout');
    const text = await page.locator('.agree--optional').innerText();
    expect(text).toContain(ko.checkout.marketingSms.label);
    expect(text, '해지 방법').toMatch(/해지/);
    expect(text, '주문과 무관하다는 안내').toMatch(/주문은/);
  });

  test('선택 동의가 필수 동의와 다르게 보인다', async ({ page }) => {
    // 똑같이 생긴 상자가 둘 나란히 있으면 아래 것도 필수로 읽힙니다.
    await page.goto('/ko/checkout');
    const [required, optional] = await Promise.all([
      page.locator('.agree').first().evaluate((el) => getComputedStyle(el).borderTopColor),
      page.locator('.agree--optional').evaluate((el) => getComputedStyle(el).borderTopColor),
    ]);
    expect(optional, '두 칸이 같은 테두리입니다').not.toBe(required);
  });
});

test.describe('저장 — 동의한 사실과 시각이 남는다', () => {
  test('동의하면 시각이 기록된다', async ({ request }) => {
    const body = draft(true);
    const res = await request.post('/api/orders', { data: body });
    expect(res.ok(), await res.text()).toBe(true);

    const row = await findOrder(request, body.orderId);
    expect(row, '주문을 찾지 못했습니다').toBeTruthy();
    expect(row!.marketingSmsAt, '동의 시각이 없습니다').toBeTruthy();
    // 시각은 서버가 찍습니다 — 브라우저가 준 값을 남기면 증명이 되지 않습니다.
    expect(String(row!.marketingSmsAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('동의하지 않으면 아무것도 남지 않는다', async ({ request }) => {
    for (const value of [false, undefined]) {
      const body = draft(value);
      expect((await request.post('/api/orders', { data: body })).ok()).toBe(true);
      const row = await findOrder(request, body.orderId);
      expect(row, `marketingSms=${value}`).toBeTruthy();
      expect(row!.marketingSmsAt, `marketingSms=${value} 인데 시각이 남았습니다`).toBeFalsy();
    }
  });

  test('참이 아닌 값은 동의로 치지 않는다', async ({ request }) => {
    // 'true' 문자열이나 1 을 동의로 읽으면, 의도치 않은 값 하나가 광고 수신
    // 동의로 둔갑합니다.
    for (const value of ['true', 1, 'on', {}]) {
      const body = draft(value);
      expect((await request.post('/api/orders', { data: body })).ok()).toBe(true);
      const row = await findOrder(request, body.orderId);
      expect(row!.marketingSmsAt, `marketingSms=${JSON.stringify(value)}`).toBeFalsy();
    }
  });
});
