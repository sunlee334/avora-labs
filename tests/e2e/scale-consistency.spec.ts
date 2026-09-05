import { test, expect } from '@playwright/test';

/**
 * 값이 스케일 위에 있는가.
 *
 * ── 이 검사가 지키는 것 ────────────────────────────────────
 * 종류 수를 세지 않습니다. 개수는 페이지가 자라면 자연히 늘고, 그걸로 막으면
 * 새 화면을 못 만듭니다.
 *
 * 대신 두 가지만 봅니다.
 *
 *   1. **같은 크기는 같은 행간** 을 쓰는가
 *      16px 이 28px 과 24px 두 행간으로 갈려 있었습니다. 크기가 같은데 줄
 *      간격이 다르면 같은 글이 자리마다 다르게 읽힙니다.
 *
 *   2. **간격이 4의 배수** 인가
 *      10 · 20 · 26px 이 섞여 있었습니다. 스케일이 없으면 다음 사람이 또
 *      어림값을 넣습니다.
 *
 * ── 남겨 둔 예외 ───────────────────────────────────────────
 * `.hero__promise`(16px/24px)는 히어로 조판입니다. 그 구역은 태그라인·2차
 * 메시지·출시 문구가 세 위계를 이루도록 `clamp()` 로 잡혀 있고, 지시서가
 * "헤드라인 타이포를 손대지 않는다" 고 못박은 자리입니다.
 */

const EXEMPT_LEADING = ['hero__promise'];

test.describe('스케일', () => {
  test('같은 크기는 같은 행간을 쓴다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 800) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });

    const clashes = await page.evaluate((exempt) => {
      const byKey = new Map<string, Set<string>>();
      for (const el of document.querySelectorAll('main p')) {
        if (exempt.some((c) => el.classList.contains(c))) continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0 || !(el.textContent ?? '').trim()) continue;
        const cs = getComputedStyle(el);
        const key = `${cs.fontSize} ${cs.fontFamily.split(',')[0]}`;
        const set = byKey.get(key) ?? new Set<string>();
        set.add(cs.lineHeight);
        byKey.set(key, set);
      }
      return [...byKey]
        .filter(([, v]) => v.size > 1)
        .map(([k, v]) => `${k} → ${[...v].join(' vs ')}`);
    }, EXEMPT_LEADING);

    expect(clashes, `같은 크기에 행간이 둘입니다:\n  ${clashes.join('\n  ')}`).toEqual([]);
  });

  test('간격이 4의 배수다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);

    const odd = await page.evaluate(() => {
      const out = new Set<string>();
      for (const el of document.querySelectorAll('main *')) {
        const cs = getComputedStyle(el);
        if (!/grid|flex/.test(cs.display)) continue;
        for (const v of [cs.rowGap, cs.columnGap]) {
          if (!v || v === 'normal') continue;
          const n = Number.parseFloat(v);
          /*
           * 2px 은 예외입니다. 수량 조절(− 1 +)과 별점처럼 **한 덩어리로
           * 읽혀야 하는 것** 을 붙여 놓은 값이라, 4px 로 벌리면 셋이 각각
           * 따로 보입니다. 지시서도 "확인 후 판단" 으로 남겼습니다.
           */
          if (n === 0 || n === 2) continue;
          if (n % 4 !== 0) out.add(`${el.className || el.tagName}: ${v}`);
        }
      }
      return [...out];
    });

    expect(odd, `4의 배수가 아닌 간격:\n  ${odd.join('\n  ')}`).toEqual([]);
  });

  test('지시서가 지목한 어긋난 값이 없다', async ({ page }) => {
    /*
     * ⚠️ **소수점을 전부 막지 않습니다.**
     *
     * 처음에는 "소수점 크기 금지" 로 썼는데, 이 저장소에는 10.5 · 13.5 · 14.5 ·
     * 15.5px 이 **스물네 곳** 있습니다. 어림값이 아니라 의도된 반 단계
     * 스케일입니다. 그걸 전부 걷어내는 것은 지시서 범위 밖이고, 지시서도
     * "판단이 갈리는 항목은 바꾸지 말고 보고한다" 고 적었습니다.
     *
     * 지시서가 지목한 것은 **한 값** 입니다 — `12.5px`. 같은 역할의 이웃이
     * 12px 인데 혼자 소수였고, 출처도 불명이었습니다. 같은 이유로 라벨
     * 스케일에서 혼자 11.5px 이던 것도 함께 11px 로 맞췄습니다.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);

    const found = await page.evaluate(() => {
      const bad = new Set(['12.5px', '11.5px']);
      const out = new Set<string>();
      for (const el of document.querySelectorAll('main *')) {
        const size = getComputedStyle(el).fontSize;
        if (bad.has(size)) out.add(`${el.className || el.tagName}: ${size}`);
      }
      return [...out];
    });
    expect(found, `되돌아왔습니다: ${found.join(', ')}`).toEqual([]);
  });
});
