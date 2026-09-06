import { test, expect, type Page } from '@playwright/test';
import { LOCALES } from '../../src/config/site';

/**
 * 히어로 위에서 헤더가 사진 위에 뜬다 — 그러고도 읽히는가.
 *
 * ── 왜 두 번 미뤘던 일인가 ─────────────────────────────────
 * 지시서가 세 번 요구한 항목인데 두 번 건너뛰었습니다. 이유는 늘 같았습니다 —
 * **검사기가 사진 위를 읽지 못합니다.** axe 의 `color-contrast` 는 조상의
 * 배경**색**을 걷어 올려 계산하므로, 배경이 이미지면 계산할 수 없습니다.
 * 밝은 글자를 본문 배경(밝음)과 비교해 위반으로 읽거나, 사진을 만나면
 * `incomplete` 로 물러섭니다.
 *
 * 그래서 규칙을 끄는 대신 **더 정확한 검사를 놓습니다.** 헤더의 글자만
 * 잠시 투명하게 만들어 그 자리를 찍고, 글자 상자 안에서 가장 밝은 픽셀을
 * 찾아 글자색과의 대비를 구합니다. 팔레트가 아니라 **실제로 합성된 화면**
 * 을 재므로 사진이 바뀌면 여기서 걸립니다.
 *
 * ── 왜 '가장 밝은 픽셀' 인가 ───────────────────────────────
 * 평균을 쓰면 어두운 사진에 밝은 점 하나가 있어도 통과합니다. 글자는 그
 * 점 위에서 사라집니다. 최악을 재는 것이 이 검사의 목적입니다.
 *
 * ── 이 검사가 지키는 값 ────────────────────────────────────
 * 헤더 장막(`\u002Enav[data-over-hero]` 의 배경)의 세기는 이 방법으로 정했습니다.
 * 장막이 없으면 4.49:1 로 **미달** 입니다 — global.css 의 표를 보세요.
 */

/** 작은 글자 기준. `by AVORA LABS` 는 10px 이라 여기에 걸립니다. */
const FLOOR = 4.5;

/** 헤더가 좁아지고 넓어지는 자리를 고루 지나갑니다. */
const WIDTHS = [1440, 1280, 1000, 900, 640, 430, 390];

/**
 * 글자마다 '그 자리의 가장 밝은 픽셀' 과의 대비를 구합니다.
 *
 * ⚠️ 헤더를 **숨겨서 재면 안 됩니다.**
 *
 * 처음에는 `visibility: hidden` 으로 헤더를 지우고 뒤를 찍었습니다. 그런데
 * 대비를 만드는 장막이 헤더 자신의 배경이라, 헤더를 지우면 **장막까지 함께
 * 지워집니다.** 실측에서 정확히 "장막 없음" 값인 4.49:1 이 나왔고 한참을
 * 헤맸습니다 — 화면은 멀쩡했고 재는 쪽이 틀렸습니다.
 *
 * 그래서 헤더는 그대로 두고 **글자만** 투명하게 만듭니다. 장막과 테두리는
 * 남고 글자 자리에는 그 뒤가 드러납니다. 테두리가 상자 안에 남는 것은
 * 그대로 둡니다 — 실제보다 엄하게 재는 쪽이라 통과하면 안전합니다.
 */
async function worstContrastOverHero(page: Page) {
  const nav = page.locator('.nav');
  const box = (await nav.boundingBox())!;

  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'probe-hide-text';
    style.textContent =
      '.nav, .nav * { color: transparent !important; text-decoration-color: transparent !important }';
    document.head.appendChild(style);
  });
  const shot = await page.screenshot({ clip: box });
  await page.evaluate(() => document.getElementById('probe-hide-text')?.remove());

  /*
   * PNG 를 브라우저 안에서 되읽습니다. 노드 쪽 디코더를 쓰면 검사가 이
   * 저장소의 직접 의존이 아닌 패키지에 매달립니다.
   */
  return page.evaluate(
    async ({ b64, navTop, navLeft }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const navEl = document.querySelector('.nav') as HTMLElement;
      /* 스크린샷은 기기 픽셀비만큼 큽니다. CSS 좌표를 그 배율로 옮깁니다. */
      const scale = img.width / navEl.getBoundingClientRect().width;

      const toLinear = (v: number) => {
        const x = v / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      const lum = (r: number, g: number, b: number) =>
        0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
      const contrast = (a: number, b: number) => {
        const [hi, lo] = [a, b].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };

      const rows: { name: string; ratio: number }[] = [];
      for (const el of navEl.querySelectorAll('a, button, span, li')) {
        const text = (el.textContent ?? '').trim();
        /* 글자를 직접 담은 잎만 봅니다 — 감싸는 요소를 세면 같은 글자를 두 번 잽니다. */
        if (!text || el.children.length > 0) continue;

        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        /*
         * 세로로 접힌 라벨은 건너뜁니다. 상자가 글자를 대표하지 못해 몇
         * 픽셀만 잡히고, 그 몇 픽셀이 우연히 글자색이면 1.00:1 이 나옵니다 —
         * 실측에서 그렇게 한 번 헛짚었습니다(commerce 모드 중국어 320px).
         */
        if (r.height > r.width * 1.6) continue;

        const [cr, cg, cb] = (getComputedStyle(el).color.match(/[\d.]+/g) ?? []).map(Number);
        const textLum = lum(cr, cg, cb);

        const x0 = Math.max(0, Math.round((r.left - navLeft) * scale));
        const y0 = Math.max(0, Math.round((r.top - navTop) * scale));
        const w = Math.min(canvas.width - x0, Math.round(r.width * scale));
        const h = Math.min(canvas.height - y0, Math.round(r.height * scale));
        if (w < 4 || h < 4) continue;

        const data = ctx.getImageData(x0, y0, w, h).data;
        let brightest = -1;
        for (let i = 0; i < data.length; i += 4) {
          const l = lum(data[i], data[i + 1], data[i + 2]);
          if (l > brightest) brightest = l;
        }
        rows.push({ name: text.slice(0, 10), ratio: Number(contrast(textLum, brightest).toFixed(2)) });
      }
      return rows;
    },
    { b64: shot.toString('base64'), navTop: box.y, navLeft: box.x },
  );
}

test.describe('히어로 위 헤더', () => {
  test('첫 화면에서는 사진 위에 뜨고, 지나면 불투명해진다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await page.waitForTimeout(400);

    const nav = page.locator('.nav');
    await expect(nav, '첫 화면인데 사진 위 상태가 아닙니다').toHaveAttribute('data-over-hero', 'true');

    const transparent = await nav.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(transparent, '사진 위인데 배경이 칠해져 있습니다').toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

    /* 히어로를 지나면 원래대로 돌아와야 합니다. */
    await page.evaluate(async () => {
      for (let i = 0; i < 12; i += 1) {
        window.scrollTo(0, 2400);
        await new Promise((r) => setTimeout(r, 150));
        if (Math.abs(window.scrollY - 2400) < 3) break;
      }
    });
    await expect(nav, '히어로를 지났는데 아직 투명합니다').toHaveAttribute('data-over-hero', 'false');
    const painted = await nav.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(painted, '히어로를 지났는데 배경이 없습니다').not.toBe(transparent);
  });

  test('히어로가 없는 화면에서는 늘 불투명하다', async ({ page }) => {
    /*
     * 관찰할 히어로가 없으면 상태를 쓰지 않습니다. 여기서 `true` 가 남으면
     * 흰 배경 위에 흰 글자가 됩니다.
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/support');
    await page.waitForTimeout(400);

    const over = await page.locator('.nav').evaluate((el) => el.dataset.overHero);
    expect(over, '히어로가 없는데 사진 위 상태입니다').not.toBe('true');
  });

  test('전환에 중간 상태가 없다', async ({ page }) => {
    /*
     * 지시서: "전환 중간에 대비 4.5:1 미만 구간이 없어야 한다."
     *
     * 배경과 글자색을 함께 페이드하면 그 구간이 **반드시** 생깁니다 —
     * 반쯤 칠해진 밝은 배경 위의 밝은 글자입니다. 중간 상태를 없애는 가장
     * 확실한 방법은 만들지 않는 것이라, 색에는 전환을 걸지 않았습니다.
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');

    const moving = await page.locator('.nav').evaluate((el) => {
      const cs = getComputedStyle(el);
      const props = cs.transitionProperty.split(',').map((p) => p.trim());
      const durations = cs.transitionDuration.split(',').map((d) => Number.parseFloat(d));
      return props
        .map((p, i) => ({ p, d: durations[i] ?? durations[0] ?? 0 }))
        .filter(({ p, d }) => d > 0 && /color|background|all/.test(p))
        .map(({ p, d }) => `${p} ${d}s`);
    });

    expect(
      moving,
      `헤더의 색에 전환이 걸려 있습니다 — 중간 프레임에서 대비가 무너집니다: ${moving.join(', ')}`,
    ).toEqual([]);
  });

  for (const lang of LOCALES) {
    test(`/${lang}/ — 사진 위 글자가 실제 픽셀에서 ${FLOOR}:1 이상이다`, async ({ page }) => {
      test.setTimeout(180_000);

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${lang}/`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);

        const over = await page.locator('.nav').evaluate((el) => el.dataset.overHero);
        expect(over, `${width}px 에서 사진 위 상태가 아닙니다`).toBe('true');

        const rows = await worstContrastOverHero(page);
        expect(rows.length, `${width}px 에서 잰 글자가 없습니다`).toBeGreaterThan(0);

        for (const row of rows) {
          expect(
            row.ratio,
            `/${lang}/ ${width}px — «${row.name}» 이 사진 위에서 ${row.ratio}:1 입니다`,
          ).toBeGreaterThanOrEqual(FLOOR);
        }
      }
    });
  }
});
