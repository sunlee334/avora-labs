import { test, expect } from '@playwright/test';

/**
 * 다섯 단계를 가로로 넘긴다.
 *
 * ── 왜 가로인가 ────────────────────────────────────────────
 * 세로 스크롤 열 장 내내 리듬이 한 가지였습니다. `01 Sun → 05 Reset` 은
 * 순서가 있는 내용이라 가로 흐름과 맞고, 224px 이던 칸에서 서너 줄로 눌리던
 * 설명이 두 줄로 앉습니다.
 *
 * ── 이 검사가 지키는 것 ────────────────────────────────────
 * 넘길 수 있는지만 보면 부족합니다. 스크롤 막대를 감췄기 때문에 **넘길 수
 * 있다는 사실이 보이는가** 가 함께 지켜져야 합니다 — 화살표, 위치 표시,
 * 그리고 좁은 화면에서 다음 칸이 살짝 보이는 것.
 *
 * 목록 의미도 봅니다. `role="region"` 을 <ol> 에 직접 걸면 목록이 덮여
 * "다섯 중 둘째" 를 읽어 주지 못합니다.
 */

const RAIL = '[data-journey]';

test.describe('다섯 단계 레일', () => {
  test('키보드로 갈 수 있고 목록 의미가 남아 있다', async ({ page }) => {
    await page.goto('/ko/');
    const rail = page.locator(RAIL);
    await expect(rail).toHaveAttribute('role', 'region');
    await expect(rail).toHaveAttribute('tabindex', '0');
    expect((await rail.getAttribute('aria-label'))?.trim()).toBeTruthy();
    // 상자에 role 을 걸되 목록은 그 안에 그대로 있어야 합니다.
    await expect(rail.locator('ol > li')).toHaveCount(5);
  });

  for (const width of [390, 1280]) {
    test(`${width}px — 넘길 수 있고 첫 칸이 본문과 같은 자리에서 시작한다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ko/');
      await page.evaluate(() => document.fonts.ready);

      const m = await page.evaluate((sel) => {
        const rail = document.querySelector<HTMLElement>(sel)!;
        const li = [...rail.querySelectorAll<HTMLElement>('li')];
        const wrap = rail.closest('.wrap')!;
        const cs = getComputedStyle(wrap);
        return {
          칸폭: Math.round(li[0].getBoundingClientRect().width),
          간격: Math.round(li[1].offsetLeft - li[0].offsetLeft - li[0].offsetWidth),
          넘길거리: rail.scrollWidth - rail.clientWidth,
          시작차: Math.round(
            li[0].getBoundingClientRect().left -
              (wrap.getBoundingClientRect().left + Number.parseFloat(cs.paddingLeft)),
          ),
          엿보임: Math.round(rail.clientWidth - li[0].getBoundingClientRect().width),
          페이지넘침: Math.max(0, Math.round(document.documentElement.scrollWidth - innerWidth)),
        };
      }, RAIL);

      expect(m.칸폭, `칸이 ${m.칸폭}px 입니다`).toBeGreaterThanOrEqual(280);
      expect(m.칸폭).toBeLessThanOrEqual(340);
      expect(m.간격, '사이 간격이 24px 이 아닙니다').toBe(24);
      expect(m.넘길거리, '넘길 것이 없습니다').toBeGreaterThan(0);
      expect(Math.abs(m.시작차), `첫 칸이 본문에서 ${m.시작차}px 어긋났습니다`).toBeLessThanOrEqual(1);
      // 다음 칸이 보여야 넘길 수 있다는 것을 압니다.
      expect(m.엿보임, '다음 칸이 전혀 보이지 않습니다').toBeGreaterThan(24);
      expect(m.페이지넘침, '페이지가 가로로 밀렸습니다').toBe(0);
    });
  }

  test('화살표가 한 칸씩 옮기고 위치 표시가 따라온다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);

    const count = page.locator('[data-journey-count]');
    const prev = page.locator('[data-journey-prev]');
    const next = page.locator('[data-journey-next]');
    const text = async () => (await count.textContent())!.replace(/\s+/g, '');

    expect(await text()).toBe('01/05');
    await expect(prev, '맨 앞인데 이전이 눌립니다').toBeDisabled();

    await next.click();
    await expect.poll(text).toBe('02/05');
    await expect(prev).toBeEnabled();

    await prev.click();
    await expect.poll(text).toBe('01/05');
    await expect(prev).toBeDisabled();
  });

  test('세로 스크롤을 가로로 바꾸지 않는다', async ({ page, browserName }) => {
    // 휠이 없는 기기에는 해당하지 않습니다. 모바일 WebKit 은 wheel 자체를 못 씁니다.
    test.skip(browserName === 'webkit', '휠이 없는 환경입니다');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    const rail = page.locator(RAIL);
    await rail.scrollIntoViewIfNeeded();

    /*
     * 스크롤 잭이 걸려 있으면 이 섹션 위에서 휠을 굴려도 페이지가 내려가지
     * 않습니다. 레일 위에 손을 올린 채 굴려서 문서가 실제로 움직이는지 봅니다.
     */
    const before = await page.evaluate(() => document.documentElement.scrollTop);
    await rail.hover();
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => document.documentElement.scrollTop);
    expect(after, '레일 위에서 페이지가 멈췄습니다 — 스크롤 잭입니다').toBeGreaterThan(before);
  });

  for (const lang of ['ko', 'en', 'zh', 'th', 'vi']) {
    test(`/${lang}/ — 화살표에 이름이 있다`, async ({ page }) => {
      await page.goto(`/${lang}/`);
      /*
       * 이름이 비면 axe 가 critical 로 잡습니다. 실제로 한 번 그랬습니다 —
       * 번역 키를 넣는 정규식이 **첫 번째** `imageAlt` 에 붙어 히어로 밑으로
       * 들어갔고, 다섯 파일이 똑같이 틀려 키 구조 검사는 통과했습니다.
       * 그래서 파일이 아니라 **화면에 붙은 이름** 을 봅니다.
       */
      for (const sel of ['[data-journey-prev]', '[data-journey-next]']) {
        const name = await page.locator(sel).getAttribute('aria-label');
        expect(name?.trim(), `${sel} 에 이름이 없습니다`).toBeTruthy();
      }
    });
  }

  test('화살표 탭 영역이 44px 이상이다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    for (const sel of ['[data-journey-prev]', '[data-journey-next]']) {
      const box = (await page.locator(sel).boundingBox())!;
      expect(Math.round(box.width), `${sel} 폭 ${box.width}`).toBeGreaterThanOrEqual(44);
      expect(Math.round(box.height), `${sel} 높이 ${box.height}`).toBeGreaterThanOrEqual(44);
    }
  });
});
