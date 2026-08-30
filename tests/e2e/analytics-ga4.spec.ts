import { test, expect } from '@playwright/test';
import { GA_MEASUREMENT_ID, ANALYTICS_HOST } from '../../src/config/analytics';
import ko from '../../src/i18n/ko.json' with { type: 'json' };

/**
 * Google Analytics 4.
 *
 * 이 파일이 지키는 것은 두 가지입니다.
 *
 *   1. **여기(테스트·로컬)에서는 아무것도 나가지 않는다.**
 *      검사 1,600여 개가 매번 홈을 엽니다. 그 트래픽이 실제 보고서에 섞이면
 *      12월에 "명단 800명" 을 판단할 근거가 오염됩니다.
 *
 *   2. **태그가 있으면 쿠키 조항도 있다.**
 *      GA4 는 `_ga` 쿠키를 심습니다. 「개인정보 보호법」상 자동 수집 장치의
 *      설치·운영과 거부 방법은 처리방침 법정 기재사항입니다. 태그만 먼저
 *      나가면 그 시점부터 누락 상태가 됩니다.
 */

const LANGS = ['ko', 'en', 'zh', 'th', 'vi'] as const;

test.describe('계측이 새지 않는다', () => {
  test('테스트 환경에서는 gtag 를 부르지 않는다', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => {
      if (/googletagmanager|google-analytics/.test(r.url())) hits.push(r.url());
    });

    await page.goto('/ko/');
    await page.waitForTimeout(600);

    expect(hits, `계측 요청이 나갔습니다:\n  ${hits.join('\n  ')}`).toEqual([]);
    // 전역도 만들어지지 않아야 합니다 — 만들어지면 이벤트가 큐에 쌓입니다.
    expect(await page.evaluate(() => typeof (window as any).gtag)).toBe('undefined');
  });

  test('판정은 운영 도메인 이름으로 한다', async ({ page }) => {
    /*
     * `import.meta.env.PROD` 로 가르면 안 됩니다 — 테스트도 `npm run build`
     * 산출물을 띄우므로 PROD 입니다. 판정이 브라우저에 있어야 빌드 종류와
     * 무관하게 새지 않습니다.
     */
    await page.goto('/ko/');
    // `<script>` 안쪽은 화면 텍스트가 아니라 Playwright 의 hasText 로는 잡히지
    // 않습니다. DOM 에서 직접 읽습니다.
    const inline = await page.evaluate(
      () =>
        [...document.querySelectorAll('script:not([src])')]
          .map((el) => el.textContent ?? '')
          .find((t) => t.includes('googletagmanager')) ?? null,
    );
    expect(inline, '계측 스크립트를 찾지 못했습니다').toBeTruthy();
    expect(inline, '호스트 판정이 없습니다').toContain('location.hostname');
    expect(inline).toContain(ANALYTICS_HOST);
    expect(inline).toContain(GA_MEASUREMENT_ID);
  });

});

test.describe('쿠키 조항', () => {
  test('5개 언어 처리방침에 쿠키 조항과 거부 방법이 있다', async ({ page }) => {
    for (const lang of LANGS) {
      await page.goto(`/${lang}/legal/privacy/`);
      const text = await page.locator('main').innerText();
      // 도구 이름 — 무엇이 쿠키를 심는지 밝혀야 합니다.
      expect(text, `${lang}: 도구 이름`).toMatch(/Google Analytics/i);
      // 쿠키 이름 — 어떤 쿠키인지.
      expect(text, `${lang}: 쿠키 이름`).toContain('_ga');
    }
  });

  test('한국어 조항에 거부 방법과 불이익 없음 안내가 있다', async ({ page }) => {
    // 법정 기재사항 중 가장 자주 빠지는 두 가지입니다.
    await page.goto('/ko/legal/privacy/');
    const text = await page.locator('main').innerText();
    expect(text, '거부 방법').toMatch(/차단|부가기능/);
    expect(text, '거부해도 지장 없다는 안내').toMatch(/지장/);
    expect(text).toContain(ko.legal.privacy.cookies.heading);
  });
});
