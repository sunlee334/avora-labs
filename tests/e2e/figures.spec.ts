import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 이미지 브레이크.
 *
 * ── 이 검사가 생긴 이유 ─────────────────────────────────────
 * `.figure` 는 58svh 를 **잘라서**(cover) 채웁니다. 땀 맺힌 피부나 크림
 * 스와치처럼 어디를 잘라도 그 사진인 것에는 맞는 방식입니다.
 *
 * 그런데 흰 배경 가운데 튜브나 노트가 놓인 사진에 같은 방식을 쓰자, 좁은
 * 화면에서 물체가 프레임 밖으로 밀려나고 **아무것도 없는 베이지 사각형** 만
 * 남았습니다. 화면을 열어 보기 전까지는 드러나지 않는 종류의 결함입니다 —
 * 마크업도 통과하고, 접근성 검사도 통과하고, alt 도 멀쩡합니다.
 *
 * 그래서 "어느 사진을 어떻게 채울지" 를 검사에 적어 둡니다.
 */

/** 물체 사진 — 통째로 보여야 합니다. */
const CONTAIN = ['SAMPLE', 'SCORE'];
/** 질감 사진 — 잘라서 화면을 채웁니다. */
const COVER = ['FIELD', 'TEXTURE', 'SKIN', 'WATER'];

async function figures(page: import('@playwright/test').Page) {
  return page.locator('figure.figure').evaluateAll((nodes) =>
    nodes.map((fig) => {
      const img = fig.querySelector('img')!;
      return {
        caption: fig.querySelector('figcaption')?.textContent?.trim() ?? '',
        alt: img.getAttribute('alt') ?? '',
        loading: img.getAttribute('loading'),
        objectFit: getComputedStyle(img).objectFit,
        width: img.getBoundingClientRect().width,
      };
    }),
  );
}

test.describe('이미지 브레이크', () => {
  for (const path of ['/ko/panel/', '/ko/product/', '/ko/']) {
    test(`${path} — 물체 사진은 잘리지 않는다`, async ({ page }) => {
      await page.goto(path);
      const found = await figures(page);
      expect(found.length, `${path} 에 figure 가 없습니다`).toBeGreaterThan(0);

      for (const f of found) {
        if (CONTAIN.includes(f.caption)) {
          expect(f.objectFit, `${f.caption} 이 잘려 여백만 남습니다`).toBe('contain');
        } else if (COVER.includes(f.caption)) {
          expect(f.objectFit, `${f.caption} 이 화면을 채우지 않습니다`).toBe('cover');
        } else {
          throw new Error(
            `캡션 "${f.caption}" 을 이 검사가 모릅니다 — 새 그림을 넣었다면 ` +
              'CONTAIN 이나 COVER 중 어디에 속하는지 여기에 적어 주세요.',
          );
        }
      }
    });
  }

  test('그림은 전부 지연 로딩이고 설명이 붙어 있다', async ({ page }) => {
    for (const path of ['/ko/panel/', '/ko/product/']) {
      await page.goto(path);
      for (const f of await figures(page)) {
        // 히어로가 아니므로 첫 화면을 늦출 이유가 없습니다.
        expect(f.loading, `${path} ${f.caption} 이 즉시 로딩입니다`).toBe('lazy');
        // 캡션은 라벨이지 설명이 아닙니다. 그림이 안 뜬 사람에게 남는 것은 alt 입니다.
        expect(f.alt.length, `${path} ${f.caption} 에 설명이 없습니다`).toBeGreaterThan(4);
        expect(f.alt, `${f.caption} 의 alt 가 캡션을 되풀이합니다`).not.toBe(f.caption);
      }
    }
  });

  test('설명이 언어마다 그 언어로 적혀 있다', async ({ page }) => {
    /*
     * alt 는 화면에 안 보여서 번역을 빠뜨리기 쉽습니다. 한국어 문장이 다른
     * 언어판에 그대로 남아 있으면 스크린리더 사용자만 한국어를 듣게 됩니다.
     */
    const seen = new Map<string, Set<string>>();
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/panel/`);
      for (const f of await figures(page)) {
        if (!seen.has(f.caption)) seen.set(f.caption, new Set());
        seen.get(f.caption)!.add(f.alt);
      }
    }
    for (const [caption, alts] of seen) {
      expect(alts.size, `${caption} 의 설명이 ${LOCALES.length}개 언어에서 ${alts.size}종뿐입니다`)
        .toBe(LOCALES.length);
    }
  });

  test('그림을 넣어도 가로로 넘치지 않는다', async ({ page }) => {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/panel/`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${locale} /panel 이 가로로 ${overflow}px 넘칩니다`).toBeLessThanOrEqual(0);
    }
  });
});
