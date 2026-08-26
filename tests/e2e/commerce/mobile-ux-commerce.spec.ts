import { test, expect, type Page } from '@playwright/test';

/**
 * 자사 결제·회원 기능이 켜진 화면의 모바일 검사.
 *
 * 이 페이지들은 launch 모드에 존재하지 않아 공용 mobile-ux.spec.ts 에 둘 수
 * 없습니다. 그렇다고 검사하지 않으면 **돈을 내는 화면과 개인정보가 있는
 * 화면만 모바일 검사에서 빠지는** 셈이 됩니다.
 *
 * 새 커머스 화면을 만들면 아래 목록에 추가하세요.
 */

const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'] as const;

/** 5개 언어 모두 봅니다 — 언어마다 글꼴 폭과 줄바꿈 규칙이 달라 넘침도 다릅니다. */
const PAGES = LOCALES.flatMap((l) => [
  `/${l}/cart`,
  `/${l}/checkout`,
  `/${l}/order/lookup`,
  `/${l}/order/complete`,
  `/${l}/account`,
]);

/** 320 은 WCAG 1.4.10 Reflow 기준 폭입니다. */
const WIDTHS = [320, 360, 390, 430];

/** 로그인한 상태의 마이페이지도 봐야 합니다 — 내용이 그때 채워집니다. */
async function loginAs(page: Page, providerUserId: string): Promise<void> {
  const start = await page.request.get('/api/auth/login?returnTo=%2Fko%2Faccount', {
    maxRedirects: 0,
  });
  const callback = new URL(start.headers()['location']);
  callback.searchParams.set('code', providerUserId);
  await page.request.get(callback.href, { maxRedirects: 0 });
}

test.describe('가로 스크롤', () => {
  for (const path of PAGES) {
    test(`${path} — 320~430px 에서 넘치지 않는다`, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        await page.waitForLoadState('load');

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} @ ${width}px 가로 넘침`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('/ko/account — 로그인해서 내용이 찬 상태에서도 넘치지 않는다', async ({ page }) => {
    await loginAs(page, 'mobile-check-user');
    // 긴 주소가 들어가도 넘치지 않아야 합니다.
    await page.request.post('/api/orders', {
      data: {
        orderId: `AVORA-${String(20261026500000 + Math.floor(Math.random() * 99999)).padEnd(14, '0').slice(0, 14)}-MOB001`,
        amount: 32000, currency: 'KRW', locale: 'ko',
        items: [{ id: 'daily-sunscreen', qty: 1 }],
        recipientName: '김모바일',
        recipientPhone: '010-8888-9999',
        postalCode: '04524',
        address1: '서울특별시 중구 세종대로 110 서울특별시청 신청사 지하 1층 시민청 활짝라운지',
      },
    });

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/ko/account');
      await expect(page.locator('[data-account-signed]')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `로그인 상태 마이페이지 @ ${width}px 가로 넘침`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('손가락으로 누를 수 있는가', () => {
  async function tooSmall(page: Page): Promise<string[]> {
    const targets = page.locator('a[href], button, input[type="submit"]');
    const count = await targets.count();
    const found: string[] = [];
    for (let i = 0; i < count; i++) {
      const el = targets.nth(i);
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      if (!box) continue;
      if (box.height < 44 || box.width < 44) {
        const label = ((await el.textContent()) || '').trim().slice(0, 24);
        found.push(`"${label}" ${Math.round(box.width)}×${Math.round(box.height)}`);
      }
    }
    return found;
  }

  for (const path of PAGES) {
    test(`${path} — 탭 영역 44×44px 이상`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      const small = await tooSmall(page);
      expect(small, `${path} 터치 영역 부족: ${small.join(' / ')}`).toEqual([]);
    });
  }

  test('/ko/account — 로그인 상태의 버튼들도 확보한다', async ({ page }) => {
    await loginAs(page, 'mobile-tap-user');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/account');
    await expect(page.locator('[data-account-signed]')).toBeVisible();

    const small = await tooSmall(page);
    expect(small, `로그인 상태 마이페이지 터치 영역 부족: ${small.join(' / ')}`).toEqual([]);
  });
});

test.describe('내용이 채워질 때 화면이 흔들리지 않는다', () => {
  // 로그인 여부를 확인한 뒤 내용을 드러내면, 그 순간 푸터가 밀립니다.
  // 실측 CLS 0.262 로 기준(0.1)을 크게 넘었습니다.
  test('/ko/account — 레이아웃 이동이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/account');

    const shift = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as Array<{
              value: number;
              hadRecentInput: boolean;
            }>) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => resolve(total), 1500);
        }),
    );
    expect(shift, `누적 레이아웃 이동 ${shift}`).toBeLessThan(0.1);
  });
});

test.describe('iOS 에서 입력할 때 화면이 확대되지 않는다', () => {
  // iOS 사파리는 글자 16px 미만인 입력칸을 누르면 화면을 확대합니다.
  // 확대된 화면은 되돌아오지 않아 그때부터 가로 스크롤이 생깁니다.
  for (const path of ['/ko/checkout', '/ko/order/lookup', '/ko/account']) {
    test(`${path} — 입력 글자 16px 이상`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);

      const inputs = page.locator('input, select, textarea');
      const count = await inputs.count();
      const tooSmall: string[] = [];
      for (let i = 0; i < count; i++) {
        const el = inputs.nth(i);
        if (!(await el.isVisible())) continue;
        const size = await el.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
        const name = await el.getAttribute('name');
        if (size < 16) tooSmall.push(`${name ?? '(이름없음)'} ${size}px`);
      }
      expect(tooSmall, `${path} 확대 유발 입력칸: ${tooSmall.join(' / ')}`).toEqual([]);
    });
  }
});
