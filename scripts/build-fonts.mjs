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
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ROOT = resolve(root, 'public/fonts');
const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'];

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

function charsFor(locale) {
  const data = JSON.parse(readFileSync(resolve(root, `src/i18n/${locale}.json`), 'utf8'));

  const bodyStrings = [];
  walkStrings(data, bodyStrings);
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
  execFileSync(
    PY,
    [
      '-m', 'fontTools.subset', sourceFile,
      `--text=${[...chars].sort().join('')}`,
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

const checkOnly = process.argv.includes('--check');
let failed = false;

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
      let have;
      try {
        have = glyphsIn(file);
      } catch {
        console.log(`${locale}: fontTools 가 없어 글자 검사 생략 (파일은 존재)`);
        continue;
      }
      // 원본 서체에 애초에 없는 문자(태국어를 라틴 서체로 찾는 등)는 폴백이 정상입니다.
      const missing = [...need[kind]].filter((ch) => !have.has(ch) && /[ -ɏ가-힣]/.test(ch));
      if (missing.length) {
        console.error(`${locale}/${kind}: 서브셋에 없는 글자 ${missing.length}자 → ${missing.join('')}`);
        failed = true;
        ok = false;
      }
    }
    if (ok) console.log(`✓ ${locale} — body ${need.body.size}자 / display ${need.display.size}자 모두 포함`);
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
