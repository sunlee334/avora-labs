import { test, expect, type Page } from '@playwright/test';
import { scanA11y } from '../../support/axe';

/**
 * 하단 고정 CTA + 신청 시트 (B2).
 *
 * 홈이 12개 섹션이 되면서 검증단 섹션의 폼 아래로 **다섯 섹션 동안 신청할
 * 자리가 없었습니다.** 여기서 지키는 것은 그 구멍이 닫혀 있다는 사실
 * 하나입니다 — 바가 예쁘게 뜨는지가 아니라, 페이지 한가운데에서 신청할 수
 * 있는가.
 */

/**
 * 봇 문턱을 넘기는 시간.
 *
 * `worker/spam.ts` 의 `MIN_FILL_MS` 는 2000ms 입니다. 화면이 뜨고 2초 안에
 * 들어온 제출은 **버려지는데 201 을 돌려줍니다**(그래야 봇이 걸린 줄
 * 모릅니다). 클라이언트는 2xx 면 완료 문구를 띄우므로, 기다리지 않으면
 * "접수됐다" 를 확인하고도 실제로는 명단에 아무것도 남지 않습니다.
 * `notify-success-focus.spec.ts` 가 같은 이유로 같은 값을 씁니다.
 */
const PAST_SPAM_GATE_MS = 2200;

const bar = '[data-sticky-cta]';
const sheet = '[data-notify-sheet]';

/**
 * 인라인 폼도 히어로도 푸터도 없는 자리로 갑니다 — 여정 섹션 언저리.
 *
 * 스크롤 뒤에 고정 시간을 기다리지 않습니다. `data-shown` 은
 * IntersectionObserver 콜백에서 **동기적으로** 써지고(0.24s 전환은 눈에
 * 보이는 움직임일 뿐 속성과 무관합니다), `toHaveAttribute` 는 이미
 * 재시도합니다. 추정한 대기 시간을 두면 느린 CI 에서는 모자라고 빠른
 * 기계에서는 낭비입니다.
 */
async function toMidPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = document.querySelector('[data-section="the_journey"]');
    target?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  });
  await expect(page.locator(bar)).toHaveAttribute('data-shown', 'true');
}

test.describe('중간에서도 신청할 수 있다', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ko/');
  });

  test('첫 화면에서는 바가 올라와 있지 않다', async ({ page }) => {
    /*
     * 히어로에는 이미 버튼이 있습니다(.hero__cta). 같은 말을 두 번 하지
     * 않습니다.
     *
     * `data-shown="false"` 만 보면 **아무것도 증명하지 못합니다** — 그것은
     * 서버가 마크업에 그대로 찍어 보내는 값이라, 스크립트가 통째로 죽어도
     * (번들 실패, 예외, `.hero`/`.footer` 선택자 노후화, showModal 미지원)
     * 통과합니다. 그래서 **내렸다 올렸다가 다시 내려오는** 왕복을 봅니다.
     * 왕복이 성립하면 관찰자가 살아서 돌고 있다는 뜻입니다.
     */
    await expect(page.locator(bar)).toHaveAttribute('data-shown', 'false');
    await toMidPage(page);
    await page.locator('.hero').scrollIntoViewIfNeeded();
    await expect(page.locator(bar)).toHaveAttribute('data-shown', 'false');
  });

  test('본문 한가운데에서는 바가 올라온다', async ({ page }) => {
    await toMidPage(page);
    await expect(page.locator(`${bar} a`)).toBeVisible();
  });

  test('인라인 폼이 보이는 동안에는 바가 내려간다', async ({ page }) => {
    // "한 화면에 Primary 는 하나만"(B1). 폼이 보이는데 같은 말을 하는 바를
    // 겹쳐 두면 어느 쪽을 눌러야 하는지 묻게 됩니다.
    await toMidPage(page);
    await expect(page.locator(bar)).toHaveAttribute('data-shown', 'true');

    await page.locator('[data-source="home-end"]').scrollIntoViewIfNeeded();
    await expect(page.locator(bar)).toHaveAttribute('data-shown', 'false');
  });

  test('푸터에서는 바가 내려간다', async ({ page }) => {
    // 사업자정보·법적 고지를 가리지 않습니다.
    await page.locator('.footer').scrollIntoViewIfNeeded();
    await expect(page.locator(bar)).toHaveAttribute('data-shown', 'false');
  });

  test('내려가 있는 동안에는 탭으로 닿지 않는다', async ({ page }) => {
    /*
     * transform 으로 밀어내기만 하면 화면 밖에 있어도 탭 순서에는 남습니다.
     * 키보드만 쓰는 사람이 보이지 않는 버튼에 걸리면 무슨 일이 일어난
     * 것인지 알 수 없습니다.
     */
    const reachable = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-sticky-cta] a');
      return el ? getComputedStyle(el).visibility : 'missing';
    });
    expect(reachable).toBe('hidden');
  });
});

test.describe('시트', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ko/');
    await toMidPage(page);
  });

  test('바를 누르면 열리고 이메일 칸에 초점이 간다', async ({ page }) => {
    await page.locator(`${bar} a`).click();
    await expect(page.locator(sheet)).toHaveAttribute('open', '');
    // 열린 목적은 닫는 것이 아닙니다 — 초점이 닫기 버튼에 머무르면 안 됩니다.
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('name'));
    expect(focused).toBe('email');
  });

  test('Esc 로 닫히고 초점이 바로 돌아온다', async ({ page }) => {
    await page.locator(`${bar} a`).click();
    await expect(page.locator(sheet)).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator(sheet)).not.toHaveAttribute('open', '');
    /*
     * `expect.poll` 로 봅니다 — 한 번 읽고 끝내면 안 됩니다.
     *
     * 초점을 옮기는 것은 `close` 이벤트 핸들러이고, `open` 속성이 사라지는
     * 것과 그 핸들러가 도는 것은 같은 순간이 아닙니다. 스위트 전체를 돌릴
     * 때처럼 기계가 바쁜 순간에는 그 틈이 벌어져, 코드가 멀쩡한데 검사만
     * 빨개집니다.
     */
    await expect
      .poll(
        () => page.evaluate(() => document.activeElement?.hasAttribute('data-sticky-cta-open')),
        { message: '닫은 뒤 초점이 문서 처음으로 튕겼습니다' },
      )
      .toBe(true);
  });

  test('닫기 버튼으로도 닫힌다', async ({ page }) => {
    await page.locator(`${bar} a`).click();
    await page.locator('[data-notify-sheet-close]').click();
    await expect(page.locator(sheet)).not.toHaveAttribute('open', '');
  });

  test('시트를 여는 동안 바가 사라지지 않는다', async ({ page }) => {
    /*
     * 시트 안의 폼도 `[data-launch-notify]` 입니다. 그것까지 억제 대상으로
     * 세면 여는 순간 바가 내려가고, 닫아도 돌아오지 않습니다.
     */
    await page.locator(`${bar} a`).click();
    await page.keyboard.press('Escape');
    await expect(page.locator(bar)).toHaveAttribute('data-shown', 'true');
  });

  test('시트 안의 폼이 sheet 로 기록된다', async ({ page }) => {
    // 이 값이 그대로 GA4 의 form_location 이 되고 D1 행에도 남습니다.
    // 시트에서 몇 건이 들어오는지 세지 못하면 이 컴포넌트를 계속 둘지
    // 판단할 근거가 없습니다.
    await expect(page.locator(`${sheet} [data-launch-notify]`)).toHaveAttribute(
      'data-source',
      'sheet',
    );
  });

  test('시트에서 신청이 접수되고 명단에 남는다', async ({ page }) => {
    /*
     * 완료 문구만 보면 부족합니다. 봇 문턱(2초)에 걸린 제출도 201 을 받아
     * 같은 문구를 띄우므로, 기다리지 않으면 **버려진 신청을 접수됐다고
     * 확인하게 됩니다.** `source="sheet"` 를 둔 이유 전체가 "시트에서 몇
     * 건이 들어오는지 센다" 인데, 그 값이 저장되는 것을 한 번도 확인하지
     * 않은 채 남습니다.
     */
    await page.waitForTimeout(PAST_SPAM_GATE_MS);
    await page.locator(`${bar} a`).click();
    const address = `sticky-${Date.now()}@example.com`;
    await page.locator(`${sheet} input[name="email"]`).fill(address);

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/launch-notify') && r.request().method() === 'POST'),
      page.locator(`${sheet} [data-notify-submit]`).click(),
    ]);
    expect(response.status()).toBe(201);
    expect(
      response.request().postDataJSON().source,
      '시트에서 온 신청이 sheet 로 기록되지 않습니다',
    ).toBe('sheet');
    // 2초를 실제로 넘겼는지 — 넘기지 않았으면 서버가 조용히 버립니다.
    expect(
      response.request().postDataJSON().elapsedMs,
      '봇 문턱 안쪽이라 이 신청은 저장되지 않습니다',
    ).toBeGreaterThanOrEqual(2000);

    await expect(page.locator(`${sheet} [data-notify-state]`)).toHaveAttribute('data-tone', 'ok');
  });

  test('신청을 마치면 바가 따라다니지 않고 초점도 잃지 않는다', async ({ page }) => {
    await page.waitForTimeout(PAST_SPAM_GATE_MS);
    await page.locator(`${bar} a`).click();
    await page.locator(`${sheet} input[name="email"]`).fill(`done-${Date.now()}@example.com`);
    await page.locator(`${sheet} [data-notify-submit]`).click();
    await expect(page.locator(`${sheet} [data-notify-state]`)).toHaveAttribute('data-tone', 'ok');
    await page.keyboard.press('Escape');
    await expect(page.locator(bar)).toHaveAttribute('hidden', '');

    /*
     * 바가 사라졌으므로 초점을 그리로 돌려줄 수 없습니다. 확인하지 않으면
     * focus() 가 조용히 무시되고 초점이 <body> 로 떨어집니다 — 다음 Tab 이
     * 화면 맨 위 건너뛰기 링크로 돌아갑니다.
     */
    await expect(page.locator(sheet)).not.toHaveAttribute('open', '');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id ?? ''), {
        message: '닫은 뒤 초점이 갈 곳을 잃었습니다',
      })
      .toBe('main');
  });

  test('키보드로 체크박스를 눌러도 시트가 닫히지 않는다', async ({ page }) => {
    /*
     * Space·Enter 로 만든 클릭은 `clientX = clientY = 0` 입니다. 백드롭
     * 판정을 좌표로만 하면 바텀시트는 `box.top > 0` 이라 **항상** 바깥으로
     * 읽혀 닫힙니다. 시트 안에서 활동을 고르거나 야간 동의를 누르는 것이
     * 불가능해집니다.
     */
    await page.locator(`${bar} a`).click();
    const night = page.locator(`${sheet} input[name="night"]`);
    await night.focus();
    await page.keyboard.press('Space');
    await expect(night, '체크가 되지 않았습니다').toBeChecked();
    await expect(page.locator(sheet), '키보드가 시트를 닫았습니다').toHaveAttribute('open', '');
  });

  test('Cmd+클릭은 시트를 열지 않는다 — 링크는 링크로 남습니다', async ({ page }) => {
    // 이 컨트롤을 <button> 이 아니라 <a href="#notify"> 로 둔 이유가
    // "목적지가 있는 컨트롤은 링크" 입니다. 새 탭으로 여는 길을 막으면
    // 링크를 자처하고 링크처럼 굴지 않는 것이 됩니다.
    await page.locator(`${bar} a`).click({ modifiers: ['ControlOrMeta'] });
    await expect(page.locator(sheet)).not.toHaveAttribute('open', '');
  });
});

test.describe('5개 언어', () => {
  // 라벨이 가장 긴 언어는 베트남어입니다 — "Nhận thông báo ra mắt" 21자,
  // 중국어("接收上市通知")의 세 배 반. 가장 긴 것이 320px 에서 안 깨지면
  // 나머지는 통과합니다(B1 다국어 QA).
  for (const lang of ['ko', 'en', 'zh', 'th', 'vi']) {
    test(`${lang}: 바가 가로로 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 700 });
      await page.goto(`/${lang}/`);
      await toMidPage(page);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `${lang}: ${over}px 넘칩니다`).toBeLessThanOrEqual(0);

      const box = await page.locator(`${bar} a`).boundingBox();
      expect(box, `${lang}: 바의 버튼이 보이지 않습니다`).not.toBeNull();
      expect(box!.height, `${lang}: 탭 영역이 ${box!.height}px 입니다`).toBeGreaterThanOrEqual(44);
    });
  }
});

/**
 * 열린 상태의 접근성.
 *
 * `a11y.spec.ts` 는 언어 시트·드롭다운·모바일 메뉴까지 **연 상태**를 전부
 * 훑는데, 이 시트만 빠져 있었습니다 — 그 파일은 두 모드에서 도는 루트
 * 파일이고 이 마크업은 `!CAN_ORDER` 일 때만 존재하기 때문입니다.
 *
 * 그대로 두면 새 마크업 중 **사람이 실제로 보는 상태를 검사하는 축이 하나도
 * 없습니다.** 닫힌 dialog 는 `display:none`, 내려간 바는 `visibility:hidden`
 * 이라 홈 스캔에서 둘 다 빠집니다.
 */
test.describe('접근성', () => {
  test.beforeEach(async ({ page }) => {
    // 등장 애니메이션 중간값이 대비 오탐을 냅니다 — a11y.spec.ts 와 같은 처방.
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('시트를 연 상태', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await toMidPage(page);
    await page.locator(`${bar} a`).click();
    await expect(page.locator(sheet)).toHaveAttribute('open', '');
    expect(await scanA11y(page, testInfo)).toEqual([]);
  });

  test('바가 올라온 상태', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await toMidPage(page);
    expect(await scanA11y(page, testInfo)).toEqual([]);
  });
});
