import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 글이 읽기 좋은 폭으로 흐르는가.
 *
 * ── 본문 ───────────────────────────────────────────────────
 * `--size-measure` 가 65ch 였습니다. 라틴 기준으로는 맞는 값인데, 한글은
 * `ch` 한 칸에 두 배 가까이 들어가서 1280px 화면에서 한 줄이 **38자** 밖에
 * 안 됐습니다. 컨테이너는 1120px 인데 글이 581px 만 쓰니 오른쪽이 통째로
 * 비어, 계속 지적돼 온 "좌측 쏠림" 으로 읽혔습니다.
 *
 * 72ch(645px, 한글 43자)로 올렸습니다. 이 저장소가 `.wrap--narrow` 주석에
 * 적어 둔 "40~50자가 편안하다" 와 지시서의 620~680px 이 같은 지점을
 * 가리킵니다.
 *
 * ⚠️ **`text-align: center` 로 풀지 않습니다.** 지시서가 명시적으로 금지했고,
 * 블록을 가운데 두는 것과 텍스트를 가운데 정렬하는 것은 다릅니다.
 *
 * ── 히어로 보조문구 ────────────────────────────────────────
 * `max-width: 22ch`(210px)라 "기준은 공개하고, 점수는 / 맡깁니다." 로
 * 끊겼습니다. 34ch 로 넓히고 `text-wrap: balance` 를 함께 줍니다 — 폭만
 * 넓히면 언어마다 다시 어긋나고, 줄을 고르게 나누는 일은 글자 폭을 아는
 * 브라우저가 하는 편이 낫습니다.
 */

/** 지시서가 요청한 범위. 아래는 좌측 쏠림, 위는 한 줄이 너무 길어집니다. */
const BODY_MIN = 620;
const BODY_MAX = 700;

test.describe('본문 폭', () => {
  for (const width of [1280, 1920]) {
    test(`${width}px — 본문이 ${BODY_MIN}~${BODY_MAX}px 로 흐른다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ko/');

      const body = await page.evaluate(() => {
        const el = [...document.querySelectorAll('p.body')].find(
          (e) => (e.textContent ?? '').trim().length > 60,
        );
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          w: Math.round(el.getBoundingClientRect().width),
          align: cs.textAlign,
        };
      });

      expect(body, '본문 문단을 못 찾았습니다').not.toBeNull();
      expect(body!.w, `본문 폭이 ${body!.w}px 입니다`).toBeGreaterThanOrEqual(BODY_MIN);
      expect(body!.w, `본문 폭이 ${body!.w}px 입니다`).toBeLessThanOrEqual(BODY_MAX);
      // 지시서가 금지한 해법입니다 — 폭 문제를 정렬로 덮지 않습니다.
      expect(body!.align, '본문을 가운데 정렬로 덮었습니다').not.toBe('center');
    });
  }

  test('모바일에서는 컨테이너가 폭을 정한다', async ({ page }) => {
    /*
     * `max-width` 를 올려도 좁은 화면에서는 컨테이너가 먼저 걸립니다.
     * 여기가 바뀌었다면 모바일 여백을 건드린 것입니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    const w = await page.evaluate(() => {
      const el = [...document.querySelectorAll('p.body')].find(
        (e) => (e.textContent ?? '').trim().length > 60,
      )!;
      return Math.round(el.getBoundingClientRect().width);
    });
    expect(w).toBeLessThanOrEqual(360);
    expect(w).toBeGreaterThanOrEqual(320);
  });
});

test.describe('히어로 보조문구', () => {
  for (const locale of LOCALES) {
    test(`${locale} — 어절 중간에서 끊기지 않는다`, async ({ page }) => {
      await page.goto(`/${locale}/`);
      await page.evaluate(() => document.fonts.ready);

      const lines = await page.locator('.hero__promise').evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return [...range.getClientRects()]
          .filter((r) => r.width > 1)
          .map((r) => Math.round(r.width));
      });

      expect(lines.length, '보조문구를 못 읽었습니다').toBeGreaterThan(0);
      // 세 줄로 갈리면 짧은 한 문장이 조각납니다.
      expect(lines.length, `${locale} 에서 ${lines.length}줄로 갈립니다`).toBeLessThanOrEqual(2);

      if (lines.length === 2) {
        /*
         * 두 줄이 되는 언어가 있습니다(베트남어). 그 자체는 문장이 길어서
         * 생기는 일이라 괜찮습니다 — 문제는 **한 줄만 길고 다른 줄에 낱말
         * 하나가 남는** 모양입니다. `text-wrap: balance` 가 그걸 막습니다.
         */
        const [a, b] = lines;
        const spread = Math.abs(a - b) / Math.max(a, b);
        expect(spread, `${locale} 두 줄의 길이가 ${a}px 대 ${b}px 로 벌어졌습니다`).toBeLessThan(
          0.35,
        );
      }
    });
  }
});
