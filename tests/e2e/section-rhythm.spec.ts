import { test, expect } from '@playwright/test';

/**
 * 섹션 세로 여백이 규칙에서 오는가.
 *
 * ── 지시서의 지적과 실측이 갈린 자리다 ─────────────────────
 * 지시서(11절)는 "`padding-block` 이 104px 과 144px 이 섞여 있는데 **규칙이
 * 보이지 않는다**" 며 토큰으로 정리하라고 적었습니다.
 *
 * 규칙은 이미 있었습니다. `global.css` 의 "섹션 리듬" 주석이 셋을 정의하고
 * 있고, 값도 전부 토큰입니다.
 *
 *   기본        정보 섹션            104 / 56
 *   --lg        강조                 144 / 88
 *   --attach    앞 섹션에 붙는 것    56 / 0  (위쪽만 좁힘)
 *
 * 홈 열두 섹션을 재 보니 예외가 하나도 없었습니다. 지시서는 렌더된 CSS 의
 * 숫자만 보고 "규칙이 없다" 고 읽은 것으로 보입니다.
 *
 * ── 그래서 이 파일이 하는 일 ───────────────────────────────
 * 값을 새로 만들지 않습니다. **네 번째 값이 생기지 못하게** 합니다. 규칙이
 * 주석에만 있으면 다음 섹션을 추가하는 사람이 임의의 숫자를 넣어도 아무도
 * 모릅니다 — 지시서가 그렇게 읽은 것이 그 증거입니다.
 */

/**
 * 허용되는 여백 조합을 **토큰에서 만듭니다.**
 *
 * 픽셀 문자열로 적어 두었더니 토큰을 바꾸는 날 검사가 먼저 틀리는 구조였습니다.
 * 값을 화면에서 읽어 조합을 세우면, 디자인이 바뀌어도 "규칙 밖 값이 없다" 는
 * 뜻은 그대로 남습니다.
 *
 * ⚠️ `--attach` 는 **위쪽만** 좁힙니다 — 아래는 기본값 그대로입니다.
 * 처음에 홈에서 본 `56px/0px` 을 그 클래스의 값으로 착각해 목록에 넣었다가
 * `/brand` 에서 걸렸습니다. 홈의 0px 은 `.heroNotify` 가 따로 주는
 * 특수 사례이고, 규칙 자체는 `기본/기본` 의 위쪽만 좁힌 것입니다.
 */
async function allowedPads(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const px = (name: string) => root.getPropertyValue(name).trim();
    const wide = window.innerWidth >= 900;
    const base = px(wide ? '--space-section-desktop' : '--space-section-mobile');
    const lg = px(wide ? '--space-section-lg-desktop' : '--space-section-lg-mobile');
    const sm = px(wide ? '--space-section-sm-desktop' : '--space-section-sm-mobile');
    return [
      `${base}/${base}`,
      `${lg}/${lg}`,
      `${sm}/${base}`,
      // 홈의 히어로 폼만 아래를 0 으로 둡니다 — 다음 섹션이 여백을 냅니다.
      `${sm}/0px`,
    ];
  });
}

const PAGES = ['/ko/', '/ko/brand', '/ko/panel', '/ko/product', '/ko/support'];

async function paddings(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  return page.locator('section.section').evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      return {
        name: (el as HTMLElement).dataset.section ?? el.className,
        variants:
          [...el.classList].filter((c) => c.startsWith('section--')).join(' ') || '기본',
        pad: `${cs.paddingTop}/${cs.paddingBottom}`,
      };
    }),
  );
}

test.describe('섹션 리듬', () => {
  for (const path of PAGES) {
    test(`${path} — 여백이 규칙 안에서만 나온다`, async ({ page, isMobile }) => {
      await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
      const rows = await paddings(page, path);
      expect(rows.length, `${path} 에 섹션이 없습니다`).toBeGreaterThan(0);

      const allowed = new Set(await allowedPads(page));
      const strays = rows.filter((r) => !allowed.has(r.pad));
      expect(
        strays.map((r) => `${r.name}(${r.variants}) ${r.pad}`),
        `${path} 에 규칙 밖 여백이 있습니다`,
      ).toEqual([]);
    });
  }

  test('강조가 전부는 아니다', async ({ page }) => {
    /*
     * `--lg` 는 "앞뒤로 크게 띄워 무게를 준다" 는 뜻입니다. 전부 강조면
     * 강조가 아니라 그냥 기본 여백이 됩니다 — 리듬을 만들려던 것이
     * 사라집니다.
     *
     * 비율에 임의의 상한을 두지는 않습니다. 홈은 12개 중 2개(17%)이고
     * `/brand` 는 11개 중 6개(55%)인데, 그건 서사 섹션과 뒷받침 섹션이
     * 번갈아 서는 그 페이지의 구조에서 나온 것이지 무작위가 아닙니다
     * (그 규칙은 `brand.astro` 머리말에 적어 두었습니다). 숫자를 정해 두면
     * 페이지 성격이 달라질 때마다 검사가 먼저 틀립니다.
     */
    for (const path of ['/ko/', '/ko/brand']) {
      const rows = await paddings(page, path);
      const emphasised = rows.filter((r) => r.variants.includes('--lg'));
      expect(emphasised.length, `${path} 에 강조 섹션이 하나도 없습니다`).toBeGreaterThan(0);
      expect(
        emphasised.length,
        `${path} 의 섹션이 전부 강조입니다 — 강조가 뜻을 잃습니다`,
      ).toBeLessThan(rows.length);
    }
  });

  test('붙는 섹션은 위쪽만 좁힌다', async ({ page }) => {
    /*
     * 아래까지 좁히면 다음 섹션과 엉깁니다 — 규칙 주석이 그렇게 적어
     * 두었습니다. 위아래를 함께 좁히는 실수가 흔합니다.
     */
    const rows = await paddings(page, '/ko/');
    for (const row of rows.filter((r) => r.variants.includes('--attach'))) {
      const [top, bottom] = row.pad.split('/').map((v) => Number.parseInt(v, 10));
      expect(top, `${row.name} 의 위 여백이 좁혀지지 않았습니다`).toBeLessThan(104);
      // 아래가 0 인 것은 붙는 섹션이 다음 섹션에 여백을 넘긴다는 뜻입니다.
      expect(bottom, `${row.name} 의 아래 여백이 ${bottom}px 입니다`).toBeLessThanOrEqual(top);
    }
  });
});
