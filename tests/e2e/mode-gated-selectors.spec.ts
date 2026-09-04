import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **commerce 모드에 없는 요소를 있다고 단정하지 않는가.**
 *
 * ── 왜 이 검사가 생겼나 ────────────────────────────────────
 * 사이트는 두 모드로 빌드됩니다. `commerce`(자사 결제)에서는 알림 신청 폼과
 * 하단 고정 바, 히어로 CTA 가 **아예 렌더되지 않습니다** — 홈의
 * `{!CAN_ORDER && …}` 안에 있기 때문입니다.
 *
 * 홈을 건드리는 새 검사가 그걸 모르고 `document.querySelector('.stickyCta')`
 * 의 결과를 바로 썼다가, commerce 샤드가
 * `Cannot read properties of null` 로 죽었습니다.
 *
 * **로컬에서는 드러나지 않았습니다.** 스위트가 도는 동안 다른 모드로 빌드를
 * 돌려, commerce 스위트가 launch 화면을 보고 있었기 때문입니다. 로컬 초록은
 * 증거가 아니었습니다.
 *
 * ── 무엇만 잡는가 ──────────────────────────────────────────
 * `document.querySelector('<launch 전용>')` **하나만** 봅니다. 이것이 null 을
 * 돌려주고, 뒤에서 바로 쓰면 그 자리에서 죽습니다.
 *
 * 다음은 잡지 않습니다 — 안전하고, 저장소가 이미 그렇게 쓰고 있습니다.
 *
 *   `querySelectorAll(…)`        없으면 빈 목록. 죽지 않습니다
 *   `page.locator(…).count()`    세고 나서 판단합니다
 *   주석 안의 이름
 *
 * 넓게 잡으면 오탐이 쌓이고, 오탐이 쌓이면 예외 목록으로 무력화됩니다.
 *
 * ── 남는 위험 하나 ─────────────────────────────────────────
 * `page.locator('#notify …')` 로 **없는 요소를 기다리는** 경우는 여기서 못
 * 잡습니다. 죽지 않고 30초를 기다릴 뿐이라 문법으로 구분되지 않습니다.
 * 그건 규칙으로 막습니다 — **폼 전용 검사는 `tests/e2e/launch/` 에 둡니다.**
 * config 의 `testIgnore` 가 commerce 실행에서 통째로 뺍니다.
 *
 * 소스를 훑는 방식은 `rate-limit.spec.ts` 와 같습니다. 실행으로는 "안 도는
 * 검사" 를 잡을 수 없어서입니다.
 */

/** 홈의 `{!CAN_ORDER && …}` 안에서만 그려지는 것들. */
const LAUNCH_ONLY = ['stickyCta', 'hero__cta', 'data-launch-notify', 'heroNotify'];

/** 이 아래는 해당 모드 실행에서 통째로 제외됩니다(`testIgnore`). */
const MODE_DIRS = new Set(['launch', 'commerce']);

function specsToCheck(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!MODE_DIRS.has(entry.name)) out.push(...specsToCheck(path));
    } else if (entry.name.endsWith('.spec.ts')) {
      out.push(path);
    }
  }
  return out;
}

test.describe('모드 전용 요소', () => {
  test('commerce 에 없는 요소를 querySelector 로 단정하지 않는다', () => {
    const offenders: string[] = [];

    for (const file of specsToCheck('tests/e2e')) {
      if (file.endsWith('mode-gated-selectors.spec.ts')) continue;

      const source = readFileSync(file, 'utf8');
      // 모드를 읽고 있으면 가렸다고 봅니다. 어떻게 가렸는지는 그 파일의 몫입니다.
      if (source.includes('E2E_MODE')) continue;

      for (const sel of LAUNCH_ONLY) {
        // `querySelectorAll` 은 제외해야 하므로 `All` 이 붙지 않은 것만 봅니다.
        const pattern = new RegExp(`querySelector\\s*\\(\\s*['"\`][^'"\`]*${sel}`);
        if (pattern.test(source)) offenders.push(`${file} → querySelector('…${sel}…')`);
      }
    }

    expect(
      offenders,
      'commerce 모드에는 없어서 null 이 됩니다. ' +
        "`const SELLS = process.env.E2E_MODE !== 'launch'` 로 가리거나 " +
        '`tests/e2e/launch/` 로 옮기세요:\n  ' +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  test('목록이 실제 소스와 맞다', () => {
    /*
     * 위 검사는 목록이 옳다는 전제 위에 섭니다. 홈에서 `!CAN_ORDER` 로 가린
     * 자리가 늘었는데 목록이 그대로면, 새 요소는 아무도 지키지 않습니다.
     */
    const home = readFileSync('src/pages/[lang]/index.astro', 'utf8');
    expect(home, 'CAN_ORDER 게이트가 사라졌습니다 — 이 검사의 전제가 바뀌었습니다').toContain(
      '!CAN_ORDER',
    );
    for (const sel of ['hero__cta', 'heroNotify']) {
      expect(home, `«${sel}» 이 홈에 없습니다 — 목록이 낡았습니다`).toContain(sel);
    }
  });
});
