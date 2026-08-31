import { test, expect } from '@playwright/test';
import { LOCALES, INDEXED_LOCALES } from '../../src/config/site';

/**
 * 레이아웃 — 컨테이너, 리듬, 배경 밴드.
 *
 * 이 층이 없어서 생긴 일이 세 가지로 보고됐습니다. "홈이 허전하다",
 * "브랜드 링크가 어색하다", "내용이 좌측으로 쏠린다". 셋 다 같은 누락에서
 * 나왔습니다 — 색과 컴포넌트는 정의돼 있었는데 그 사이의 레이아웃이 없었습니다.
 */

const PAGES = ['/ko/', '/ko/brand/', '/ko/product/'];

test.describe('컨테이너', () => {
  test('내용이 가운데 모이고, 배경 밴드는 화면을 채운다', async ({ page }) => {
    /*
     * 둘은 같은 요소에 걸려 있습니다(`<section class="section section--alt wrap">`).
     * `.wrap` 에 max-width 를 주면 섹션이 좁아지고 **배경까지 줄어듭니다** —
     * 처음에 그렇게 했다가 1440px 화면에서 교차 섹션 배경이 1120px 로
     * 잘렸습니다. 밴드는 전체 폭이고 내용만 가운데여야 합니다.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');

    const band = page.locator('.section--alt').first();
    const bandBox = (await band.boundingBox())!;
    expect(Math.round(bandBox.width), '배경 밴드가 화면을 채우지 않습니다').toBe(1440);

    const inner = (await band.locator('.display, h2, p.body').first().boundingBox())!;
    const leftGap = inner.x - bandBox.x;
    const rightGap = bandBox.x + bandBox.width - (inner.x + inner.width);

    // 좌우가 같아야 하고 —
    expect(Math.abs(leftGap - rightGap), `좌우 여백이 ${Math.round(leftGap)}/${Math.round(rightGap)}`).toBeLessThan(2);

    /*
     * — 화면이 컨테이너보다 넓으면 그 차이만큼 벌어져야 합니다.
     *
     * 대칭만 보면 부족합니다. 컨테이너 상한이 없어도 좌우 여백은 늘 같으니
     * (양쪽 다 48px) 검사가 통과합니다. 실제로 사보타주가 지나갔습니다.
     * 1440px 화면에서 1120px 컨테이너면 한쪽이 160px 이어야 합니다.
     */
    expect(
      Math.round(leftGap),
      `화면 1440px 인데 여백이 ${Math.round(leftGap)}px — 컨테이너 상한이 없습니다`,
    ).toBe(160);
  });

  test('헤드라인과 본문이 같은 기준선을 쓴다', async ({ page }) => {
    /*
     * 이게 "좌측으로 쏠려 보인다" 의 정체였습니다. 헤드라인은 블록이라 화면
     * 끝까지 늘어나고 본문은 65ch 에서 멈춰, 1440px 에서 오른쪽 끝이 811px
     * 어긋났습니다. 왼쪽은 맞는데 오른쪽이 들쭉날쭉하면 쏠려 보입니다.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    const sec = page.locator('.section').filter({ has: page.locator('p.body') }).first();
    const head = (await sec.locator('.display, h2').first().boundingBox())!;
    expect(Math.round(head.width), '헤드라인이 컨테이너보다 넓습니다').toBeLessThanOrEqual(1120);
  });

  test('본문 텍스트를 가운데 정렬하지 않는다', async ({ page }) => {
    /*
     * "좌측으로 쏠린다" 는 보고를 받고 `text-align: center` 로 바꾸면 안 됩니다.
     * 블록을 화면 가운데 놓는 것과 글자를 가운데로 모으는 것은 다릅니다.
     * 가운데 정렬된 본문은 줄마다 시작점이 달라 읽기 어렵습니다.
     */
    for (const path of PAGES) {
      await page.goto(path);
      const aligns = await page.evaluate(() =>
        [...document.querySelectorAll('main p.body')].map((el) => getComputedStyle(el).textAlign),
      );
      expect(aligns.every((a) => a !== 'center'), `${path} 에 가운데 정렬된 본문이 있습니다`).toBe(true);
    }
  });

  test('긴 글 섹션은 한 줄이 40~50자 범위다', async ({ page }) => {
    // 1120px 로 흘리면 한글 70자를 넘어, 눈이 다음 줄 첫머리를 찾지 못합니다.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/brand/');
    const chars = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.wrap--narrow p.body')!;
      const cs = getComputedStyle(el);
      // 한글은 글자 하나가 대체로 font-size 만큼 넓습니다.
      return el.getBoundingClientRect().width / parseFloat(cs.fontSize);
    });
    expect(Math.round(chars), `한 줄 약 ${Math.round(chars)}자`).toBeLessThanOrEqual(52);
  });
});

test.describe('섹션 리듬', () => {
  test('여백이 한 값으로 통일돼 있지 않다', async ({ page }) => {
    /*
     * 모든 섹션이 같은 여백이면 페이지가 한 덩어리로 읽힙니다. 실측했을 때
     * 홈의 아홉 섹션이 예외 없이 104px 이었습니다.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    const values = await page.evaluate(() =>
      [...document.querySelectorAll('main .section')].map(
        (s) => getComputedStyle(s).paddingBlockStart,
      ),
    );
    expect(new Set(values).size, `여백이 ${[...new Set(values)].join(', ')} 뿐입니다`).toBeGreaterThan(1);
  });

  test('섹션 여백은 토큰에서만 온다', async ({ page }) => {
    // 임의의 px 값이 섞이면 리듬이 아니라 우연이 됩니다.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    const allowed = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return [
        cs.getPropertyValue('--space-section-desktop'),
        cs.getPropertyValue('--space-section-lg-desktop'),
        cs.getPropertyValue('--space-section-sm-desktop'),
      ].map((v) => v.trim());
    });
    const used = await page.evaluate(() =>
      [...document.querySelectorAll('main .section')].map((s) => getComputedStyle(s).paddingBlockStart),
    );
    const stray = used.filter((v) => !allowed.includes(v));
    expect(stray, `토큰 밖의 값: ${[...new Set(stray)].join(', ')}`).toEqual([]);
  });
});

test.describe('배경 밴드', () => {
  test('같은 배경이 세 개 이상 연속되지 않는다', async ({ page }) => {
    // 스크롤하는 동안 화면이 변하지 않으면 페이지가 비어 보입니다.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    const runs = await page.evaluate(() => {
      const bgs = [...document.querySelectorAll('main .section')].map(
        (s) => getComputedStyle(s).backgroundColor,
      );
      let max = 0, cur = 1;
      for (let i = 1; i < bgs.length; i++) {
        cur = bgs[i] === bgs[i - 1] ? cur + 1 : 1;
        max = Math.max(max, cur);
      }
      return max;
    });
    expect(runs, `같은 배경이 ${runs}개 연속입니다`).toBeLessThan(3);
  });

  test('어두운 밴드 안의 글자가 읽힌다', async ({ page }) => {
    /*
     * `.section--dark` 는 역할 토큰 자체를 뒤집습니다. 전에는 `.kicker` 와
     * `.body` 두 클래스만 이름으로 적었는데, 그러면 밴드에 새 클래스가 들어올
     * 때마다 빠집니다 — The Journey 를 옮기자 50개 요소가 1.75:1 이 됐습니다.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ['/ko/', '/ko/brand/']) {
      await page.goto(path);
      const worst = await page.evaluate(() => {
        const lin = (c: number) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        const L = (s: string) => {
          const [r, g, b] = s.match(/\d+/g)!.slice(0, 3).map(Number);
          return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        };
        let min = 99;
        for (const sec of document.querySelectorAll('.section--dark')) {
          const bg = L(getComputedStyle(sec).backgroundColor);
          for (const el of sec.querySelectorAll<HTMLElement>('p, h2, li, span, blockquote')) {
            if (!el.textContent?.trim()) continue;
            if (el.querySelector('p, h2, li, span, blockquote')) continue;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            const cs = getComputedStyle(el);
            const fg = L(cs.color);
            const [hi, lo] = [fg, bg].sort((a, b) => b - a);
            const ratio = (hi + 0.05) / (lo + 0.05);
            const large =
              parseFloat(cs.fontSize) >= 24 ||
              (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
            min = Math.min(min, ratio / (large ? 3 : 4.5));
          }
        }
        return min;
      });
      expect(worst, `${path} 어두운 밴드 대비가 기준의 ${(worst * 100).toFixed(0)}%`).toBeGreaterThanOrEqual(1);
    }
  });
});

test.describe('브랜드 페이지', () => {
  test('5개 언어에 있고 헤더가 그곳을 가리킨다', async ({ page, request }) => {
    /*
     * 전에는 `/{lang}/#story` 앵커였습니다. 섹션 순서가 바뀌면서 누르면
     * 페이지 중간으로 튕겼습니다 — 네비게이션이 목적지를 약속하고 스크롤을
     * 배달하는 셈이었습니다.
     */
    for (const lang of LOCALES) {
      const res = await request.get(`/${lang}/brand/`);
      expect(res.status(), `/${lang}/brand/ 가 열리지 않습니다`).toBe(200);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    const href = await page.locator('.nav__links a', { hasText: '브랜드' }).first().getAttribute('href');
    expect(href, '헤더가 아직 앵커를 가리킵니다').toBe('/ko/brand/');
  });

  test('밖에 공유된 #story 링크가 깨지지 않는다', async ({ page }) => {
    // 인스타 프로필·단톡방·북마크에 남아 있을 수 있습니다.
    await page.goto('/ko/#story');
    await page.waitForURL(/\/ko\/brand\/?$/, { timeout: 5000 });
    await expect(page.locator('#story')).toBeVisible();
  });

  test('자바스크립트가 없어도 브랜드로 가는 길이 홈에 있다', async ({ request }) => {
    // #story 넘김은 스크립트가 합니다. 없으면 홈에 머무는데, 그때도 길은 있어야 합니다.
    const html = await (await request.get('/ko/')).text();
    expect(html, '홈에 /brand 링크가 없습니다').toContain('href="/ko/brand/"');
  });

  test('색인하는 언어만 사이트맵에 있다', async ({ request }) => {
    const xml = await (await request.get('/sitemap-0.xml')).text();
    for (const lang of INDEXED_LOCALES) {
      expect(xml, `${lang} 브랜드 페이지가 사이트맵에 없습니다`).toContain(`/${lang}/brand/`);
    }
    for (const lang of LOCALES.filter((l) => !INDEXED_LOCALES.includes(l))) {
      expect(xml, `${lang} 은 색인 대상이 아닌데 사이트맵에 있습니다`).not.toContain(`/${lang}/brand/`);
    }
  });
});
