import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { charsFor, parseFrontmatter, postStringsFor, POSTS_ROOT } from '../../scripts/build-fonts.mjs';
import { checkSlug, RESERVED_SLUG_PREFIXES } from '../../src/config/reserved-paths';

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

test.describe('프론트매터 파서', () => {
  test('제목과 요약을 꺼낸다', () => {
    const { title, summary, body } = parseFrontmatter(
      '---\ntitle: 배송 안내\nsummary: 언제 출발하는지\ncategory: notice\n---\n\n본문입니다\n',
    );
    expect(title).toBe('배송 안내');
    expect(summary).toBe('언제 출발하는지');
    expect(body.trim()).toBe('본문입니다');
  });

  test('값 안의 콜론을 감당한다', () => {
    // YAML 은 값에 콜론이 있으면 따옴표를 요구합니다. 순진하게 split(':') 하면
    // "재도포" 만 남고 "언제" 가 서브셋에서 빠집니다.
    const { title } = parseFrontmatter('---\ntitle: "재도포: 언제 하나"\n---\n본문\n');
    expect(title).toBe('재도포: 언제 하나');
  });

  test('작은따옴표도 벗긴다', () => {
    const { title } = parseFrontmatter("---\ntitle: '안내'\n---\n본문\n");
    expect(title).toBe('안내');
  });

  test('프론트매터가 없으면 전부 본문이다', () => {
    const { title, body } = parseFrontmatter('제목 없는 글\n');
    expect(title).toBe('');
    expect(body).toContain('제목 없는 글');
  });

  test('본문의 --- 를 프론트매터 끝으로 오해하지 않는다', () => {
    // 마크다운의 수평선입니다. 첫 --- 쌍만 프론트매터입니다.
    const { title, body } = parseFrontmatter('---\ntitle: 가\n---\n\n앞\n\n---\n\n뒤\n');
    expect(title).toBe('가');
    expect(body).toContain('앞');
    expect(body).toContain('뒤');
  });
});

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
    // 두 곳에 각자 적어 두면 시간이 지나며 벌어지고, 그때 생기는 사고는 조용합니다.
    const config = readFileSync(fileURLToPath(new URL('astro.config.ts', root)), 'utf-8');
    expect(config).toContain('SITEMAP_EXCLUDED');
    expect(config).not.toMatch(/\['\/404',[\s\S]*'\/order\/',?\s*\]/);
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

    // 그리고 도구가 있으면 진짜로 검사합니다 — 위 둘만 보면 "언제나 건너뛴다"
    // 여도 통과합니다.
    const output = execFileSync(process.execPath, ['scripts/build-fonts.mjs', '--check'], {
      cwd: fileURLToPath(root),
      encoding: 'utf8',
    });
    expect(output, '도구가 있는데도 건너뛰고 있습니다').not.toContain('생략');
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
    const coverage = fileURLToPath(new URL('scripts/display-source-coverage.txt', root));
    expect(existsSync(coverage), 'display 커버리지 파일이 없습니다').toBe(true);

    const tracked = execFileSync('git', ['ls-files', 'scripts/display-source-coverage.txt'], {
      cwd: fileURLToPath(root),
      encoding: 'utf8',
    }).trim();
    expect(tracked, '커버리지 파일이 저장소에 추적되지 않습니다 — CI 에서 사라집니다').not.toBe('');

    // 옛 규칙이 못 보는 글자가 실제로 많다는 것을 숫자로 고정합니다.
    const OLD_RULE = /[ -ɏ가-힣]/;
    const zh = charsFor('zh').display as Set<string>;
    const blind = [...zh].filter((ch) => !OLD_RULE.test(ch));
    expect(blind.length / zh.size).toBeGreaterThan(0.4);
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
