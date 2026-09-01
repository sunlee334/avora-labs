import { test, expect } from '@playwright/test';

/**
 * 에러 추적.
 *
 * 관측 장치는 **평소에 아무 일도 하지 않는 것** 이 정상이라, 망가져도 아무도
 * 모릅니다. 그래서 지키는 것을 검사로 적어 둡니다.
 */

test.describe('Sentry', () => {
  test('검사와 개발에서는 이벤트를 보내지 않는다', async ({ page }) => {
    /*
     * 검사가 806 건이고 그중 일부는 일부러 500 을 냅니다. 여기서 이벤트가
     * 나가면 무료 한도가 하루도 못 가고, 정작 진짜 장애 때 안 들어옵니다.
     *
     * 클라이언트는 hostname 으로, 워커는 요청 호스트로 각각 막습니다.
     * 여기서는 **실제로 나가는 요청이 없는지** 를 봅니다.
     */
    const sentryCalls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('sentry.io') || r.url().includes('ingest.')) sentryCalls.push(r.url());
    });

    await page.goto('/ko/');
    await page.goto('/ko/product');
    // 일부러 터뜨립니다 — 이래도 나가면 안 됩니다.
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('검사용 예외') }));
    });
    await page.waitForTimeout(300);

    expect(sentryCalls, `검사 중 Sentry 로 나간 요청: ${sentryCalls.join(', ')}`).toEqual([]);
  });
});
