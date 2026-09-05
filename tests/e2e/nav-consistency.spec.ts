import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 헤더 한 줄이 같은 규칙으로 그려지는가.
 *
 * ── 무엇이 흩어져 있었나 ───────────────────────────────────
 * `<nav>` 안에 폰트 3종, 크기 3종, 자간 6종, 패딩 4종이 섞여 있었습니다.
 * 가장 눈에 띄는 것은 **마이페이지** 였습니다 — 왼쪽 메뉴 넷은 Body 13px 인데
 * 혼자 Mono 12px 이라, 성격이 같은 링크가 다른 물건처럼 보였습니다.
 *
 * ── 남긴 예외 ──────────────────────────────────────────────
 * `KO` 만 Mono 입니다. 읽는 낱말이 아니라 **기호** 에 가깝습니다.
 *
 * ── 기준선 ─────────────────────────────────────────────────
 * `.nav__utility` 의 밑줄을 `border-bottom` 으로 그리면 상자에 1px 이 더해지고,
 * 그 줄이 행의 키를 정하는 쪽이라 안쪽 링크가 옆 메뉴보다 0.5px 위에 섭니다.
 * 가짜 요소로 그려 높이에서 뺐습니다.
 */

test.describe('헤더 일관성', () => {
  test('메뉴와 마이페이지가 같은 글자다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);

    const m = await page.evaluate(() => {
      const pick = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const c = getComputedStyle(el);
        return {
          family: c.fontFamily.split(',')[0].replace(/["']/g, ''),
          size: c.fontSize,
          ls: c.letterSpacing,
          padX: c.paddingLeft,
          padTop: c.paddingTop,
        };
      };
      return {
        link: pick('.nav__links a'),
        caret: pick('.nav__links button'),
        account: pick('.nav__account'),
        lang: pick('[data-lang-open]'),
      };
    });

    expect(m.account, '마이페이지를 못 찾았습니다').not.toBeNull();
    expect(m.account!.family, '마이페이지가 메뉴와 다른 폰트입니다').toBe(m.link!.family);
    expect(m.account!.size, '마이페이지가 메뉴와 다른 크기입니다').toBe(m.link!.size);
    expect(m.account!.ls, '마이페이지가 메뉴와 다른 자간입니다').toBe(m.link!.ls);
    expect(m.account!.padX, '마이페이지가 메뉴와 다른 여백입니다').toBe(m.link!.padX);

    // 화살표 버튼은 자간을 물려받지 않아 혼자 normal 이었습니다.
    expect(m.caret!.ls, '화살표 버튼의 자간이 메뉴와 다릅니다').toBe(m.link!.ls);

    // KO 는 기호라 Mono 예외. 다만 <button> 기본 여백 1px 은 없어야 합니다.
    expect(m.lang!.padTop, 'KO 버튼에 브라우저 기본 여백이 남아 있습니다').toBe('0px');
  });

  test('메뉴와 마이페이지의 기준선이 같다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);

    const b = await page.evaluate(() => {
      // 상자가 아니라 **글자** 의 아래쪽을 봅니다.
      const bottom = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()];
        return rects.length ? Math.max(...rects.map((r) => r.bottom)) : null;
      };
      return { menu: bottom('.nav__links a'), account: bottom('.nav__account') };
    });

    expect(b.account).not.toBeNull();
    expect(
      Math.abs(b.menu! - b.account!),
      `기준선이 ${Math.abs(b.menu! - b.account!).toFixed(2)}px 어긋났습니다`,
    ).toBeLessThan(0.5);
  });

  test('헤더에 쓰이는 서체가 둘뿐이다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);

    const fams = await page.evaluate(() => {
      const seen = new Set<string>();
      for (const el of document.querySelectorAll('.nav a, .nav button, .nav span')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (!(el.textContent ?? '').trim()) continue;
        seen.add(getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, ''));
      }
      return [...seen].sort();
    });
    /*
     * Display(로고) · Body(메뉴) · Mono(KO) 셋입니다. Mono 는 기호 하나에만
     * 남긴 예외라, 넷 이상이 되면 규칙이 다시 흩어진 것입니다.
     */
    expect(fams.length, `서체가 ${fams.join(', ')} 입니다`).toBeLessThanOrEqual(3);
  });

  for (const lang of LOCALES) {
    test(`/${lang}/ — 여백을 넓혀도 가로로 밀리지 않는다`, async ({ page }) => {
      /*
       * 높이는 여기서 재지 않습니다. `header-shape.spec.ts` 가 이미 한 행
       * 여부를 지키고 있고, 그 숫자를 여기서 다시 정하면 둘이 어긋납니다.
       *
       * 여기서 보는 것은 **이 작업이 더한 폭** 입니다. 메뉴 여백을 6 → 8px 로
       * 올렸고 마이페이지가 Mono 12px 에서 Body 13px 이 되었습니다. 라벨이 긴
       * 언어에서 그만큼이 넘침으로 나타나는지 봅니다.
       */
      for (const width of [1120, 1280, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${lang}/`);
        await page.evaluate(() => document.fonts.ready);
        const overflow = await page.evaluate(() =>
          Math.max(0, Math.round(document.documentElement.scrollWidth - innerWidth)),
        );
        expect(overflow, `${width}px 에서 가로로 밀렸습니다`).toBe(0);
      }
    });
  }
});
