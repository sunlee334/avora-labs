import { test, expect, type Page } from '@playwright/test';

/**
 * 출시 알림 신청.
 *
 * 제품이 2027년 상반기에 나옵니다. 그때까지 이 폼이 제품 페이지에서 유일하게
 * 할 수 있는 일이고, 여기 모이는 명단이 펀딩 초반 달성률을 좌우합니다.
 *
 * ── 왜 launch 폴더인가 ──────────────────────────────────────
 * 이 폼은 **팔 수 없을 때만** 화면에 있습니다. commerce 모드는 임시 가격이
 * 들어가 판매 가능 상태가 되므로 그 자리에 장바구니 버튼이 나옵니다.
 * 즉 commerce 에서 이 폼을 찾으면 영원히 못 찾습니다.
 */

let seq = 0;
function freshEmail(): string {
  seq += 1;
  return `notify-${Date.now().toString(36)}-${seq}@example.com`;
}

async function fill(page: Page, email: string): Promise<void> {
  await page.locator('[data-launch-notify] input[name="email"]').fill(email);
  await page.locator('[data-notify-submit]').click();
}

test.describe('출시 알림 신청', () => {
  test('제품 페이지에 폼이 있고 출시 시기를 밝힌다', async ({ page }) => {
    await page.goto('/ko/product');
    await expect(page.locator('[data-launch-notify]')).toBeVisible();
    await expect(page.locator('.product-hero__window')).toContainText('2027');
  });

  test('신청하면 확인 문구가 나오고 입력칸이 사라진다', async ({ page }) => {
    await page.goto('/ko/product');
    await fill(page, freshEmail());
    const state = page.locator('[data-notify-state]');
    await expect(state).toBeVisible();
    await expect(state).toHaveAttribute('data-tone', 'ok');
    await expect(page.locator('[data-launch-notify] .notify__row')).toBeHidden();
  });

  test('같은 주소를 다시 신청해도 성공으로 보인다', async ({ page, request }) => {
    // 이미 명단에 있는지를 화면이 알려 주면, 남의 주소를 넣어 보며 명단을
    // 캐낼 수 있습니다. 그래서 첫 신청과 구분되지 않아야 합니다.
    const email = freshEmail();
    const first = await request.post('/api/launch-notify', { data: { email, locale: 'ko' } });
    expect(first.status()).toBe(201);

    await page.goto('/ko/product');
    await fill(page, email);
    await expect(page.locator('[data-notify-state]')).toHaveAttribute('data-tone', 'ok');
  });

  test('잘못된 주소는 서버까지 가지 않는다', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/launch-notify')) calls.push(r.url());
    });
    await page.goto('/ko/product');
    await fill(page, 'not-an-email');
    await expect(page.locator('[data-notify-state]')).toHaveAttribute('data-tone', 'bad');
    expect(calls, '잘못된 주소로 서버를 부르지 않습니다').toHaveLength(0);
  });

  test('동의 문구와 해지 방법이 폼에 적혀 있다', async ({ page }) => {
    // 광고성 정보 수신은 동의가 필요하고, 해지 수단을 함께 알려야 합니다.
    await page.goto('/ko/product');
    await expect(page.locator('.notify__consent')).toContainText('동의');
    await expect(page.locator('.notify__consent')).toContainText('해지');
  });

  test('5개 언어 모두에 폼이 있다', async ({ page }) => {
    for (const lang of ['ko', 'en', 'zh', 'th', 'vi']) {
      await page.goto(`/${lang}/product`);
      await expect(page.locator('[data-launch-notify]'), lang).toBeVisible();
    }
  });
});

test.describe('출시 알림 API', () => {
  test('이메일이 없거나 형식이 아니면 400', async ({ request }) => {
    for (const email of [undefined, '', 'nope', 'a@b', 'a b@c.com']) {
      const res = await request.post('/api/launch-notify', { data: { email, locale: 'ko' } });
      expect(res.status(), String(email)).toBe(400);
    }
  });

  test('대소문자가 달라도 같은 사람이다', async ({ request }) => {
    const email = freshEmail();
    const a = await request.post('/api/launch-notify', { data: { email, locale: 'ko' } });
    const b = await request.post('/api/launch-notify', {
      data: { email: email.toUpperCase(), locale: 'ko' },
    });
    expect(a.status()).toBe(201);
    expect(b.status()).toBe(201);
  });

  test('해지 링크는 없는 토큰이어도 성공처럼 답한다', async ({ request }) => {
    // 토큰을 찍어 보며 어떤 것이 살아 있는지 알아낼 이유를 없앱니다.
    const res = await request.get('/api/launch-notify/unsubscribe?t=UNSUB-000-XXXXXX');
    expect(res.status()).toBe(200);
  });
});

test.describe('홈 신청 자리', () => {
  test('첫 화면과 스토리 끝, 두 자리에 있다', async ({ page }) => {
    await page.goto('/ko/');
    await expect(page.locator('[data-launch-notify]')).toHaveCount(2);
    await expect(page.locator('[data-launch-notify][data-source="home-hero"]')).toHaveCount(1);
    await expect(page.locator('[data-launch-notify][data-source="home-end"]')).toHaveCount(1);
  });

  test('첫 화면 자리가 사진 바로 다음에 온다', async ({ page }) => {
    // 스토리를 지나야 나오면 커뮤니티에서 온 사람이 못 보고 떠납니다.
    await page.goto('/ko/');
    const y = await page.locator('[data-source="home-hero"]').evaluate(
      (el) => el.getBoundingClientRect().top + window.scrollY,
    );
    const story = await page.locator('#story').evaluate(
      (el) => el.getBoundingClientRect().top + window.scrollY,
    );
    expect(y, '신청 자리가 오리진 섹션보다 위에 있어야 합니다').toBeLessThan(story);
  });

  test('출시 시기를 제품 페이지와 같은 말로 밝힌다', async ({ page }) => {
    // 두 화면이 다른 날짜를 말하면 어느 쪽을 믿어야 할지 알 수 없습니다.
    await page.goto('/ko/');
    const home = await page.locator('.product-hero__window').innerText();
    await page.goto('/ko/product');
    const product = await page.locator('.product-hero__window').innerText();
    expect(home).toBe(product);
  });

  test('두 자리가 서로 다른 말을 한다', async ({ page }) => {
    await page.goto('/ko/');
    const first = await page.locator('[data-source="home-hero"] .notify__heading').innerText();
    const second = await page.locator('[data-source="home-end"] .notify__heading').innerText();
    expect(first).not.toBe(second);
  });

  test('두 번째 폼도 실제로 동작한다', async ({ page }) => {
    // querySelector 로 하나만 잡으면 두 번째는 눌러도 아무 일이 없는 폼이
    // 됩니다 — 화면에는 멀쩡히 보이므로 아무도 알아채지 못합니다.
    await page.goto('/ko/');
    const form = page.locator('[data-source="home-end"]');
    await form.locator('input[name="email"]').fill(freshEmail());
    await form.locator('[data-notify-submit]').click();
    await expect(form.locator('[data-notify-state]')).toHaveAttribute('data-tone', 'ok');
  });

  test('한 쪽에 넣어도 다른 쪽은 그대로다', async ({ page }) => {
    await page.goto('/ko/');
    const hero = page.locator('[data-source="home-hero"]');
    await hero.locator('input[name="email"]').fill(freshEmail());
    await hero.locator('[data-notify-submit]').click();
    await expect(hero.locator('[data-notify-state]')).toHaveAttribute('data-tone', 'ok');
    // 두 번째 폼의 입력칸은 그대로 열려 있어야 합니다.
    await expect(page.locator('[data-source="home-end"] .notify__row')).toBeVisible();
  });

  test('5개 언어 모두 두 자리가 있다', async ({ page }) => {
    for (const lang of ['ko', 'en', 'zh', 'th', 'vi']) {
      await page.goto(`/${lang}/`);
      await expect(page.locator('[data-launch-notify]'), lang).toHaveCount(2);
    }
  });
});
