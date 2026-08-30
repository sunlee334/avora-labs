import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tokens from '../../tokens/design-tokens.json' with { type: 'json' };

/**
 * 색을 어디에 적을 수 있는가.
 *
 * ── 규칙 ────────────────────────────────────────────────────
 *   색 값(#hex, rgb())은 `tokens/design-tokens.json` 에서만 적습니다.
 *   화면 코드는 **역할 토큰**(`--color-*`)만 참조합니다.
 *
 * ── 왜 검사로 두는가 ────────────────────────────────────────
 * 규칙을 문서에만 적어 두면 다음 사람이 급할 때 `#252B31` 을 그대로 박습니다.
 * 그러면 팔레트를 갈아입을 때 그 한 줄만 옛 색으로 남고, 화면에서는 거의
 * 티가 나지 않아 오래갑니다. 실제로 이 저장소의 `theme-color` 가 그렇게
 * 될 뻔했습니다.
 *
 * 원시 팔레트(`--paros-*`)를 화면에서 직접 쓰는 것도 막습니다. 그러면 이름이
 * 값을 가리켜(`--paros-ink`), 색이 바뀌는 순간 이름이 거짓말이 됩니다.
 */

const root = fileURLToPath(new URL('../../', import.meta.url));

/** 색 값을 적어도 되는 곳. 여기 말고는 전부 위반입니다. */
const ALLOWED = new Set([
  'src/styles/tokens.css', // 자동 생성 — 원본은 design-tokens.json
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(css|astro|ts)$/.test(name)) out.push(full);
  }
  return out;
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGB = /\brgba?\([^)]*\)/g;

test.describe('색은 토큰에서만 나온다', () => {
  test('화면 코드에 색 리터럴이 없다', () => {
    const offenders: string[] = [];

    for (const file of walk(join(root, 'src'))) {
      const rel = file.slice(root.length);
      if (ALLOWED.has(rel)) continue;
      /*
       * 주석은 먼저 지웁니다. 주석 안의 `#c0c0c0` 은 "브라우저 기본 버튼이 이
       * 색으로 그려진다" 같은 **설명**이지 우리가 칠하는 값이 아닙니다.
       * 줄 단위로 지우면 여러 줄 주석의 가운데 줄을 놓치므로 파일 전체에서
       * 지우되, 줄 번호가 어긋나지 않게 개행은 남깁니다.
       */
      const text = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

      text.split('\n').forEach((line, i) => {
        for (const m of [...line.matchAll(HEX), ...line.matchAll(RGB)]) {
          offenders.push(`${rel}:${i + 1}  ${m[0]}`);
        }
      });
    }

    expect(
      offenders,
      `색 값은 tokens/design-tokens.json 에만 적습니다:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  test('화면 코드가 원시 팔레트를 직접 쓰지 않는다', () => {
    const offenders: string[] = [];
    for (const file of walk(join(root, 'src'))) {
      const rel = file.slice(root.length);
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (line.includes('var(--paros-')) offenders.push(`${rel}:${i + 1}`);
        });
    }
    expect(
      offenders,
      `원시 팔레트 대신 역할 토큰(--color-*)을 쓰세요:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  test('역할 토큰은 전부 팔레트를 가리키거나 직접 값을 갖는다', () => {
    // 참조가 끊기면 CSS 가 빈 값을 받아 그 자리가 **아무 색도 아닌** 상태가
    // 됩니다. 화면에서는 상속색으로 그려져 티가 잘 안 납니다.
    const palette = tokens.color.palette as Record<string, { value: string }>;
    for (const [name, role] of Object.entries(tokens.color.role as Record<string, any>)) {
      if (role.ref) {
        const key = role.ref.split('.').pop() as string;
        expect(palette[key], `${name} 의 참조 ${role.ref} 가 팔레트에 없습니다`).toBeTruthy();
      } else {
        expect(role.value, `${name} 에 값도 참조도 없습니다`).toBeTruthy();
      }
    }
  });
});
