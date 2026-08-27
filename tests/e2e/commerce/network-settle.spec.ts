import { test, expect, type Page, type Request } from '@playwright/test';

/**
 * 띄운 요청은 닫혀야 합니다.
 *
 * 로그인하지 않은 사람이 마이페이지를 열면 `/api/account/me` 와
 * `/api/inquiries` 가 둘 다 401 로 돌아옵니다. 예전에는 상태 코드만 보고
 * 곧바로 return 해서 **응답 본문을 읽지 않았고**, 그러면 스트림이 열린 채
 * 남습니다. 화면은 멀쩡히 그려지므로 눈으로는 보이지 않고, 브라우저의
 * 네트워크만 조용해지지 않아 `networkidle` 에 영영 닿지 못합니다.
 *
 * ── 엔진에 따라 다릅니다 ────────────────────────────────────
 * 이 결함은 **Chromium 에서만** 드러납니다. WebKit 은 읽지 않은 본문을
 * 알아서 닫아 주기 때문에 iPhone 프로젝트에서는 고치기 전에도 통과했습니다
 * (되돌려 5회 반복 확인: desktop 5/5 실패, mobile 5/5 통과).
 *
 * 그래서 이 파일은 무작위로 흔들리는 테스트가 아니라 **엔진별로 결정적**
 * 입니다. 그리고 하필 Chromium 이 Lighthouse·PageSpeed 가 도는 곳이라,
 * 잡아야 할 쪽에서 정확히 잡힙니다.
 *
 * 보는 것은 "무엇을 호출했는가" 가 아니라 "다 끝났는가" 뿐입니다 — 구현이
 * fetch 를 어떻게 쓰든 띄운 요청은 닫혀야 한다는 것만 고정합니다.
 */

/** 화면을 열고, 3초 뒤에도 끝나지 않은 API 요청을 돌려준다. */
async function pendingAfterLoad(page: Page, path: string): Promise<string[]> {
  const pending = new Set<Request>();
  const track = (r: Request) => {
    if (r.url().includes('/api/')) pending.add(r);
  };
  const done = (r: Request) => pending.delete(r);

  page.on('request', track);
  page.on('requestfinished', done);
  page.on('requestfailed', done);

  await page.goto(path, { waitUntil: 'load' });
  // 응답이 오고도 남을 시간 — 실제 401 은 로컬에서 한 자릿수 ms 에 옵니다.
  await page.waitForTimeout(3000);

  page.off('request', track);
  page.off('requestfinished', done);
  page.off('requestfailed', done);

  return [...pending].map((r) => `${r.method()} ${new URL(r.url()).pathname}`);
}

const WHY = '401 응답의 본문을 읽지 않아 스트림이 열린 채 남았습니다';

test.describe('띄운 요청은 닫힌다', () => {
  test('로그인하지 않고 마이페이지를 열어도 남는 요청이 없다', async ({ page }) => {
    expect(await pendingAfterLoad(page, '/ko/account'), WHY).toEqual([]);
  });

  test('주문조회를 열어도 남는 요청이 없다', async ({ page }) => {
    expect(await pendingAfterLoad(page, '/ko/order/lookup'), WHY).toEqual([]);
  });

  /**
   * 위 두 개는 "지금 이 화면이 괜찮다" 는 확인입니다. 이것은 **왜 괜찮은지**
   * 를 고정합니다 — 본문을 읽지 않으면 정말로 요청이 안 끝난다는 사실이
   * 사라지면 위 테스트는 통과하면서도 아무것도 지키지 못하게 됩니다.
   *
   * 전제가 성립하는 엔진에서만 봅니다. WebKit 에서는 명제 자체가 거짓이라
   * 여기서 실패해도 알려주는 것이 없습니다.
   */
  test('본문을 읽지 않은 401 은 끝나지 않는다 — 이 테스트가 지키는 전제', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'WebKit 은 읽지 않은 본문을 알아서 닫습니다');

    const pending = new Set<string>();
    const key = (r: Request) => new URL(r.url()).search;
    page.on('request', (r) => {
      if (r.url().includes('probe=')) pending.add(key(r));
    });
    page.on('requestfinished', (r) => pending.delete(key(r)));
    page.on('requestfailed', (r) => pending.delete(key(r)));

    await page.goto('/ko/account', { waitUntil: 'load' });
    await page.evaluate(async () => {
      const unread = await fetch('/api/inquiries?probe=unread');
      void unread.status; // 일부러 본문을 읽지 않습니다
      const read = await fetch('/api/inquiries?probe=read');
      await read.text();
    });
    await page.waitForTimeout(3000);

    expect([...pending]).toEqual(['?probe=unread']);
  });
});
