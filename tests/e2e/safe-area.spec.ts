import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 노치·홈 인디케이터에 콘텐츠가 파먹히지 않는가.
 *
 * ── 왜 검사로 만드나 ───────────────────────────────────────
 * 이 결함은 **개발 화면에서 영영 보이지 않습니다.** 데스크톱 브라우저에서
 * `env(safe-area-inset-*)` 은 전부 0 이고, 시뮬레이터도 세로로만 보면 가로
 * 인셋이 0 입니다. 즉 "빠뜨렸다" 는 사실이 화면에 나타나지 않습니다.
 *
 * 그리고 실제로 빠뜨린 채로 있었습니다 — 아래쪽 인셋은 시트 셋·고정 CTA·
 * 토스트·히어로 큐에 들어가 있었는데, **가로 인셋과 푸터 바닥만** 없었습니다.
 * 한 번 채웠다는 것으로는 부족합니다. 다음 사람이 여백 값을 정리하다 조용히
 * 걷어낼 수 있으므로 목록을 여기 박아 둡니다.
 *
 * ── 왜 계산된 스타일로 재지 않나 ───────────────────────────
 * `getComputedStyle` 은 `env()` 를 이미 0 으로 풀어 돌려줍니다. 인셋이 없는
 * 기기에서 `padding-bottom: 40px` 은 인셋을 **더한 것과 빠뜨린 것이 완전히
 * 같은 값** 입니다. 그래서 선언 자체를 봅니다.
 *
 * 소스가 아니라 **빌드된 CSS** 를 읽습니다. 이 저장소는 주석 밀도가 높아
 * `src/` grep 은 주석에 속고, 토큰처럼 빌드가 다시 만드는 파일도 있습니다.
 */

/** 빌드된 스타일시트. 파일명 해시는 빌드마다 바뀌므로 훑어서 찾습니다. */
function builtCss(): string {
  const dir = 'dist/_astro';
  const files = readdirSync(dir).filter((f) => f.endsWith('.css'));
  expect(files.length, `${dir} 에 빌드된 CSS 가 없습니다`).toBeGreaterThan(0);
  return files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
}

/*
 * 규칙 하나씩 끊어 봅니다. 압축된 CSS 라 줄바꿈이 없고, 선택자만 찾아
 * 근처를 보면 옆 규칙의 선언을 자기 것으로 착각합니다.
 *
 * 중첩이 없는 잎 규칙만 잡으므로 `@media`·`@supports` 안쪽도 그대로 걸립니다.
 */
function rulesFor(css: string, selector: string): string[] {
  const found: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].split(',').some((s) => s.trim().split(/[\s>+~]/).includes(selector))) {
      found.push(m[2]);
    }
  }
  return found;
}

/**
 * 화면 가장자리에 닿는 자리들. 각 항목은 [선택자, 어느 쪽 인셋인지] 입니다.
 *
 * 여기서 무엇을 빼려면 그 자리가 더 이상 화면 가장자리에 닿지 않는다는
 * 근거가 있어야 합니다.
 */
const EDGES: Array<[selector: string, inset: string, why: string]> = [
  ['.footer', 'bottom', '페이지 맨 끝이라 홈 인디케이터가 저작권 줄에 겹칩니다'],
  ['.stickyCta', 'bottom', '화면 하단 고정 바입니다'],
  ['.lang__sheet', 'bottom', '바닥에서 올라오는 시트입니다'],
  ['.menu__sheet', 'bottom', '바닥에서 올라오는 시트입니다'],
  ['.notifySheet', 'bottom', '바닥에서 올라오는 시트입니다'],
  ['.toast', 'bottom', '화면 하단에 뜹니다'],
  ['.hero__cue', 'bottom', '히어로가 화면 바닥에 닿습니다'],
];

test.describe('안전 영역', () => {
  for (const [selector, inset, why] of EDGES) {
    test(`${selector} 는 ${inset} 인셋을 더한다`, () => {
      const bodies = rulesFor(builtCss(), selector);
      expect(bodies.length, `${selector} 규칙을 빌드된 CSS 에서 못 찾았습니다`).toBeGreaterThan(0);
      expect(
        bodies.some((b) => b.includes(`env(safe-area-inset-${inset})`)),
        `${selector} 에 safe-area-inset-${inset} 이 없습니다 — ${why}`,
      ).toBe(true);
    });
  }

  test('본문 가로 여백이 좌우 인셋을 넘긴다', () => {
    /*
     * ⚠️ 가로는 **눕혔을 때만** 문제가 됩니다.
     *
     * 세로로 든 상태에서 좌우 인셋은 0 이라, 세로로만 확인하면 빠뜨린 것을
     * 알 수 없습니다. 노치가 있는 기기를 가로로 눕히면 그 홈이 화면 한쪽을
     * 파먹고, 본문 첫 글자가 그 아래로 들어갑니다.
     *
     * 값은 `--pad-wrap` / `--pad-container` 한 쌍이 정합니다. `.wrap` 은
     * 여기서 여백을 받고, 밴드형 섹션은 `--pad-container` 로 "가로 전체 배경 +
     * 가운데 정렬된 본문" 을 한 요소에서 만듭니다. 둘 다 봐야 합니다.
     */
    const css = builtCss();
    for (const token of ['--pad-wrap', '--pad-container']) {
      const decls = [...css.matchAll(new RegExp(`${token}:\\s*([^;}]+)`, 'g'))].map((m) => m[1]);
      expect(decls.length, `${token} 선언을 못 찾았습니다`).toBeGreaterThan(0);
      for (const value of decls) {
        expect(value, `${token} 에 좌측 인셋이 없습니다`).toContain('env(safe-area-inset-left)');
        expect(value, `${token} 에 우측 인셋이 없습니다`).toContain('env(safe-area-inset-right)');
      }
    }
  });
});
