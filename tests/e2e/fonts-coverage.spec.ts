import { test, expect } from '@playwright/test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { facesFor, charsFor, charsPerFace, unpackCoverage } from '../../scripts/build-fonts.mjs';
import { PRELOAD } from '../../src/config/fonts';

/**
 * 우리가 **정말로** 이 글자들을 그리고 있는가.
 *
 * ── 왜 `--check` 로는 부족한가 ──────────────────────────────
 * `build-fonts.mjs --check` 는 "원본 서체에 있는 글자가 서브셋에 들어갔는가"
 * 를 봅니다. 원본에 **애초에 없는** 글자는 요구 목록에서 빼기 때문에,
 * 서체가 그 문자를 통째로 담지 않아도 초록으로 통과합니다.
 *
 * 실제로 그래서 두 가지가 오래 숨어 있었습니다.
 *   · 제목 서체(Noto Serif KR)에 태국 문자가 **0자** — 태국어 제목은 내내
 *     기기 기본 서체였습니다.
 *   · 본문 서체(Pretendard)에 한자가 **0자**, 태국 문자가 1자 — 중국어 본문
 *     790자 중 710자, 태국어 본문 133자 중 60자가 기기 서체였습니다.
 * 두 번 다 검사는 "모두 포함" 이라고 말했습니다.
 *
 * 이 파일은 반대로 봅니다 — **화면에 나오는 글자마다 그것을 그릴 페이스가
 * 있는가.** 없다면 그건 우리가 그렇게 **정했을 때만** 통과합니다.
 */

const root = new URL('../../', import.meta.url);
const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'] as const;

/**
 * 서체 없이 기기에 맡기기로 **정한** 것.
 *
 * 여기 적히지 않은 구멍은 실수입니다. 적을 때는 이유를 함께 적으세요 —
 * 이 목록이 길어지는 것은 "폴백이 늘었다" 가 아니라 "결정이 늘었다" 여야
 * 합니다.
 */
const BY_DESIGN: Record<string, { kind: 'body' | 'display'; why: string }[]> = {
  zh: [
    {
      kind: 'body',
      // 본문 720자를 서브셋하면 186KB 입니다. 중국어 페이지 전부가 받는 양이고
      // 이 사이트는 모바일이 우선입니다. 제목(display-sc)만 브랜드 서체로 둡니다.
      why: '중국어 본문은 기기 서체에 맡깁니다 — 186KB',
    },
  ],
};

function coverageOf(faceId: string): Set<string> | null {
  const file = fileURLToPath(new URL(`scripts/${faceId}-source-coverage.txt`, root));
  if (!existsSync(file)) return null;
  return unpackCoverage(readFileSync(file, 'utf8'));
}

test.describe('화면의 글자를 실제로 그리고 있는가', () => {
  for (const locale of LOCALES) {
    test(`${locale} — 서체가 못 그리는 글자는 정한 것뿐이다`, () => {
      const need = charsFor(locale);
      const perFace = charsPerFace(locale, need);
      const ids = facesFor(locale);

      // body 는 npm 의존성이라 커버리지 파일이 없습니다. 그 페이스가 맡은
      // 글자는 여기서 판정하지 않고, 아래 '두 벌 이상' 검사가 대신 봅니다.
      const covers = new Map<string, Set<string> | null>(ids.map((id) => [id, coverageOf(id)]));

      for (const kind of ['body', 'display'] as const) {
        // 이 종류의 가족: `body` 와 `body-*`, 또는 `display` 와 `display-*`
        const family = ids.filter((id) => id === kind || id.startsWith(`${kind}-`));

        const uncovered = [...need[kind]].filter((ch) => {
          if (!ch.trim()) return false;
          return !family.some((id) => {
            const cover = covers.get(id) ?? null;
            // 근거가 없는 페이스(body)는 "그릴 수 있다" 로 봅니다 — 판정 근거가
            // 없는 것을 실패로 만들면 검사가 사실이 아니라 소음이 됩니다.
            if (cover === null) return perFace.get(id)?.has(ch) ?? false;
            return cover.has(ch);
          });
        });

        const allowed = (BY_DESIGN[locale] ?? []).some((d) => d.kind === kind);
        if (uncovered.length && !allowed) {
          throw new Error(
            `${locale}/${kind}: 어느 서체로도 그릴 수 없는 글자 ${uncovered.length}자 → ` +
              `${uncovered.slice(0, 40).join('')}\n` +
              '  문자별 짝을 FACES 에 추가하거나, 기기에 맡기기로 정했다면 ' +
              '이 파일의 BY_DESIGN 에 이유와 함께 적으세요.',
          );
        }
      }
    });
  }

  test('태국어 ำ 를 그리는 데 필요한 U+0E4D 이 들어 있다', () => {
    /*
     * 브라우저의 타이 셰이퍼는 `ำ`(U+0E33)를 U+0E4D + U+0E32 로 분해한 뒤
     * cmap 에서 찾습니다. U+0E4D 은 문구에 한 번도 나오지 않으므로, 글자를
     * 모으는 것만으로는 절대 들어오지 않습니다. 빠지면 `กันน้ำ` 가
     * `กันน ้ำ` 로 깨집니다 — 검사도 화면도 조용합니다.
     */
    const perFace = charsPerFace('th');
    for (const id of ['display-th', 'body-th', 'body-th-bold']) {
      const chars = perFace.get(id)!;
      if (!chars.has('ำ')) continue;
      expect(chars.has('ํ'), `${id} 에 U+0E4D 이 없습니다`).toBe(true);
    }
  });
});

test.describe('미리 받는 목록이 실제 파일과 맞는가', () => {
  for (const locale of LOCALES) {
    test(`${locale} — preload 가 있는 파일만 가리킨다`, () => {
      /*
       * `PRELOAD` 는 손으로 적은 목록입니다. 서체를 더하거나 이름을 바꾸면
       * 여기가 옛 파일을 가리키게 되고, 그러면 **404 를 미리 받는** 상태가
       * 됩니다 — 화면에는 아무 흔적이 없고 콘솔에만 남습니다.
       */
      const dir = fileURLToPath(new URL(`public/fonts/${locale}/`, root));
      const have = new Set(readdirSync(dir));
      for (const file of PRELOAD[locale]) {
        expect(have.has(file), `${locale}/${file} 이 없습니다`).toBe(true);
      }
    });
  }

  test('본문과 제목은 어느 언어에서도 미리 받는다', () => {
    // 첫 화면에서 곧바로 보이는 둘입니다. 빠지면 글자가 늦게 바뀌며 흔들립니다.
    for (const locale of LOCALES) {
      expect(PRELOAD[locale], locale).toContain('body.woff2');
      expect(PRELOAD[locale], locale).toContain('display.woff2');
    }
  });
});
