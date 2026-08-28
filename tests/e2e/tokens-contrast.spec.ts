import { test, expect } from '@playwright/test';
import tokens from '../../tokens/design-tokens.json' with { type: 'json' };

/**
 * 팔레트 자체의 명암비.
 *
 * axe 는 **화면에 실제로 나타난 조합만** 봅니다. 그래서 아직 어느 페이지에도
 * 쓰이지 않은 조합, 또는 등장 애니메이션 때문에 스캔에서 빠진 조합은 잡히지
 * 않습니다. 실제로 그것 때문에 대비 결함 두 건이 오래 숨어 있었습니다.
 *
 * 여기서는 페이지와 무관하게 토큰 값끼리 직접 계산합니다. 브랜드 컬러를
 * 조정할 때 이 검사가 먼저 걸립니다 — 화면을 다 훑어보지 않아도 됩니다.
 *
 * 기준(WCAG 2.1 AA): 본문 4.5:1, 큰 글자(18.66px 굵게 / 24px) 3:1.
 */

const C = Object.fromEntries(
  Object.entries(tokens.color.brand).map(([key, entry]) => [key, (entry as { value: string }).value]),
) as Record<string, string>;

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 화면에서 실제로 쓰는 조합. 새 조합을 쓰기 시작하면 여기에도 추가하세요. */
const USED: Array<{ fg: string; bg: string; where: string; min: number }> = [
  { fg: 'primary', bg: 'surface', where: '본문 잉크 / 기본 배경', min: 4.5 },
  { fg: 'primary', bg: 'surfaceAlt', where: '본문 잉크 / 대체 배경', min: 4.5 },
  { fg: 'muted', bg: 'surface', where: '보조 텍스트 / 기본 배경', min: 4.5 },
  { fg: 'muted', bg: 'surfaceAlt', where: '보조 텍스트 / 대체 배경', min: 4.5 },
  // 교차 섹션(.section--alt)이 실제로 깔리는 색은 진한 Mist Blue 가 아니라
  // 옅게 섞은 tint 입니다. 위 두 줄만 지키면 화면에 없는 조합을 검사하고
  // 화면에 있는 조합은 놓칩니다.
  { fg: 'primary', bg: 'surfaceTint', where: '본문 잉크 / 교차 섹션', min: 4.5 },
  { fg: 'muted', bg: 'surfaceTint', where: '보조 텍스트 / 교차 섹션', min: 4.5 },
  { fg: 'surface', bg: 'primary', where: '역상 본문 / 어두운 면', min: 4.5 },
  { fg: 'surfaceAlt', bg: 'primary', where: '역상 본문(Mist Blue) / 어두운 면', min: 4.5 },
  { fg: 'mutedOnDark', bg: 'primary', where: '어두운 면 위 보조 텍스트', min: 4.5 },
];

test.describe('브랜드 팔레트 명암비', () => {
  for (const { fg, bg, where, min } of USED) {
    test(`${where} — ${min}:1 이상`, () => {
      const ratio = contrast(C[fg], C[bg]);
      expect(
        Number(ratio.toFixed(2)),
        `${fg}(${C[fg]}) on ${bg}(${C[bg]}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(min);
    });
  }

  test('보조 텍스트를 어두운 면에 그대로 쓰면 안 된다', () => {
    // mutedOnDark 라는 별도 토큰이 있는 이유입니다. 어두운 면에서 muted 를
    // 그대로 쓰면 2.5:1 수준이라 읽을 수 없습니다. 이 관계가 뒤집히면
    // 별도 토큰이 필요 없어진 것이므로, 그때는 이 테스트도 함께 지우세요.
    expect(contrast(C.muted, C.primary)).toBeLessThan(4.5);
    expect(contrast(C.mutedOnDark, C.primary)).toBeGreaterThanOrEqual(4.5);
  });

  test('계산이 맞는지 — 흰 바탕의 검은 글자는 21:1', () => {
    // 기준값이 알려진 조합으로 계산 자체를 확인합니다.
    // 이게 틀리면 위의 통과는 전부 의미가 없습니다.
    expect(Number(contrast('#000000', '#ffffff').toFixed(2))).toBe(21);
    expect(Number(contrast('#ffffff', '#ffffff').toFixed(2))).toBe(1);
  });
});
