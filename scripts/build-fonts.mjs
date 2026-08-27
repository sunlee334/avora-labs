/**
 * 언어별 웹폰트 서브셋.
 *
 * 왜 언어별인가:
 *   Pretendard 가 기본 제공하는 동적 서브셋은 한글을 90여 조각으로 나눠 두는데,
 *   한국어 페이지 하나가 그중 6조각(약 184KB)을 받아 갑니다. 영어 페이지도
 *   같은 CSS 를 물고 있어 불필요한 조각을 평가하게 됩니다.
 *   이 사이트는 정적이라 각 언어 페이지에 어떤 글자가 들어가는지 빌드 시점에 정확히 압니다.
 *   언어별로 그 글자만 남기면 영어·베트남어 페이지는 수십 KB 로 떨어집니다.
 *
 * 결과물: public/fonts/{locale}/{body,display}.woff2 + fonts.css
 * 저장소에 커밋하므로 평소 빌드에는 원본 폰트도 Python 도 필요 없습니다.
 *
 * 사용법:
 *   node scripts/build-fonts.mjs           생성
 *   node scripts/build-fonts.mjs --check   현재 서브셋이 모든 글자를 담는지 검사 (빌드에서 자동 실행)
 *
 * 준비물 (생성할 때만):
 *   mkdir -p .fontsrc && curl -L -o .fontsrc/NotoSerifKR.ttf \
 *     "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifkr/NotoSerifKR%5Bwght%5D.ttf"
 *   python3 -m venv .fontsrc/venv && .fontsrc/venv/bin/pip install fonttools brotli
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ROOT = resolve(root, 'public/fonts');
const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'];

/** body 서브셋이 이보다 커지면 경고합니다. 지금(95KB)의 약 두 배. */
const BODY_WARN_KB = 200;

const SOURCES = {
  body: resolve(root, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'),
  display: resolve(root, '.fontsrc/NotoSerifKR.ttf'),
};

const VENV_PY = resolve(root, '.fontsrc/venv/bin/python');
const PY = existsSync(VENV_PY) ? VENV_PY : 'python3';

/**
 * 헤드라인(--font-display)이 적용되는 자리.
 * global.css 의 .display / .quote / .hero__* / .journey__word /
 * .principles__term / .footer__tagline 에 대응합니다.
 */
const DISPLAY_PATHS = [
  'home.journey.lead',
  'home.promise.lead',
  'home.product.name',
  'home.question.quote',
  'home.philosophy.quote',
  'home.origin.statementBefore',
  'home.origin.statementEmphasis',
  'home.origin.statementAfter',
  'product.hero.headline',
  'footer.tagline',
  'legal.privacy.heading',
  'notFound.heading',
];

/** 마크업에 직접 박혀 있어 번역 파일에는 없는 문구 + 기본 문자셋 */
const COMMON = [
  'For every movement.',
  'MOVE. SWEAT. REAPPLY.',
  'Sun Sweat Water Movement Reapply',
  'Stay Breathe Pure',
  'Daily Sunscreen',
  'AVORA SKIN WATER',
  'SPF50+ / PA++++',
  '0123456789',
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ' .,·:;!?%&()[]{}<>/\\|-–—_+=*#@\'"“”‘’…©®™',
  // 마크다운이 렌더될 때만 나타나는 글자. 소스 어디에도 없어 수집되지 않습니다.
  //   • 목록 마커. 텍스트 노드가 아니지만 요소의 폰트로 그려집니다
  //   ` ~ 코드·취소선이 본문에 나올 경우
  '•`~',
];

const get = (obj, path) => path.split('.').reduce((acc, k) => acc?.[k], obj);

function walkStrings(node, out) {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => walkStrings(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('$')) continue; // 메타 주석은 화면에 안 나옵니다
      walkStrings(v, out);
    }
  }
}

/**
 * 프론트매터에서 화면에 나오는 두 값만 꺼냅니다.
 *
 * `title` 과 `summary` 는 목록·상세에 그대로 표시되므로 서브셋에 있어야 합니다.
 * `---` 블록을 통째로 버리면 그 글자들이 빠져 제목만 다른 서체로 나옵니다.
 *
 * 나머지 키(category·날짜)는 원문이 화면에 안 나갑니다 — 카테고리는 번역된
 * 라벨로, 날짜는 숫자와 하이픈으로만 렌더합니다.
 *
 * YAML 파서를 쓰지 않는 이유: 이 스크립트는 `prebuild` 의 네 번째로 도는
 * 순수 노드 스크립트이고, 의존성을 하나 더 들이기에는 읽는 것이 두 줄뿐입니다.
 * 대신 인용부호와 값 안의 콜론(`title: "재도포: 언제"`)은 다뤄야 합니다.
 */
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { title: '', summary: '', body: raw };

  const fields = { title: '', summary: '' };
  for (const line of match[1].split(/\r?\n/)) {
    // 키는 줄 맨 앞에서 시작합니다. 들여쓴 줄은 중첩 값이라 건너뜁니다.
    const kv = line.match(/^(title|summary)\s*:\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    // 따옴표로 감쌌으면 벗깁니다. 값 안의 콜론은 이 경로로 들어옵니다.
    const quoted = value.match(/^(['"])([\s\S]*)\1$/);
    if (quoted) value = quoted[2];
    fields[kv[1]] = value;
  }

  return { ...fields, body: raw.slice(match[0].length) };
}

/**
 * 이 언어의 글에 쓰인 글자.
 *
 * 로케일을 디렉터리로 가르기 때문에 그 폴더만 읽으면 됩니다. 프론트매터로만
 * 구분했다면 전 파일을 파싱해야 하고, 구분에 실패하면 영어·베트남어 서브셋에
 * 한글이 통째로 들어갑니다.
 */
export const POSTS_ROOT = resolve(root, 'src/content/posts');

export function postStringsFor(locale, postsRoot = POSTS_ROOT) {
  const dir = resolve(postsRoot, locale);
  if (!existsSync(dir)) return [];

  const out = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    let raw;
    try {
      raw = readFileSync(resolve(dir, file), 'utf8');
    } catch {
      // 목록을 읽은 뒤 파일이 사라졌습니다. 다음 빌드에서 다시 봅니다.
      continue;
    }
    const { title, summary, body } = parseFrontmatter(raw);
    out.push(title, summary, body);
  }
  return out;
}

/**
 * `postsRoot` 는 시험용입니다. 실제 빌드는 기본값을 씁니다.
 *
 * 이 인자가 없으면 테스트가 `src/content/posts/` 에 파일을 만들었다 지워야
 * 하는데, Playwright 는 프로젝트(mobile·desktop)와 워커를 병렬로 돌리므로
 * 한쪽이 만든 것을 다른 쪽이 지우다 부딪힙니다. 실제 콘텐츠를 건드리지
 * 않게 하는 편이 안전합니다.
 */
export function charsFor(locale, postsRoot = POSTS_ROOT) {
  const data = JSON.parse(readFileSync(resolve(root, `src/i18n/${locale}.json`), 'utf8'));

  const bodyStrings = [];
  walkStrings(data, bodyStrings);
  // 글 본문은 번역 파일에 없습니다. 여기서 합치지 않으면 서브셋에 빠지고,
  // 빌드는 통과하는데 화면에서 한 문장 안의 서체가 섞입니다.
  bodyStrings.push(...postStringsFor(locale, postsRoot));
  const displayStrings = DISPLAY_PATHS.map((p) => get(data, p)).filter(Boolean);
  for (const item of data.product?.principles?.items ?? []) displayStrings.push(item.term);
  for (const step of data.home?.journey?.steps ?? []) displayStrings.push(step.word);

  const toSet = (list) => {
    const s = new Set();
    for (const str of [...COMMON, ...list]) for (const ch of str) if (ch !== '\n') s.add(ch);
    return s;
  };

  return { body: toSet(bodyStrings), display: toSet(displayStrings) };
}

function subset(sourceFile, outFile, chars, extraArgs = []) {
  /*
   * 글자 목록을 인자가 아니라 파일로 넘깁니다.
   *
   * `--text=` 는 argv 원소 하나이고 리눅스의 인자 길이 한도는 인자당 128KB 로
   * 고정입니다(ARG_MAX 를 올려도 못 넘깁니다). 한글 한 자가 UTF-8 3바이트라
   * 약 43,000자에서 E2BIG 가 납니다. 지금은 수백 자지만 글이 쌓이면
   * 다가가므로 미리 옮깁니다.
   */
  const listFile = join(tmpdir(), `avora-subset-${process.pid}-${chars.size}.txt`);
  writeFileSync(listFile, [...chars].sort().join(''), 'utf8');

  try {
    execFileSync(
    PY,
    [
      '-m', 'fontTools.subset', sourceFile,
      `--text-file=${listFile}`,
      '--output-file=' + outFile,
      '--flavor=woff2',
      '--layout-features=kern,liga,calt',
      '--no-hinting',
      '--desubroutinize',
      '--name-IDs=1,2,3,4,6',
      ...extraArgs,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
    );
  } finally {
    rmSync(listFile, { force: true });
  }
  return statSync(outFile).size;
}

function glyphsIn(file) {
  const script = `
import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1], lazy=True)
codes = set()
for t in f['cmap'].tables:
    codes.update(t.cmap.keys())
sys.stdout.write(''.join(chr(c) for c in sorted(codes)))
`;
  return new Set(
    execFileSync(PY, ['-c', script, file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
  );
}

const css = (locale) => `/* 자동 생성 — scripts/build-fonts.mjs (${locale})
   이 언어 페이지에 실제로 쓰이는 글자만 담은 서브셋입니다.
   문구를 바꾸면 npm run fonts 로 다시 만드세요. */
@font-face {
  font-family: 'AVORA Body';
  src: url('/fonts/${locale}/body.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'AVORA Display';
  src: url('/fonts/${locale}/display.woff2') format('woff2-variations');
  font-weight: 300 600;
  font-style: normal;
  font-display: swap;
}
`;

/**
 * 원본 서체가 가진 글자. kind 마다 한 번만 읽고 재사용합니다.
 *
 * body 원본은 npm 의존성이라 어디에나 있지만, display 원본은 23MB 라
 * 저장소에 두지 않습니다(.gitignore). 없으면 null 을 돌려주고 호출한 쪽이
 * 예전 방식으로 넘어갑니다 — 검사를 못 한다고 빌드를 세우지는 않습니다.
 */
const sourceGlyphCache = new Map();
function sourceGlyphs(kind) {
  if (sourceGlyphCache.has(kind)) return sourceGlyphCache.get(kind);
  const src = SOURCES[kind];
  const result = existsSync(src) ? glyphsIn(src) : null;
  sourceGlyphCache.set(kind, result);
  return result;
}

/*
 * ── 여기부터 실행부 ─────────────────────────────────────────
 *
 * 이 파일을 import 하면 위의 함수만 가져옵니다. 가드가 없으면 import 하는
 * 순간 5개 언어 서브셋 검사가 통째로 돌고, 실패 시 process.exit(1) 이
 * 테스트 러너를 죽입니다.
 *
 * tests/e2e/fonts-content.spec.ts 가 charsFor·parseFrontmatter 를 직접
 * 불러 씁니다 — worker/canonical-host.ts 와 worker/admin.ts 를 스펙이
 * import 하는 것과 같은 방식입니다.
 */
const isEntrypoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {

  const checkOnly = process.argv.includes('--check');
  let failed = false;

  /*
   * ── 검사 도구가 있는가 ──────────────────────────────────────
   *
   * 여기서 한 번만 판정합니다. 로케일마다 try/catch 를 두면 실패 이유를
   * 다섯 번 반복해 찍으면서도 정작 "그래서 검사가 됐나" 는 흐려집니다.
   *
   * 막는 것은 두 가지이고 둘 다 여기로 옵니다.
   *   fontTools 없음   — 파이썬 모듈이 아예 없을 때
   *   brotli 없음      — fontTools 는 있는데 woff2 를 못 열 때.
   *                      서브셋 파일이 전부 woff2 라 이쪽이 더 흔합니다
   *
   * ⚠️ **CI 에서는 검사를 못 하면 실패로 봅니다.**
   *    지금까지는 "도구가 없으면 통과" 였습니다. 그래서 배포 경로에서
   *    이 검사는 한 번도 돈 적이 없습니다 — 워크플로가 파이썬 패키지를
   *    설치하지 않으니까요. 열린 채로 잠긴 척하는 문이었습니다.
   *
   *    로컬은 그대로 건너뜁니다. 폰트 도구 없이 화면만 보려는 사람의
   *    길까지 막을 이유는 없습니다.
   */
  let toolsOk = true;
  if (checkOnly) {
    try {
      glyphsIn(SOURCES.body);
    } catch (cause) {
      toolsOk = false;
      const reason = String(cause?.message ?? cause).includes('Brotli')
        ? 'brotli 확장이 없어 woff2 를 열지 못합니다'
        : 'fontTools 를 찾지 못했습니다';

      if (process.env.CI) {
        console.error(`\n글자 검사를 할 수 없습니다 — ${reason}.`);
        console.error('CI 에서는 검사를 건너뛰지 않습니다. 워크플로에 아래를 추가하세요:\n');
        console.error('  - uses: actions/setup-python@v5');
        console.error('  - run: pip install fonttools brotli\n');
        process.exit(1);
      }
      console.log(`글자 검사 생략 — ${reason}. (파일 자체는 확인합니다)`);
    }
  }

  for (const locale of LOCALES) {
    const outDir = resolve(OUT_ROOT, locale);
    const need = charsFor(locale);

    if (checkOnly) {
      let ok = true;
      for (const kind of ['body', 'display']) {
        const file = resolve(outDir, `${kind}.woff2`);
        if (!existsSync(file)) {
          console.error(`${locale}/${kind}.woff2 가 없습니다 — npm run fonts 를 실행하세요.`);
          failed = true;
          ok = false;
          continue;
        }
        if (!toolsOk) continue; // 위에서 이미 알렸습니다. 로컬 전용 경로입니다.

        const have = glyphsIn(file);

        /*
         * 원본에 애초에 없는 글자는 폴백이 정상입니다 — 태국어를 라틴 서체에서
         * 찾는 것 같은 경우입니다.
         *
         * 예전에는 그것을 정규식 화이트리스트(`/[ -ɏ가-힣]/`)로 근사했습니다.
         * 그 범위는 ASCII~Latin Ext-B 와 완성형 한글뿐이라 **베트남어 성조
         * 문자(ế ạ ộ ữ)를 통째로 못 봤습니다.** Pretendard 에 있는 글자인데도
         * 서브셋에서 빠지면 조용히 넘어갔다는 뜻입니다.
         *
         * 이제 원본 서체가 실제로 가진 글자와 비교합니다. 근사가 아니라 사실입니다.
         */
        const source = sourceGlyphs(kind);
        const missing = source
          ? [...need[kind]].filter((ch) => source.has(ch) && !have.has(ch))
          : [...need[kind]].filter((ch) => !have.has(ch) && /[ -ɏ가-힣]/.test(ch));
        if (missing.length) {
          console.error(`${locale}/${kind}: 서브셋에 없는 글자 ${missing.length}자 → ${missing.join('')}`);
          failed = true;
          ok = false;
        }
      }
      if (ok) console.log(`✓ ${locale} — body ${need.body.size}자 / display ${need.display.size}자 모두 포함`);

      /*
       * 서브셋은 글이 늘수록 커집니다. 그리고 이 파일은 그 언어의 **모든**
       * 페이지가 preload 합니다 — 글 20편의 글자 때문에 홈이 느려질 수 있습니다.
       *
       * 세우지는 않습니다. 어느 크기부터 문제인지는 실측해 봐야 알고, 그때
       * 필요한 것은 빌드 중단이 아니라 "글 전용 서브셋을 나눌 때가 됐다" 는
       * 신호입니다. 임계는 지금 크기(95KB)의 약 두 배로 잡았습니다.
       */
      const bodyFile = resolve(outDir, 'body.woff2');
      if (existsSync(bodyFile)) {
        const kb = Math.round(statSync(bodyFile).size / 1024);
        if (kb > BODY_WARN_KB) {
          console.log(
            `  ⚠ ${locale}/body.woff2 가 ${kb}KB 입니다(기준 ${BODY_WARN_KB}KB). ` +
              `이 파일은 /${locale}/ 전 페이지가 받습니다 — 글 전용 서브셋 분리를 검토하세요.`,
          );
        }
      }
      continue;
    }

    for (const [kind, src] of Object.entries(SOURCES)) {
      if (!existsSync(src)) {
        console.error(`원본 폰트가 없습니다: ${src}\n파일 상단 주석의 준비물 명령을 참고하세요.`);
        process.exit(1);
      }
    }

    mkdirSync(outDir, { recursive: true });
    const bodySize = subset(SOURCES.body, resolve(outDir, 'body.woff2'), need.body);
    const displaySize = subset(SOURCES.display, resolve(outDir, 'display.woff2'), need.display);
    writeFileSync(resolve(outDir, 'fonts.css'), css(locale), 'utf8');

    console.log(
      `${locale}  body ${String(Math.round(bodySize / 1024)).padStart(3)}KB (${need.body.size}자)` +
        `  display ${String(Math.round(displaySize / 1024)).padStart(3)}KB (${need.display.size}자)`,
    );
  }

  if (failed) {
    console.error('\n폰트 서브셋이 현재 문구를 담지 못합니다. npm run fonts 로 다시 만드세요.');
    process.exit(1);
  }

}
