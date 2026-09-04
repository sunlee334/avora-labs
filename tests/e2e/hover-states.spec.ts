import { test, expect } from '@playwright/test';

/**
 * 손이 간 자리에 반응이 있는가.
 *
 * ── 왜 존재를 재지 않는가 ──────────────────────────────────
 * `:hover` 규칙이 있는지만 보면, 누군가 전환을 400ms 로 늘리거나 `height` 에
 * 걸어도 통과합니다. 그 둘이 실제 결함입니다 — 굼뜬 반응과 옆 요소를 미는
 * 반응. 그래서 **시간과 대상 속성** 을 잽니다.
 *
 * ── 사진 확대와 스티키 ─────────────────────────────────────
 * 사진을 키우려면 감싼 요소가 잘라야 하는데, `overflow` 를 스티키 요소의
 * 조상에 걸면 `position: sticky` 가 죽습니다. `.figure` 가 그 경로에 들어가지
 * 않는지 함께 봅니다.
 *
 * `body` 의 `overflow-x: hidden` 은 예외입니다 — 세로가 `auto` 라 헤더가
 * 붙는 스크롤 컨테이너 자체이고, 원래 그렇게 동작합니다.
 */

const TARGETS = [
  ['네비 인디케이터', '.nav__links a', '::after'],
  ['사진', '.figure img', undefined],
  ['배점표 행', '.criteriaTable tbody tr', undefined],
] as const;

test.describe('호버 상태', () => {
  test('전환이 120ms 를 넘지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await page.evaluate(() => document.fonts.ready);

    for (const [name, sel, pseudo] of TARGETS) {
      const d = await page.evaluate(
        ([s, p]) => {
          const el = document.querySelector(s as string);
          if (!el) return null;
          return getComputedStyle(el, (p as string) ?? undefined).transitionDuration;
        },
        [sel, pseudo] as const,
      );
      expect(d, `${name} 를 찾지 못했습니다`).not.toBeNull();
      const ms = Number.parseFloat(d!) * (d!.includes('ms') ? 1 : 1000);
      expect(ms, `${name} 전환이 ${d} 입니다`).toBeGreaterThan(0);
      expect(ms, `${name} 전환이 ${d} 로 깁니다`).toBeLessThanOrEqual(120);
    }
  });

  test('레이아웃 속성에는 전환을 걸지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('.nav__links a, .figure, .figure img, .criteriaTable tbody tr')]
        .flatMap((el) =>
          getComputedStyle(el)
            .transitionProperty.split(',')
            .map((p) => p.trim())
            .filter((p) => /^(width|height|margin|padding|inset|font-size|gap)/.test(p))
            .map((p) => `${el.className}: ${p}`),
        ),
    );
    expect(bad, '옆 요소를 미는 전환입니다').toEqual([]);
  });

  test('사진을 자르는 요소가 스티키를 죽이지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');

    /*
     * 스티키를 죽이는 것은 `hidden`·`clip` 이지 스크롤 컨테이너가 아닙니다.
     *
     * 처음에는 `overflow !== 'visible'` 을 전부 잡았는데, 그러면 스크롤되는
     * 시트 안의 스티키 머리(`.notifySheet__head`)까지 결함으로 셉니다 — 그건
     * 스티키가 원래 그렇게 쓰이는 모양입니다. 알림 바가 있는 모드에서만
     * 걸려서, 그 검사는 결함이 아니라 **잘못 쓴 규칙** 이었습니다.
     */
    const broken = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll('*')) {
        if (getComputedStyle(el).position !== 'sticky') continue;
        let p = el.parentElement;
        while (p) {
          const ov = getComputedStyle(p).overflow;
          if (/hidden|clip/.test(ov) && !/auto|scroll/.test(ov)) {
            out.push(`${el.className} ← ${p.className || p.tagName} = ${ov}`);
          }
          p = p.parentElement;
        }
      }
      return out;
    });
    expect(broken, 'sticky 조상이 스크롤 없이 잘라내고 있습니다').toEqual([]);
  });

  test('움직임 감소에서는 전환이 없다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    for (const [name, sel, pseudo] of TARGETS) {
      const d = await page.evaluate(
        ([s, p]) => {
          const el = document.querySelector(s as string);
          return el ? getComputedStyle(el, (p as string) ?? undefined).transitionDuration : null;
        },
        [sel, pseudo] as const,
      );
      expect(d, `${name} 가 여전히 움직입니다`).toBe('0s');
    }
  });
});
