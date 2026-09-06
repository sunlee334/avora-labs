import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * 쓰는 토큰은 전부 정의돼 있어야 합니다.
 *
 * 정의되지 않은 커스텀 속성을 참조하면 CSS 는 **오류를 내지 않습니다.**
 * 그 선언만 조용히 무효가 되고, 속성마다 다른 방식으로 무너집니다.
 *
 *   color            상속값으로 떨어짐   → 브랜드 잉크 대신 순수 검정
 *   background       초기값(투명)        → 요소가 아예 안 보임
 *   border-color     currentColor        → 우연히 비슷해 보여 못 알아챔
 *   box-shadow       무효                → 그림자가 통째로 사라짐
 *
 * 실제로 `--brand-ink` 가 21곳에서 쓰이는데 어디에도 정의돼 있지 않았습니다.
 * 그래서 사이트 전체 본문이 Deep Forest 가 아닌 검정으로 나왔고, 브랜드
 * 강조 밑줄(.mark)은 **보이지 않는 것을 애니메이션하고** 있었습니다.
 *
 * 팔레트 값끼리 대조하는 tokens-contrast.spec.ts 는 이것을 못 잡습니다.
 * 그 검사는 토큰이 화면에 **닿는지**는 보지 않기 때문입니다.
 * axe 대비 검사도 못 잡습니다 — 검정이 Deep Forest 보다 대비가 더 높습니다.
 */

const STYLE_DIR = new URL('../../src/styles/', import.meta.url);

/**
 * 브랜드 잉크를 `rgb(r, g, b)` 로. 값을 여기 베껴 적으면 팔레트를 바꿀 때마다
 * 이 검사가 **팔레트가 바뀌었다는 이유로** 깨집니다 — 잡아야 할 것(검정으로
 * 떨어지는 것)과 구분이 안 됩니다. 그래서 토큰 원본에서 읽습니다.
 */
function brandInkRgb(): string {
  const json = JSON.parse(
    readFileSync(new URL('../../tokens/design-tokens.json', import.meta.url), 'utf-8'),
  );
  const hex: string = json.color.palette.ink.value.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/** 브랜드 토큰. tokens.css 는 build-tokens.mjs 가 tokens/design-tokens.json 에서 만듭니다. */
function tokenNames(): Set<string> {
  const css = readFileSync(new URL('tokens.css', STYLE_DIR), 'utf-8');
  return new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
}

/**
 * 선언된 이름 전부 — 토큰 + 스타일시트 안에서 선언한 것.
 *
 * 모든 커스텀 속성이 브랜드 토큰인 것은 아닙니다. `--nav-height` 는
 * 팔레트 값이 아니라 **레이아웃에서 파생된 사실** 이고(padding + 탭영역 +
 * border), 900px 에서 값이 달라집니다 — design-tokens.json 은 평면 구조라
 * 분기별 값을 표현할 수 없습니다. 그런 것은 쓰는 자리 옆에서 선언합니다.
 *
 * 이 검사가 지키는 것은 "브랜드 토큰만 써라" 가 아니라 **"참조한 이름이
 * 어디에도 선언돼 있지 않다"** 입니다 — `--brand-ink` 가 21곳에서 쓰이는데
 * 어디에도 없던 것이 이 파일이 생긴 이유입니다. 그래서 선언 위치를 넓혀도
 * 감시망은 그대로입니다: 오타(`--nav-heigth`)는 여전히 어디에도 없습니다.
 */
function definedNames(): Set<string> {
  const names = tokenNames();
  for (const name of readdirSync(STYLE_DIR)) {
    if (!name.endsWith('.css')) continue;
    const css = readFileSync(new URL(name, STYLE_DIR), 'utf-8');
    for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) names.add(m[1]);
  }
  return names;
}

/** 스타일시트와 페이지 안 <style> 에서 var(--...) 참조를 모읍니다. */
function usages(): Map<string, string[]> {
  const files: Array<[string, string]> = [];

  for (const name of readdirSync(STYLE_DIR)) {
    if (name.endsWith('.css')) {
      files.push([`src/styles/${name}`, readFileSync(new URL(name, STYLE_DIR), 'utf-8')]);
    }
  }
  // 관리 화면은 자체 <style is:global> 을 갖고 있어 별도로 봅니다.
  const admin = new URL('../../src/pages/admin.astro', import.meta.url);
  files.push(['src/pages/admin.astro', readFileSync(admin, 'utf-8')]);

  const found = new Map<string, string[]>();
  for (const [file, text] of files) {
    for (const m of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
      const list = found.get(m[1]) ?? [];
      if (!list.includes(file)) list.push(file);
      found.set(m[1], list);
    }
  }
  return found;
}

test.describe('디자인 토큰', () => {
  test('참조하는 토큰이 모두 정의돼 있다', () => {
    const defined = definedNames();
    expect(defined.size, 'tokens.css 에서 토큰을 하나도 찾지 못했습니다').toBeGreaterThan(10);

    const missing: string[] = [];
    for (const [name, files] of usages()) {
      // 지역 변수(--menu-x 처럼 규칙 안에서 선언한 것)는 tokens.css 에 없어도 됩니다.
      if (defined.has(name)) continue;
      missing.push(`${name} (${files.join(', ')})`);
    }
    expect(missing, `정의되지 않은 토큰: ${missing.join(' / ')}`).toEqual([]);
  });

  test('검사가 실제로 동작한다 — 없는 이름은 잡아낸다', () => {
    // 이 검사 자체가 고장 나 항상 통과하면, 위 테스트는 아무것도 지키지 않습니다.
    const defined = definedNames();
    expect(defined.has('--brand-ink-does-not-exist')).toBe(false);
    expect(defined.has('--color-text'), '--color-text 는 있어야 합니다').toBe(true);
    // 넓힌 쪽이 토큰 파일을 대체하지 않았는지 — tokens.css 가 비면 위
    // 검사가 global.css 만으로 통과해 버립니다.
    expect(tokenNames().size, 'tokens.css 가 비었습니다').toBeGreaterThan(10);
  });
});

test.describe('토큰이 화면까지 닿는다', () => {
  test('본문 글자색이 브랜드 잉크다 (검정이 아니라)', async ({ page }) => {
    // 값이 무효가 되면 color 는 상속값으로 떨어져 순수 검정이 됩니다.
    // 검정은 대비가 오히려 높아 axe 도 통과시킵니다 — 그래서 여기서 잽니다.
    await page.goto('/ko/');
    const color = await page.evaluate(() => getComputedStyle(document.body).color);
    expect(color, '본문 글자색').toBe(brandInkRgb());
  });

  test('브랜드 강조 밑줄이 실제로 그려진다', async ({ page }) => {
    // .mark::after 는 스크롤에 맞춰 scaleX(0→1) 로 늘어납니다.
    // 배경이 투명하면 보이지 않는 것을 늘리게 됩니다.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/ko/');
    const mark = page.locator('.section:not(.section--dark) .mark').first();
    await expect(mark).toBeVisible();

    const bg = await mark.evaluate((el) => getComputedStyle(el, '::after').backgroundColor);
    expect(bg, '밝은 섹션의 강조 밑줄 색').not.toBe('rgba(0, 0, 0, 0)');
  });

  test('밑줄이 색만 있고 폭이 0 이지는 않다', async ({ page }) => {
    /*
     * ⚠️ 위 검사는 **색만** 봅니다. 그리고 모션 최소화를 켜고 봅니다.
     *
     * 그 사이로 결함이 하나 빠져나갔습니다. 밑줄에 스크롤 애니메이션을
     * 걸었는데, `animation-timeline: view()` 의 기준은 애니메이션이 붙은
     * 요소 자신이고 그것이 `height: 2px` 짜리 의사요소였습니다. 구간 길이가
     * 2px 이라 진행이 사실상 일어나지 않고, 운영에서 마크가 화면을 지나는
     * **143개 표본이 전부 `scaleX(0)`** 이었습니다.
     *
     * 색은 맞았고 폭이 0 이었습니다. 그래서 폭을 잽니다.
     */
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/ko/');

    const mark = page.locator('.section:not(.section--dark) .mark').first();
    await expect(mark).toBeVisible();
    await mark.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(600);

    const drawn = await mark.evaluate((el) => {
      const cs = getComputedStyle(el, '::after');
      const t = cs.transform;
      // matrix(a, b, c, d, e, f) 의 a 가 가로 배율입니다.
      const scaleX = t === 'none' ? 1 : Number.parseFloat(t.slice(t.indexOf('(') + 1));
      return { scaleX: Number(scaleX.toFixed(3)), width: Number.parseFloat(cs.width) };
    });

    expect(drawn.width, '밑줄에 폭이 없습니다').toBeGreaterThan(10);
    expect(
      drawn.scaleX,
      `밑줄이 scaleX(${drawn.scaleX}) 입니다 — 색은 맞는데 화면에는 없습니다`,
    ).toBeGreaterThan(0.9);
  });
});
