import { test, expect, type Page } from '@playwright/test';
import { ADMIN_DEV_TOKEN } from '../../../playwright.config';

/**
 * 마이페이지 — 주문내역 · 배송조회 · 배송지 수정.
 *
 * 예전 화면은 `/api/account/orders` 가 상태·배송단계·택배사·송장·상품을
 * 전부 돌려주는데도 **날짜·번호·금액 셋만 쓰고 나머지를 버렸습니다.**
 * 손님이 마이페이지에서 가장 알고 싶은 것은 "지금 어디까지 왔는가" 입니다.
 */

const AUTH = { 'X-Admin-Dev-Token': ADMIN_DEV_TOKEN };
const UNIT = 32000;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

let seq = 0;
function freshId(label: string): string {
  seq += 1;
  return `${label}-${Date.now().toString(36)}-${seq}`;
}
function orderId(): string {
  seq += 1;
  let s = '';
  for (let i = 0; i < 6; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return `AVORA-2026082718${String(seq).padStart(4, '0')}-${s}`;
}

async function loginAs(page: Page, code: string): Promise<void> {
  const start = await page.request.get(
    '/api/auth/login?provider=mock&returnTo=%2Fko%2Faccount',
    { maxRedirects: 0 },
  );
  const cb = new URL(start.headers()['location']);
  cb.searchParams.set('code', code);
  await page.request.get(cb.href, { maxRedirects: 0 });
}

/** 계정에 붙은 주문 하나. paid 까지 진행하고 선택적으로 발송 처리합니다. */
async function seedOrder(
  page: Page,
  phone: string,
  opts: { ship?: { carrier: string; tracking: string } } = {},
): Promise<string> {
  const id = orderId();
  // 수량이 2 면 금액도 2개분이어야 합니다. 서버가 스스로 계산해 대조하므로
  // 어긋나면 AMOUNT_MISMATCH 로 거절합니다 — 금액 조작을 막는 장치입니다.
  const QTY = 2;
  await page.request.post('/api/orders', {
    data: {
      orderId: id, amount: UNIT * QTY, currency: 'KRW', locale: 'ko',
      items: [{ id: 'daily-sunscreen', qty: QTY }],
      recipientName: '주문확인', recipientPhone: phone,
      postalCode: '04524', address1: '서울특별시 중구 세종대로 110',
    },
  });
  await page.request.post('/api/payments/confirm', {
    data: { orderId: id, paymentKey: `mock-${id}`, amount: UNIT * QTY },
  });
  await page.request.post('/api/account/claim', { data: { orderId: id, phone } });

  if (opts.ship) {
    const res = await page.request.patch(`/api/admin/orders/${id}`, {
      headers: AUTH,
      data: {
        fulfillment: 'shipped',
        carrier: opts.ship.carrier,
        trackingNumber: opts.ship.tracking,
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  return id;
}

test.describe('주문내역', () => {
  test('상품·수량·금액·결제상태가 모두 보인다', async ({ page }) => {
    const phone = '010-1212-3434';
    await loginAs(page, freshId('orders'));
    const id = await seedOrder(page, phone);

    await page.goto('/ko/account');
    const card = page.locator(`[data-order="${id}"]`);
    await expect(card).toBeVisible();
    await expect(card, '상품명').toContainText('Daily Sunscreen');
    await expect(card, '수량').toContainText('2개');
    await expect(card, '금액').toContainText('64,000');
    await expect(card, '결제 상태').toContainText('결제 완료');
  });

  test('남의 주문은 보이지 않는다', async ({ page, browser }) => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await loginAs(otherPage, freshId('owner'));
    const theirs = await seedOrder(otherPage, '010-9999-0000');

    await loginAs(page, freshId('stranger'));
    await page.goto('/ko/account');
    await expect(page.locator('[data-account-signed]')).toBeVisible();
    await expect(page.locator(`[data-order="${theirs}"]`)).toHaveCount(0);
    await other.close();
  });
});

test.describe('배송 조회', () => {
  test('발송되면 택배사·송장과 조회 링크가 나온다', async ({ page }) => {
    const phone = '010-2323-4545';
    await loginAs(page, freshId('ship'));
    const id = await seedOrder(page, phone, {
      ship: { carrier: 'CJ대한통운', tracking: '1234567890' },
    });

    await page.goto('/ko/account');
    const card = page.locator(`[data-order="${id}"]`);
    await expect(card).toContainText('CJ대한통운');
    await expect(card).toContainText('1234567890');
    await expect(card).toContainText('발송');

    const link = card.locator('a.tapLink');
    await expect(link).toBeVisible();
    // 송장번호가 실제로 주소에 들어가야 합니다 — 빈 조회 페이지로 보내면
    // 링크가 있으나 마나입니다.
    await expect(link).toHaveAttribute('href', /1234567890/);
    await expect(link, '새 탭으로 열립니다').toHaveAttribute('target', '_blank');
    await expect(link, 'opener 를 넘기지 않습니다').toHaveAttribute('rel', /noopener/);
  });

  test('발송 전에는 송장 줄 대신 안내가 나온다', async ({ page }) => {
    await loginAs(page, freshId('preship'));
    const id = await seedOrder(page, '010-3434-5656');

    await page.goto('/ko/account');
    const card = page.locator(`[data-order="${id}"]`);
    await expect(card).toContainText('발송되면 송장번호가');
    await expect(card.locator('a.tapLink')).toHaveCount(0);
  });

  test('모르는 택배사면 링크 없이 이름과 번호만 나온다', async ({ page }) => {
    // 틀린 곳으로 보내는 것보다 링크가 없는 편이 낫습니다.
    const phone = '010-4545-6767';
    await loginAs(page, freshId('unknown-carrier'));
    const id = await seedOrder(page, phone, {
      ship: { carrier: '동네배송', tracking: '5555' },
    });

    await page.goto('/ko/account');
    const card = page.locator(`[data-order="${id}"]`);
    await expect(card).toContainText('동네배송');
    await expect(card).toContainText('5555');
    await expect(card.locator('a.tapLink')).toHaveCount(0);
  });
});

test.describe('배송지 수정', () => {
  test('저장하면 화면에 바로 반영된다', async ({ page }) => {
    await loginAs(page, freshId('addr'));
    await page.goto('/ko/account');
    await expect(page.locator('[data-account-signed]')).toBeVisible();

    await page.locator('[data-address-edit]').click();
    const form = page.locator('[data-address-form]');
    await expect(form).toBeVisible();

    await form.locator('[name="recipientName"]').fill('김수정');
    await form.locator('[name="recipientPhone"]').fill('010-7878-9090');
    await form.locator('[name="postalCode"]').fill('06236');
    await form.locator('[name="address1"]').fill('서울특별시 강남구 테헤란로 152');
    await form.locator('[name="address2"]').fill('10층');
    await form.locator('[data-address-save]').click();

    await expect(form).toBeHidden();
    const list = page.locator('[data-address]');
    await expect(list).toContainText('김수정');
    await expect(list).toContainText('테헤란로 152');
  });

  test('빈 칸이 있으면 제출 자체가 되지 않는다', async ({ page }) => {
    // 브라우저의 required 검사가 먼저 막습니다. 우리가 따로 만들 필요가
    // 없고, 화면 낭독기 안내도 브라우저가 이미 해 줍니다.
    await loginAs(page, freshId('addr-bad'));
    await page.goto('/ko/account');
    await page.locator('[data-address-edit]').click();

    const form = page.locator('[data-address-form]');
    await form.locator('[name="recipientName"]').fill('이름만');
    await form.locator('[data-address-save]').click();

    await expect(form, '고칠 기회를 뺏지 않습니다').toBeVisible();
    // 저장되지 않았으므로 표시할 배송지도 없습니다.
    expect(await page.locator('[data-address]').isHidden()).toBe(true);
  });

  test('서버가 거절하면 오류를 보여주고 폼이 닫히지 않는다', async ({ page }) => {
    // 브라우저가 못 잡는 것(길이 제한 등)은 서버가 잡습니다. 그때도
    // 사용자는 고칠 기회를 가져야 합니다 — 폼이 닫히면 입력이 사라집니다.
    await loginAs(page, freshId('addr-server'));
    await page.goto('/ko/account');
    await page.locator('[data-address-edit]').click();

    const form = page.locator('[data-address-form]');
    await form.locator('[name="recipientName"]').fill('김긴이름');
    await form.locator('[name="recipientPhone"]').fill('010-1111-2222');
    await form.locator('[name="postalCode"]').fill('04524');
    // 서버는 주소를 200자로 제한합니다.
    await form.locator('[name="address1"]').fill('가'.repeat(201));
    await form.locator('[data-address-save]').click();

    await expect(page.locator('[data-address-error]')).toBeVisible();
    await expect(form, '입력한 내용이 사라지면 안 됩니다').toBeVisible();
    await expect(form.locator('[name="recipientName"]')).toHaveValue('김긴이름');
  });

  test('취소하면 저장하지 않고 닫힌다', async ({ page }) => {
    await loginAs(page, freshId('addr-cancel'));
    await page.goto('/ko/account');
    await page.locator('[data-address-edit]').click();
    await page.locator('[name="recipientName"]').fill('저장안됨');
    await page.locator('[data-address-cancel]').click();

    await expect(page.locator('[data-address-form]')).toBeHidden();
    await expect(page.locator('[data-address-empty]')).toBeVisible();
  });

  test('다시 열면 저장된 값이 채워져 있다', async ({ page }) => {
    // 빈 칸부터 다시 쓰게 하지 않습니다.
    await loginAs(page, freshId('addr-refill'));
    await page.goto('/ko/account');
    await page.locator('[data-address-edit]').click();
    const form = page.locator('[data-address-form]');
    await form.locator('[name="recipientName"]').fill('한번더');
    await form.locator('[name="recipientPhone"]').fill('010-1111-2222');
    await form.locator('[name="postalCode"]').fill('04524');
    await form.locator('[name="address1"]').fill('서울시 중구 세종대로 110');
    await form.locator('[data-address-save]').click();
    await expect(form).toBeHidden();

    await page.locator('[data-address-edit]').click();
    await expect(form.locator('[name="recipientName"]')).toHaveValue('한번더');
    await expect(form.locator('[name="postalCode"]')).toHaveValue('04524');
  });
});

test.describe('계정 정보', () => {
  test('이메일과 가입일이 보이고, 이름은 바꿀 수 없다고 밝힌다', async ({ page }) => {
    await loginAs(page, freshId('profile'));
    await page.goto('/ko/account');
    await expect(page.locator('[data-profile-email]')).not.toBeEmpty();
    await expect(page.locator('[data-profile-joined]')).not.toBeEmpty();
    await expect(page.locator('main')).toContainText('로그인에 쓰신 서비스에서 관리');
  });

  test('로그인하지 않으면 아무 정보도 나오지 않는다', async ({ page }) => {
    await page.goto('/ko/account');
    await expect(page.locator('[data-account-anon]')).toBeVisible();
    await expect(page.locator('[data-account-signed]')).toBeHidden();
  });
});

test.describe('주문 연결 폼', () => {
  /**
   * 이 폼만 한때 `<label class="field"><span class="field__label">` 구조였습니다.
   * `.field label` 규칙이 `.field` **안의** label 을 겨냥하므로, 라벨 자신이
   * `.field` 이면 규칙이 걸리지 않습니다. 그래서 이 폼의 라벨만 16px/400 으로,
   * 나머지 폼은 14px/600 으로 그려졌습니다. 눈에는 띄지만 아무도 안 세는 차이라
   * 자로 재서 붙잡아 둡니다.
   */
  test('라벨과 입력칸이 다른 폼과 같은 모양이다', async ({ page }) => {
    await loginAs(page, freshId('claim'));
    await page.goto('/ko/account');

    const shape = (sel: string) =>
      page.locator(sel).evaluate((el) => {
        const s = getComputedStyle(el);
        return { size: s.fontSize, weight: s.fontWeight };
      });

    expect(await shape('label[for="claim-orderId"]')).toEqual(await shape('label[for="ad-name"]'));
    expect(await shape('#claim-orderId')).toEqual(await shape('#ad-name'));
  });
});
