import { test, expect } from '@playwright/test';
import ko from '../../../src/i18n/ko.json' with { type: 'json' };

/**
 * 첫 화면의 버튼.
 *
 * **launch 폴더에 있는 이유:** 판매가 켜진 빌드에는 홈에 신청 폼이 없으므로
 * 이 버튼도 나오지 않습니다. 갈 곳이 없는 버튼을 그리는 것이 이 기능의 가장
 * 나쁜 실패 방식이라, 그 조건은 뿌리의 검사에서 따로 봅니다.
 */

const LANGS = ['ko', 'en', 'zh', 'th', 'vi'] as const;

test.describe('첫 화면의 버튼', () => {
  test('폴드 위에 있다', async ({ page }) => {
    /*
     * 이 버튼이 존재하는 이유가 이것 하나입니다. 실측으로 폼의 제출 버튼이
     * 884px — 폴드(844px) 아래였고, 첫 화면에 누를 것이 없었습니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    const box = await page.locator('.hero__cta').boundingBox();
    expect(box, '버튼이 없습니다').not.toBeNull();
    expect(box!.y + box!.height, `버튼 아랫변이 ${Math.round(box!.y + box!.height)}px`).toBeLessThan(
      844,
    );
  });

  test('자바스크립트 없이도 갈 곳이 적혀 있다', async ({ request }) => {
    // 스크립트는 부드럽게 움직이고 초점을 잡아 주는 것까지만 얹습니다.
    const html = await (await request.get('/ko/')).text();
    expect(html).toMatch(/class="btn hero__cta"[^>]*href="#notify"/);
    expect(html, '착지점이 없습니다').toContain('id="notify"');
  });

  test('폼으로 데려가고 이메일 칸에 초점을 준다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await page.locator('.hero__cta').click();

    const field = page.locator('#notify input[type="email"]');
    await expect(field, '이메일 칸에 초점이 오지 않았습니다').toBeFocused({ timeout: 3000 });
    // 초점만 잡고 화면은 그대로면 손님은 어디로 갔는지 모릅니다.
    await expect(field).toBeInViewport();
  });

  test('초점을 누르는 그 순간에 준다 — iOS 키보드가 뜨려면', async ({ page }) => {
    /*
     * WebKit 은 사용자 제스처 핸들러 **안에서 동기적으로** 부른 focus() 에
     * 대해서만 소프트 키보드를 엽니다. 스크롤이 끝나기를 기다렸다가 부르면
     * 그 턴을 벗어나 커서만 깜빡이고 키보드는 뜨지 않습니다 — 손님은 칸을
     * 한 번 더 누르게 되고, 바텀시트를 물린 이유(탭 한 번)가 사라집니다.
     *
     * Playwright 로 키보드 자체를 볼 수는 없으므로, **언제** 초점이 가는지를
     * 봅니다. 누른 직후(다음 프레임 전)에 이미 가 있어야 합니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');

    const immediate = await page.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>('[data-hero-cta]')!;
      link.click();
      // 같은 턴 안에서 바로 확인합니다 — 타이머도 rAF 도 기다리지 않습니다.
      const el = document.activeElement as HTMLElement | null;
      return el?.tagName === 'INPUT' && el.getAttribute('type') === 'email';
    });
    expect(immediate, '누른 턴 안에서 초점이 가지 않았습니다 — iOS 에서 키보드가 뜨지 않습니다').toBe(
      true,
    );
  });

  test('폼이 완료 상태로 바뀐 뒤 눌러도 고장 나지 않는다', async ({ page }) => {
    /*
     * 신청이 성공하면 입력칸이 감춰집니다(launch-notify.ts 가 .notify__row 에
     * hidden 을 겁니다). 칸을 마운트 시점에 잡아 두면 이미 사라진 것을 붙들고
     * 있게 되고, 그 상태로 focus() 를 부르면 아무 일도 일어나지 않습니다.
     *
     * 실제 신청은 느리고 봇 문턱(2초)도 있어, 성공이 만드는 **DOM 상태**를
     * 그대로 만들어 확인합니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await page.locator('#notify .notify__row').first().evaluate((el) => {
      el.setAttribute('hidden', '');
    });

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.locator('.hero__cta').click();
    await page.waitForTimeout(700);

    expect(errors, `자바스크립트 오류: ${errors.join(' / ')}`).toEqual([]);
    // 칸이 없어도 폼 자리로는 데려가야 합니다.
    await expect(page.locator('#notify')).toBeInViewport();

    /*
     * "감춰진 칸에 초점이 가지 않는다" 는 단언은 두지 않았습니다. 브라우저가
     * 이미 거부하기 때문에 코드에서 그 가드를 빼도 검사가 통과합니다 —
     * 실패할 수 없는 검사는 없는 것보다 나쁩니다.
     */
  });

  test('여러 번 눌러도 뒤로 가기가 한 번이면 된다', async ({ page }) => {
    /*
     * 누를 때마다 주소를 쌓으면 세 번 누른 사람은 뒤로 가기를 세 번 눌러야
     * 원래 화면으로 돌아갑니다. 그사이 아무것도 바뀌지 않으니 뒤로 가기가
     * 고장 난 것처럼 보입니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    const start = await page.evaluate(() => history.length);

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('.hero__cta').click();
      await page.waitForTimeout(250);
    }
    const grew = (await page.evaluate(() => history.length)) - start;
    expect(grew, `주소가 ${grew}개 쌓였습니다`).toBeLessThanOrEqual(1);
  });

  test('뒤로 가면 초점도 첫 화면으로 돌아온다', async ({ page }) => {
    /*
     * 그러지 않으면 화면은 히어로인데 초점은 저 아래 이메일 칸에 남습니다.
     * 그 상태에서 Tab 을 누르면 보이지도 않는 곳에서 이어집니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await page.locator('.hero__cta').click();
    await expect(page.locator('#notify input[type="email"]')).toBeFocused();

    await page.goBack();
    await page.waitForTimeout(400);
    const stuck = await page.evaluate(() => {
      const el = document.activeElement;
      return !!(el && document.getElementById('notify')?.contains(el));
    });
    expect(stuck, '초점이 화면 밖 폼에 남아 있습니다').toBe(false);
  });

  test('착지한 자리가 헤더에 가리지 않는다', async ({ page }) => {
    /*
     * 헤더가 sticky 입니다. scroll-margin 이 없으면 섹션 첫 줄이 헤더 뒤로
     * 들어가, 눌러서 도착했는데 아무것도 안 바뀐 것처럼 보입니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await page.locator('.hero__cta').click();
    await page.waitForTimeout(900);

    const navBottom = (await page.locator('.nav').boundingBox())!.y +
      (await page.locator('.nav').boundingBox())!.height;
    const top = (await page.locator('#notify').boundingBox())!.y;
    expect(top, `섹션 윗변 ${Math.round(top)} · 헤더 아랫변 ${Math.round(navBottom)}`).toBeGreaterThanOrEqual(
      navBottom - 1,
    );
  });

  test('주소에 남아 다시 찾아올 수 있다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    await page.locator('.hero__cta').click();
    await expect(page).toHaveURL(/#notify$/);
  });

  test('움직임을 줄이기로 한 사람에게는 미끄러지지 않는다', async ({ page }) => {
    /*
     * 이 설정을 켠 이유가 전정기관 문제인 경우가 있어, 긴 스크롤 애니메이션이
     * 실제로 어지럼증을 일으킵니다.
     */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');

    const before = await page.evaluate(() => window.scrollY);
    await page.locator('.hero__cta').click();
    // 애니메이션 없이 즉시 도착해야 합니다.
    await page.waitForTimeout(120);
    const after = await page.evaluate(() => window.scrollY);
    expect(after, '즉시 이동하지 않았습니다').toBeGreaterThan(before + 100);
  });

  test('5개 언어에서 탭 영역과 폭을 지킨다', async ({ page }) => {
    for (const lang of LANGS) {
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/${lang}/`);
        const box = await page.locator('.hero__cta').boundingBox();
        expect(box, `${lang} @ ${width}px 에 버튼이 없습니다`).not.toBeNull();
        expect(box!.height, `${lang} @ ${width}px 높이 ${Math.round(box!.height)}`).toBeGreaterThanOrEqual(44);

        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(over, `${lang} @ ${width}px 가로 넘침`).toBeLessThanOrEqual(0);
      }
    }
  });

  test('키보드로 왔을 때 어디 있는지 보인다', async ({ page }) => {
    /*
     * 공용 초점 표시는 잉크색 테두리를 요소 바깥에 그립니다. 밝은 화면에서는
     * 맞지만 이 버튼의 바깥은 **어두운 사진** 이라, 그대로 두면 실측 대비
     * 1.06:1 — 아무것도 보이지 않았습니다. 키보드로 훑는 사람은 지금 어디에
     * 있는지 알 수 없습니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    const cta = page.locator('.hero__cta');
    await cta.focus();

    const ring = await cta.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.outlineColor, width: parseFloat(s.outlineWidth), style: s.outlineStyle };
    });
    expect(ring.style, '초점 테두리가 없습니다').not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);

    /* 색이 밝은 쪽이어야 어두운 사진 위에서 보입니다. */
    const [r, g, b] = ring.color.match(/\d+/g)!.map(Number);
    const lin = (c: number) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    expect(L, `초점 테두리 밝기 ${L.toFixed(3)} — 어두운 사진 위에서 보이지 않습니다`).toBeGreaterThan(0.4);
  });

  test('문구가 폼의 제출 버튼과 같다', async ({ page }) => {
    /*
     * 같은 약속이므로 둘이 갈라지면 안 됩니다. 새 문구를 만들면 5개 언어에
     * 검수받지 않은 줄이 다섯 개 생기기도 합니다.
     */
    await page.goto('/ko/');
    await expect(page.locator('.hero__cta')).toHaveText(ko.notify.submit);
    await expect(page.locator('#notify button[type="submit"]')).toHaveText(ko.notify.submit);
  });

  test('둘은 역할이 달라 스크린리더가 구분한다', async ({ page }) => {
    // 문구가 같으므로 구분은 역할이 합니다 — 이쪽은 링크, 폼 쪽은 버튼.
    await page.goto('/ko/');
    expect(await page.locator('.hero__cta').evaluate((el) => el.tagName)).toBe('A');
    expect(
      await page.locator('#notify button[type="submit"]').evaluate((el) => el.tagName),
    ).toBe('BUTTON');
  });
});
