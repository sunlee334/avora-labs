import { test, expect } from '@playwright/test';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  charsFor,
  postStringsFor,
  packCoverage,
  unpackCoverage,
  POSTS_ROOT,
} from '../../scripts/build-fonts.mjs';
import { checkSlug, RESERVED_SLUG_PREFIXES } from '../../src/config/reserved-paths';
import { BUSINESS, LOCALE_LABELS, LOCALES } from '../../src/config/site';

/**
 * 글이 폰트를 깨뜨리지 않는지.
 *
 * ── 왜 이 검사가 있는가 ─────────────────────────────────────
 * 이 사이트의 폰트는 **언어별 서브셋**입니다. `src/i18n/{locale}.json` 에
 * 나오는 글자만 담아 한국어 body 가 93KB 로 끝납니다. 그 대가로,
 * **거기 없는 글자는 다른 서체로 떨어집니다.**
 *
 * 글 본문은 번역 파일에 없습니다. 그래서 수집하지 않으면 서브셋에서 빠지고,
 * 빌드는 멀쩡히 통과하는데 화면에서 한 문장 안의 자간·굵기가 달라집니다.
 * macOS 는 Apple SD Gothic Neo 가 받아 그럭저럭 보이지만 Windows·Android 는
 * 눈에 띄게 어긋납니다 — 만든 사람 화면에서는 안 보이는 종류의 사고입니다.
 *
 * ── 브라우저를 띄우지 않습니다 ──────────────────────────────
 * 빌드 스크립트의 함수를 직접 부릅니다. `www-redirect.spec.ts` 가
 * `canonicalHostRedirect` 를, `admin-allowlist.spec.ts` 가 `verifyAdmin` 을
 * 그렇게 부르는 것과 같습니다.
 */

const root = new URL('../../', import.meta.url);

/**
 * 시험용 글을 **임시 폴더**에 만듭니다.
 *
 * 실제 `src/content/posts/` 를 건드리면 안 됩니다 — Playwright 가
 * 프로젝트(mobile·desktop)와 워커를 병렬로 돌리므로 한쪽이 만든 파일을
 * 다른 쪽이 지우는 중에 읽어 터집니다. 그래서 charsFor 가 폴더를 인자로
 * 받습니다.
 */
function withPosts(files: Record<string, string>, run: (postsRoot: string) => void) {
  const base = mkdtempSync(join(tmpdir(), 'avora-posts-'));
  try {
    for (const [rel, raw] of Object.entries(files)) {
      const file = join(base, rel);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, raw, 'utf8');
    }
    run(base);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test.describe('글 글자 수집', () => {
  const RARE = '뷁';

  test('제목·요약·본문이 모두 서브셋 대상에 들어간다', () => {
    expect(
      (charsFor('ko').body as Set<string>).has(RARE),
      '시험 글자가 실제 문구에 이미 있으면 이 검사는 의미가 없습니다',
    ).toBe(false);

    withPosts(
      { 'ko/fixture.md': `---\ntitle: ${RARE}\nsummary: 요약\n---\n\n본문\n` },
      (postsRoot) => {
        expect((charsFor('ko', postsRoot).body as Set<string>).has(RARE)).toBe(true);
      },
    );
  });

  test('본문에만 있는 글자도 들어간다', () => {
    withPosts(
      { 'ko/fixture.md': `---\ntitle: 가\nsummary: 나\n---\n\n${RARE}\n` },
      (postsRoot) => {
        expect((charsFor('ko', postsRoot).body as Set<string>).has(RARE)).toBe(true);
      },
    );
  });

  test('언어가 섞이지 않는다', () => {
    // 로케일을 디렉터리로 가르는 이유입니다. 한국어 글의 글자가 영어 서브셋에
    // 들어가면 en/body.woff2 가 20KB 에서 수백 KB 로 부풀어 오릅니다.
    withPosts(
      { 'ko/fixture.md': `---\ntitle: ${RARE}\nsummary: 요약\n---\n\n본문\n` },
      (postsRoot) => {
        expect((charsFor('en', postsRoot).body as Set<string>).has(RARE)).toBe(false);
      },
    );
  });

  test('글이 없는 언어는 빈 배열이다', () => {
    withPosts({ 'ko/fixture.md': '---\ntitle: 가\nsummary: 나\n---\n본문\n' }, (postsRoot) => {
      expect(postStringsFor('th', postsRoot)).toEqual([]);
    });
  });

  test('실제 픽스처 글의 글자가 실제 서브셋 대상에 있다', () => {
    // 위 검사들은 임시 폴더를 씁니다. 진짜 경로도 한 번은 확인해야
    // POSTS_ROOT 가 어긋났을 때 드러납니다.
    expect(POSTS_ROOT).toContain('src/content/posts');
    expect((charsFor('ko').body as Set<string>).has('착')).toBe(true);
  });
});

/**
 * 사전 밖에 있으면서 모든 화면에 그려지는 글자.
 *
 * 서브셋은 오랫동안 `src/i18n/{locale}.json` 만 보고 만들어졌습니다. 그런데
 * 두 덩어리가 그 밖에 있으면서 **모든 페이지에** 나옵니다 — 푸터의 법정
 * 표시(`BUSINESS`)와 언어 전환기(`LOCALE_LABELS`).
 *
 * 실측한 구멍이었습니다. 한국어 서브셋에도 `랩`(아보라랩스)·`규`(이영규)·
 * `컵`(월드컵북로)이 없었고, 나머지 네 언어에는 주소와 상호의 한글이 통째로
 * 없었습니다. 언어 이름은 `한국어`·`Tiếng Việt` 이 같은 상태였습니다.
 *
 * ── 이 검사가 지키지 **못하는** 것 ──────────────────────────
 * 여기서 보는 것은 "서브셋에 요구했는가" 이지 "빌드 산출물에 들어갔는가" 가
 * 아닙니다. 둘이 갈리는 경우가 있습니다 — 원본 서체에 애초에 없는 글자는
 * 요구해도 들어갈 수 없고, 그게 정상입니다. `简体中文`·`ไทย` 가 그렇습니다
 * (body 는 Pretendard 라 CJK·타이 글자가 없습니다). 산출물까지 대조하는 것은
 * `npm run check:fonts` 이고 prebuild 와 CI 가 그것을 돌립니다.
 *
 * ── 왜 `charsFor` 가 아니라 여기서 요구하는가 ───────────────
 * `charsFor` 에서 이 값들을 빼면 기대집합과 실제집합이 **함께** 줄어
 * `fonts-coverage.spec.ts` 는 그대로 통과합니다. 그래서 요구를 이 파일에
 * 적습니다 — 원본(`site.ts`)에서 직접 읽어 대조하므로, 수집을 지우면 여기가
 * 막습니다. `panel.spec.ts` 가 목적지를 이름으로 못 박은 것과 같은 이유입니다.
 */
test.describe('사전 밖의 글자도 서브셋에 있다', () => {
  const always = [...Object.values(BUSINESS), ...Object.values(LOCALE_LABELS)]
    .filter((v): v is string => typeof v === 'string')
    .join('');

  for (const locale of LOCALES) {
    test(`${locale}: 사업자 정보와 언어 이름이 전부 들어 있다`, () => {
      const { body } = charsFor(locale);
      const missing = [...new Set(always)].filter((ch) => ch !== ' ' && !body.has(ch));
      expect(
        missing,
        `${locale} 서브셋 요구 목록에서 빠진 글자: ${missing.join('')} — ` +
          '원본 서체가 가진 글자라면 그대로 시스템 서체로 떨어집니다',
      ).toEqual([]);
    });
  }
});

test.describe('마크다운이 렌더될 때만 나오는 글자', () => {
  // 소스 어디에도 없지만 화면에는 나타납니다. 수집 대상에 못 들어가므로
  // COMMON 에 직접 넣어야 합니다.
  for (const [name, ch] of [
    ['목록 마커', '•'],
    ['코드', '`'],
    ['취소선', '~'],
  ] as const) {
    test(`${name} ${ch} 가 서브셋 대상에 있다`, () => {
      expect((charsFor('ko').body as Set<string>).has(ch)).toBe(true);
    });
  }
});

test.describe('글 주소 검사', () => {
  test('금칙어로 시작하면 막는다', () => {
    // 사이트맵 filter 가 부분 문자열이라 /ko/support/posts/checkout-tips/ 가
    // '/checkout' 에 걸려 색인에서 조용히 빠집니다.
    expect(checkSlug('checkout-tips')).toBe('checkout');
    expect(checkSlug('order-guide')).toBe('order');
    expect(checkSlug('admin')).toBe('admin');
  });

  test('완전 일치가 아니라 접두 일치다', () => {
    // 완전 일치로 구현하면 이것들이 전부 통과해 원래 문제가 그대로 남습니다.
    for (const slug of ['cart-tips', 'account-faq', '404-guide']) {
      expect(checkSlug(slug), slug).not.toBeNull();
    }
  });

  test('대소문자를 가리지 않는다', () => {
    expect(checkSlug('Checkout-Tips')).toBe('checkout');
  });

  test('정상 slug 는 통과한다', () => {
    for (const slug of ['shipping-notice', 'sunscreen-guide', 'reapply-when']) {
      expect(checkSlug(slug), slug).toBeNull();
    }
  });

  test('금칙어 목록이 사이트맵 filter 와 같은 곳에서 온다', () => {
    /*
     * 두 곳에 각자 적어 두면 시간이 지나며 벌어지고, 그때 생기는 사고는
     * 조용합니다 — 글 하나가 사이트맵에서 소리 없이 빠지는 식입니다.
     *
     * 판정 자체는 `reserved-paths.ts` 의 `inSitemap()` 이 합니다. 설정 파일은
     * 그것을 부르기만 해야 하고, 목록을 다시 적으면 안 됩니다.
     */
    const config = readFileSync(fileURLToPath(new URL('astro.config.ts', root)), 'utf-8');
    expect(config, '사이트맵 판정을 설정 파일에서 직접 하고 있습니다').toContain('inSitemap');
    expect(config).toContain("from './src/config/reserved-paths'");
    // 목록을 설정 파일에 베껴 적었는지.
    expect(config).not.toMatch(/\['\/404',[\s\S]*'\/order\/',?\s*\]/);
    expect(config).not.toContain("'/panel'");
    expect(RESERVED_SLUG_PREFIXES).toContain('checkout');
    expect(RESERVED_SLUG_PREFIXES).toContain('order');
  });

  test('check:slugs 가 prebuild 에 있다', () => {
    // 스크립트만 있고 아무도 부르지 않으면 없는 것과 같습니다.
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('package.json', root)), 'utf-8'));
    expect(pkg.scripts.prebuild).toContain('check:slugs');
  });
});

test.describe('폰트 검사가 실제로 도는가', () => {
  test('CI 에서는 도구가 없으면 통과시키지 않는다', () => {

    /*
     * 예전에는 도구가 없으면 "생략" 하고 통과했습니다. CI 에는 fontTools 도
     * brotli 도 없었으므로, 이 검사는 **배포 경로에서 한 번도 돈 적이
     * 없습니다.** 열린 채로 잠긴 척하는 문이었습니다.
     *
     * `AVORA_FONT_PY` 로 없는 파이썬을 가리켜 도구 부재를 재현합니다.
     *
     * 예전에는 `.fontsrc/venv` 를 잠깐 옮겼는데, 테스트가 두 번의 이동
     * 사이에서 죽으면 저장소에 `venv-hidden-by-test` 만 남습니다. 그 뒤로는
     * `npm run fonts` 가 실패하고 `check:fonts` 는 조용히 건너뜁니다 —
     * 검사를 지키려던 테스트가 검사를 끄는 셈입니다.
     */
    const run = (env: NodeJS.ProcessEnv) => {
      try {
        // node 는 절대 경로로 부릅니다 — PATH 를 비우면 node 자신도 못 찾습니다.
        execFileSync(process.execPath, ['scripts/build-fonts.mjs', '--check'], {
          cwd: fileURLToPath(root),
          env,
          encoding: 'utf8',
          stdio: 'pipe',
        });
        return 0;
      } catch (error) {
        return (error as { status?: number }).status ?? -1;
      }
    };

    const noTools = { ...process.env, AVORA_FONT_PY: '/nonexistent/python' };
    expect(run({ ...noTools, CI: undefined }), '로컬은 건너뛰고 통과해야 합니다').toBe(0);
    expect(run({ ...noTools, CI: 'true' }), 'CI 는 검사를 못 하면 실패해야 합니다').toBe(1);

    /*
     * 그리고 도구가 있으면 진짜로 검사합니다 — 위 둘만 보면 "언제나
     * 건너뛴다" 여도 통과합니다.
     *
     * 다만 도구 없이 화면만 보려는 사람의 길을 막지 않는 것이 이 스크립트의
     * 정책이므로(build-fonts.mjs 의 CI 분기 주석), 그런 기계에서는 이
     * 단언을 건너뜁니다.
     */
    const output = execFileSync(process.execPath, ['scripts/build-fonts.mjs', '--check'], {
      cwd: fileURLToPath(root),
      encoding: 'utf8',
    });
    test.skip(output.includes('생략'), 'fontTools 가 없는 기계 — 이 단언은 의미가 없습니다');
    expect(output).toContain('모두 포함');
  });

  test('서브셋에 없는 글자가 생기면 실제로 실패한다', () => {
    /*
     * 이 파일의 나머지 검사는 전부 **주변**을 봅니다 — 도구가 없을 때,
     * 수집 함수가 무엇을 모으는지, 규칙이 어느 범위를 보는지.
     *
     * 정작 이 게이트의 존재 이유인 **"글자가 빠지면 빌드가 선다"** 는
     * 아무도 돌려 보지 않았습니다. 그래서 검사가 통째로 죽어 있어도
     * 나머지가 전부 초록일 수 있습니다.
     */
    const dir = mkdtempSync(join(tmpdir(), 'avora-probe-'));
    try {
      mkdirSync(join(dir, 'ko'), { recursive: true });
      // 지금 서브셋에 없는 글자들. 있으면 이 검사가 무의미해집니다.
      const rare = '뷁쐟괆흄퀩';
      writeFileSync(
        join(dir, 'ko', 'probe.md'),
        `---\ntitle: ${rare}\nsummary: 요약\n---\n\n본문\n`,
        'utf8',
      );

      let status = 0;
      let stderr = '';
      try {
        execFileSync(process.execPath, ['scripts/build-fonts.mjs', '--check'], {
          cwd: fileURLToPath(root),
          env: { ...process.env, AVORA_POSTS_ROOT: dir },
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } catch (error) {
        const e = error as { status?: number; stdout?: string; stderr?: string };
        status = e.status ?? -1;
        stderr = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      }

      test.skip(stderr.includes('생략'), 'fontTools 가 없는 기계 — 이 검사는 도구가 있어야 합니다');
      expect(status, '서브셋에 없는 글자가 있는데 통과했습니다').toBe(1);
      expect(stderr, '어떤 글자가 빠졌는지 알려주지 않습니다').toContain(rare);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('여러 줄 프론트매터의 글자도 수집한다', () => {
    /*
     * YAML 의 접힌 스칼라(`title: >`)와 리터럴 블록(`summary: |`)은 값이
     * 다음 줄로 갑니다. 한 줄만 보는 파서로 뽑으면 제목 글자가 통째로
     * 빠지고, 생성과 검사가 같은 함수를 쓰면 아무도 못 잡습니다.
     * 그래서 수집은 원문을 통째로 넘깁니다.
     */
    const rare = '뷁';
    for (const [name, frontmatter] of [
      ['접힌 스칼라', `title: >\n  ${rare} 로 시작하는 긴 제목\nsummary: 요약`],
      ['리터럴 블록', `title: 가\nsummary: |\n  ${rare} 가 들어간 요약`],
      ['다음 줄 값', `title:\n  ${rare}\nsummary: 요약`],
    ] as const) {
      withPosts({ 'ko/fixture.md': `---\n${frontmatter}\n---\n\n본문\n` }, (postsRoot) => {
        expect((charsFor('ko', postsRoot).body as Set<string>).has(rare), name).toBe(true);
      });
    }
  });

  test('커버리지 파일이 왕복 무손실이고 깨지지 않았다', () => {
    /*
     * 이 파일들이 CI 에서 서브셋 검사의 **유일한 근거**입니다.
     * 깨지거나 잘리면 예전에는 빈 Set 이 되어 조용히 전부 통과시켰습니다 —
     * 옛 정규식의 54% 실명보다 나쁜 100% 실명이었습니다.
     *
     * 제목이 문자별로 갈리면서 근거도 여러 개가 됐습니다. 하나라도 빠지면
     * 그 문자만 조용히 검사에서 빠지므로 전부 봅니다.
     */
    const dir = fileURLToPath(new URL('scripts/', root));
    const files = readdirSync(dir).filter((f) => f.endsWith('-source-coverage.txt'));
    expect(files.length, '커버리지 파일이 없습니다').toBeGreaterThanOrEqual(6);

    for (const name of files) {
      const text = readFileSync(join(dir, name), 'utf8');
      const set = unpackCoverage(text) as Set<string>;
      expect(set.size, `${name} 이 비어 있습니다`).toBeGreaterThan(80);
      expect(packCoverage(set, text.match(/— (\S+)/)?.[1] ?? ''), `${name} 왕복 손실`).toBe(text);
    }

    const load = (id: string) =>
      unpackCoverage(readFileSync(join(dir, `${id}-source-coverage.txt`), 'utf8')) as Set<string>;

    // 옛 규칙이 못 보던 글자를, 그것을 맡은 면이 실제로 담고 있어야
    // 이 장치가 값을 합니다.
    const sc = load('display-sc');
    for (const ch of ['龍', '韓', '漢']) expect(sc.has(ch), `display-sc 에 ${ch}`).toBe(true);
    expect(sc.size, 'display-sc 가 한자를 담고 있어야 합니다').toBeGreaterThan(20000);

    const kr = load('display-kr');
    expect(kr.has('한'), 'display-kr 에 한글').toBe(true);
    expect(kr.size).toBeGreaterThan(10000);

    const th = load('display-th');
    expect(th.has('ก'), 'display-th 에 태국 문자').toBe(true);

    // BMP 밖 글자도 손실 없이 왕복해야 합니다.
    expect([...sc].some((ch) => ch.codePointAt(0)! > 0xffff)).toBe(true);
  });

  test('깨진 커버리지는 조용히 통과시키지 않는다', () => {
    // 33KB 파일이라 두 브랜치가 각각 재생성하면 충돌합니다. 충돌 마커가
    // 남거나 잘못 해소되면 그것이 곧 이 상태입니다.
    for (const [name, text] of [
      ['빈 파일', ''],
      ['머리글 없음', '20-7e,a0-ff'],
      ['해석 불가', '# 23124 chars\ngarbage'],
      ['개수 불일치', '# 23124 chars\n20-7e'],
      ['충돌 마커', '# 23124 chars\n20-7e\n<<<<<<< HEAD'],
    ] as const) {
      expect(() => unpackCoverage(text), name).toThrow();
    }
  });

  test('원본이 없는 환경에서도 display 를 정확히 검사한다', () => {
    /*
     * display 원본(NotoSerifKR.ttf, 23MB)은 .gitignore 라 CI 에 없습니다.
     * 그러면 판정이 옛 정규식 `/[ -ɏ가-힣]/` 으로 되돌아가는데, 그 규칙은
     * **중국어 display 209자 중 113자(54%)** 를 아예 보지 않습니다.
     * 헤드라인 서브셋에서 글자가 절반쯤 빠져도 통과한다는 뜻입니다.
     *
     * 그래서 cmap 을 33KB 로 접어 커밋합니다. 이 파일이 사라지거나
     * .gitignore 에 들어가면 그 구멍이 조용히 되돌아옵니다.
     */
    const dir = fileURLToPath(new URL('scripts/', root));
    const files = readdirSync(dir).filter((f) => f.endsWith('-source-coverage.txt'));
    expect(files.length, '커버리지 파일이 없습니다').toBeGreaterThanOrEqual(6);

    /*
     * 새 서체를 더하면 커버리지 파일도 하나 늘어납니다. 그것을 커밋하지 않으면
     * CI 에는 근거가 없는 면이 생기고, 그 면만 조용히 검사에서 빠집니다.
     * 그래서 **전부** 추적되고 있는지 봅니다.
     */
    const tracked = new Set(
      execFileSync('git', ['ls-files', 'scripts/'], { cwd: fileURLToPath(root), encoding: 'utf8' })
        .split('\n')
        .map((l) => l.replace(/^scripts\//, '').trim()),
    );
    for (const name of files) {
      expect(
        tracked.has(name),
        `${name} 이 저장소에 추적되지 않습니다 — CI 에서 사라집니다`,
      ).toBe(true);
    }

    // 옛 규칙이 못 보는 글자가 실제로 많다는 것을 숫자로 고정합니다.
    const OLD_RULE = /[ -ɏ가-힣]/;
    const zh = charsFor('zh').display as Set<string>;
    const blind = [...zh].filter((ch) => !OLD_RULE.test(ch));
    // 비율로 고정하면 카피 편집만으로 깨집니다(한자가 줄면 분모도 줄어듦).
    // 요지는 "옛 규칙이 상당수를 못 봤다" 는 사실이므로 절대값으로 둡니다.
    expect(
      blind.length,
      '옛 규칙이 못 보던 글자가 이만큼 있었습니다 — 커버리지 파일이 그것을 메웁니다',
    ).toBeGreaterThan(50);
  });

  test('검사가 원본 서체 기준이라 베트남어 성조 문자도 본다', () => {
    /*
     * 옛 판정은 정규식 화이트리스트였습니다 — `/[ -ɏ가-힣]/`.
     * 그 범위는 ASCII~Latin Ext-B 와 완성형 한글뿐이라 베트남어 성조
     * 문자(U+1EA0~U+1EF9)를 통째로 못 봤습니다. Pretendard 에 있는
     * 글자인데도 서브셋에서 빠지면 조용히 넘어갔다는 뜻입니다.
     */
    const OLD_RULE = /[ -ɏ가-힣]/;
    expect(OLD_RULE.test('ế'), '옛 규칙은 이 글자를 검사 대상으로 보지 않았습니다').toBe(false);

    // 그리고 그 글자는 실제로 베트남어 화면에 쓰입니다.
    expect((charsFor('vi').body as Set<string>).has('ế')).toBe(true);
  });
});
