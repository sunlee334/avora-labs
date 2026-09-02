import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import paymentConfig from '../../src/config/payment-config.json' with { type: 'json' };

/**
 * 시크릿 키가 저장소에 들어오지 않는다.
 *
 * 토스페이먼츠 배포 체크리스트가 못 박은 문장입니다 — "시크릿 키는 공개적으로
 * 접근할 수 있거나 **버전 관리 시스템으로 접근할 수 있는 코드에 포함되면 안
 * 돼요**"(docs.tosspayments.com/guides/v2/deploy-checklist).
 *
 * ── 키 두 종류가 왜 다르게 취급되는가 ───────────────────────
 * 클라이언트 키(`test_ck_` / `live_ck_`)는 결제창을 여는 값이고 브라우저에
 * 그대로 나갑니다. 공개돼도 되므로 설정 파일에 커밋합니다 — 어느 환경이
 * 켜져 있는지가 코드에 남는 편이 낫습니다.
 *
 * 시크릿 키(`test_sk_` / `live_sk_`)는 승인 API 의 Basic 인증 자격증명입니다.
 * 이 값 하나면 우리 상점의 결제를 승인하고 취소할 수 있습니다. 워커 시크릿
 * (`wrangler secret put TOSS_SECRET_KEY`)으로만 들어갑니다.
 *
 * ── 왜 문자열을 훑는가 ──────────────────────────────────────
 * 실수는 "시크릿을 설정 파일에 넣는다" 는 결심이 아니라 **붙여넣기** 로
 * 일어납니다. 급할 때 clientKey 자리에 sk 키를 넣어 두고 잊는 식입니다.
 * 그건 리뷰에서도 눈에 잘 띄지 않습니다 — 두 값의 생김새가 비슷합니다.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * 시크릿 키의 생김새.
 *
 * ⚠️ 연동 방식마다 접두어가 다릅니다. 처음에는 `_sk_` 만 봤는데, **주문서형·
 * 결제창형 키는 `gsk` 를 씁니다**(`test_gsk_…`). 실제로 그 키가 이 검사를
 * 그대로 지나갔습니다.
 *
 *   API 개별 연동   test_sk_  · live_sk_    (브랜드페이·자동결제)
 *   주문서형·결제창형 test_gsk_ · live_gsk_   (지금 쓰는 쪽)
 *
 * 그래서 `g` 를 선택적으로 두고 둘 다 잡습니다. 새 접두어가 또 생기면 여기에
 * 더하세요 — 못 잡는 것보다 넓게 잡는 편이 낫습니다.
 */
const SECRET_KEY = /\b(test|live)_g?sk_[A-Za-z0-9]/;

/**
 * 훑을 곳 — 빌드 산출물과 의존성을 뺀 나머지.
 *
 * `node_modules` 와 `dist` 를 훑으면 몇 분이 걸리고, 그 안에 우리가 넣은
 * 값은 없습니다. `.git` 도 뺍니다 — 과거 커밋에 있었다면 그건 이 검사가
 * 아니라 키 재발급으로 풀 문제입니다.
 */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.astro',
  '.wrangler',
  '.omc',
  'test-results',
  'playwright-report',
  '.fontsrc',
  'public',
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx|js|mjs|cjs|astro|json|jsonc|md|yml|yaml|css|html|txt)$/.test(entry)) {
      yield full;
    }
  }
}

test.describe('시크릿 키는 저장소에 없다', () => {
  test('추적되는 파일 어디에도 test_sk_ / live_sk_ 가 없다', () => {
    const offenders: string[] = [];
    for (const file of walk(root)) {
      // 이 검사 파일 자신은 정규식으로 그 형태를 적고 있으므로 건너뜁니다.
      if (file.endsWith('payment-secrets.spec.ts')) continue;
      if (SECRET_KEY.test(readFileSync(file, 'utf8'))) {
        offenders.push(file.slice(root.length + 1));
      }
    }
    expect(
      offenders,
      `시크릿 키로 보이는 값이 있습니다 — 즉시 개발자센터에서 재발급하고 wrangler secret 으로 옮기세요:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('wrangler.jsonc 의 vars 에 결제 시크릿 이름이 없다', () => {
    /*
     * `vars` 는 평문으로 배포되고 대시보드에서 그대로 보입니다. 시크릿은
     * `wrangler secret put` 으로만 들어가야 합니다. 이름만 적어 두는 것도
     * 안 됩니다 — 그 자리에 값이 들어가는 것은 시간 문제입니다.
     */
    /*
     * 슬라이스로 세지 않습니다.
     *
     * 전에는 `"vars"` 부터 2000자를 잘라 그 안을 봤습니다. 지금은 우연히 딱
     * 맞지만, `vars` 가 그보다 길어지면 **거기 들어간 진짜 시크릿을 놓칩니다.**
     * 돈이 걸린 방어를 문자열 길이에 걸어 둘 수는 없습니다.
     *
     * JSONC 를 정규식으로 파싱하는 것도 시도했다가 접었습니다 — 주석 안의
     * URL 과 문자열이 섞여 파서가 깨졌습니다. 중괄호를 세어 블록만 정확히
     * 떼어 냅니다. `vars` 의 값은 전부 문자열이고 중괄호가 없어 안전합니다.
     */
    const raw = readFileSync(join(root, 'wrangler.jsonc'), 'utf8');
    const marker = raw.indexOf('"vars"');
    expect(marker, 'wrangler.jsonc 에 vars 블록이 없습니다').toBeGreaterThan(-1);

    const open = raw.indexOf('{', marker);
    let depth = 0;
    let close = open;
    for (let i = open; i < raw.length; i++) {
      if (raw[i] === '{') depth += 1;
      else if (raw[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    expect(close, 'vars 블록의 끝을 찾지 못했습니다').toBeGreaterThan(open);
    const varsBlock = raw.slice(open, close + 1);

    /*
     * 이름만 봅니다. 값에 시크릿이 들어 있는지는 위의 저장소 스캔이 잡고,
     * 여기서 막는 것은 **그 자리에 시크릿을 둘 생각** 입니다 — 이름이 먼저
     * 들어오고 값이 나중에 들어옵니다.
     */
    const names = [...varsBlock.matchAll(/"([A-Za-z0-9_]+)"\s*:/g)].map((m) => m[1]);
    const leaked = names.filter((n) => /SECRET|TOKEN|PASSWORD/i.test(n));
    expect(
      leaked,
      `vars 는 평문으로 배포되고 대시보드에서 그대로 보입니다. wrangler secret put 으로 옮기세요: ${leaked.join(', ')}`,
    ).toEqual([]);
  });
});

test.describe('클라이언트 키 자리', () => {
  const kr = paymentConfig.countries.KR as unknown as {
    provider?: { name: string; clientKey: string };
  };

  test('KR 에 provider 블록이 있다', () => {
    expect(kr.provider, 'KR 에 provider 블록이 없습니다').toBeTruthy();
    expect(kr.provider!.name).toBe('tosspayments');
  });

  test('clientKey 는 비어 있거나 ck 키다', () => {
    /*
     * 빈 값은 "아직 계약 전" 이라는 뜻이고 정상입니다. 값이 있다면 반드시
     * 클라이언트 키여야 합니다 — 이 값은 HTML 에 그대로 실려 나갑니다.
     */
    const key = kr.provider!.clientKey;
    if (key === '') return;
    // 주문서형은 `gck`, API 개별 연동은 `ck` 입니다. 어느 쪽이든 **클라이언트**
    // 키여야 합니다 — 이 값은 HTML 에 그대로 실려 나갑니다.
    expect(key, `clientKey 가 ck 키가 아닙니다: ${key.slice(0, 12)}…`).toMatch(
      /^(test|live)_g?ck_[A-Za-z0-9]+$/,
    );
  });
});
