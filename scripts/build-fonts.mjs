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
 *   mkdir -p .fontsrc && base=https://raw.githubusercontent.com/google/fonts/main/ofl
 *   curl -L -o '.fontsrc/SpaceGrotesk[wght].ttf'      "$base/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf"
 *   curl -L -o  .fontsrc/IBMPlexSansKR-Regular.ttf    "$base/ibmplexsanskr/IBMPlexSansKR-Regular.ttf"
 *   curl -L -o  .fontsrc/IBMPlexSansThai-Regular.ttf  "$base/ibmplexsansthai/IBMPlexSansThai-Regular.ttf"
 *   curl -L -o  .fontsrc/IBMPlexSansThai-SemiBold.ttf "$base/ibmplexsansthai/IBMPlexSansThai-SemiBold.ttf"
 *   curl -L -o  .fontsrc/IBMPlexMono-Regular.ttf      "$base/ibmplexmono/IBMPlexMono-Regular.ttf"
 *   curl -L -o  .fontsrc/IBMPlexMono-Medium.ttf       "$base/ibmplexmono/IBMPlexMono-Medium.ttf"
 *   curl -L -o '.fontsrc/NotoSansSC[wght].ttf'        "$base/notosanssc/NotoSansSC%5Bwght%5D.ttf"
 *
 *   ⚠️ main 브랜치라 시점에 따라 파일이 다를 수 있습니다. 커버리지 파일의
 *      머리글에 원본의 SHA-256 을 적어 두므로, 다른 파일을 받으면
 *      `npm run fonts` 후 그 줄이 바뀌어 diff 에 드러납니다.
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
  realpathSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ROOT = resolve(root, 'public/fonts');
const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'];

/** body 서브셋이 이보다 커지면 경고합니다. 지금(95KB)의 약 두 배. */
const BODY_WARN_KB = 200;

/**
 * 실을 서체들.
 *
 * ── 왜 한 벌이 아니라 여러 벌인가 ────────────────────────────
 * 한글·한자·태국어·베트남어를 **모두** 담은 기하학적 산세리프는 없습니다.
 * 그래서 문자마다 짝을 맞춥니다. 다행히 히어로(`For every movement.` /
 * `MOVE. SWEAT. REAPPLY.`)는 5개 언어 어디서나 라틴이라, 브랜드 첫인상을
 * 만드는 자리는 한 서체가 책임집니다.
 *
 * ── 왜 제목의 문자별 짝은 굵기가 하나인가 ────────────────────
 * 제목 자리에서 300 을 넘는 곳은 `.hero__bold`(600)와 `.nav__wordmark`(500)
 * 둘뿐이고, 그 둘은 **항상 라틴**입니다. 한글·태국어·한자가 들어가는 자리는
 * 전부 300~400 이라 Regular 하나로 충분합니다 — 가짜 굵게가 생길 일이 없습니다.
 *
 * ── unicode-range 가 없는 이유 ───────────────────────────────
 * 같은 family 안의 페이스들이 **서로 겹치지 않는 글자**만 담습니다. 브라우저는
 * 글자마다 family 안에서 그 글자를 가진 페이스를 찾으므로, 범위를 적지 않아도
 * 한글은 한글 페이스로, 라틴은 라틴 페이스로 갑니다.
 */
const FACES = {
  body: {
    file: resolve(root, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'),
    family: 'AVORA Body',
    weight: '100 900',
    variations: true,
    out: 'body.woff2',
    chars: 'body',
    locales: LOCALES,
  },
  /*
   * 본문의 문자별 짝.
   *
   * Pretendard 에는 **한자가 0자, 태국 문자가 1자** 있습니다. 그래서 태국어
   * 본문 133자 중 60자(45%)가 여태 기기 기본 서체로 그려지고 있었습니다.
   * 검사는 "모두 포함" 이라고 했습니다 — 원본에 없는 글자는 요구 목록에서
   * 빼기 때문입니다. 제목에서 드러난 것과 같은 사각지대입니다.
   */
  'body-th': {
    file: resolve(root, '.fontsrc/IBMPlexSansThai-Regular.ttf'),
    family: 'AVORA Body',
    weight: '100 500',
    out: 'body-th.woff2',
    chars: 'body',
    locales: ['th'],
  },
  'body-th-bold': {
    file: resolve(root, '.fontsrc/IBMPlexSansThai-SemiBold.ttf'),
    family: 'AVORA Body',
    weight: '600 900',
    out: 'body-th-bold.woff2',
    chars: 'body',
    locales: ['th'],
  },
  /*
   * 중국어 **본문** 은 일부러 싣지 않습니다.
   *
   * 본문 720자를 Noto Sans SC 로 서브셋하면 186KB 입니다. 중국어 페이지
   * 전부가 받아야 하는 양이고, 이 사이트는 모바일이 우선입니다. 반면 얻는
   * 것은 크지 않습니다 — 중국어를 읽는 기기에는 대개 좋은 본문 서체가
   * 이미 있습니다(PingFang SC / 微软雅黑 / Source Han).
   *
   * 그래서 **제목만** 브랜드 서체로 두고(`display-sc`, 27KB) 본문은 기기에
   * 맡깁니다. `src/styles/tokens.css` 의 `--font-body` 에 그 이름들을 적어 두어
   * 폴백이 우연이 아니라 고른 결과가 되게 했습니다.
   *
   * 바꾸려면 여기에 face 를 되살리고 `src/config/fonts.ts` 의 preload 와
   * `tests/e2e/fonts-coverage.spec.ts` 의 BY_DESIGN 을 함께 보세요.
   */
  display: {
    file: resolve(root, '.fontsrc/SpaceGrotesk[wght].ttf'),
    family: 'AVORA Display',
    weight: '300 700',
    variations: true,
    out: 'display.woff2',
    chars: 'display',
    locales: LOCALES,
  },
  'display-kr': {
    file: resolve(root, '.fontsrc/IBMPlexSansKR-Regular.ttf'),
    family: 'AVORA Display',
    weight: '300 400',
    out: 'display-kr.woff2',
    chars: 'display',
    locales: ['ko'],
  },
  'display-th': {
    file: resolve(root, '.fontsrc/IBMPlexSansThai-Regular.ttf'),
    family: 'AVORA Display',
    weight: '300 400',
    out: 'display-th.woff2',
    chars: 'display',
    locales: ['th'],
  },
  'display-sc': {
    file: resolve(root, '.fontsrc/NotoSansSC[wght].ttf'),
    family: 'AVORA Display',
    weight: '300 400',
    variations: true,
    out: 'display-sc.woff2',
    chars: 'display',
    locales: ['zh'],
  },
  mono: {
    file: resolve(root, '.fontsrc/IBMPlexMono-Regular.ttf'),
    family: 'AVORA Mono',
    weight: '400',
    out: 'mono.woff2',
    chars: 'mono',
    locales: LOCALES,
  },
  'mono-medium': {
    file: resolve(root, '.fontsrc/IBMPlexMono-Medium.ttf'),
    family: 'AVORA Mono',
    weight: '500',
    out: 'mono-medium.woff2',
    chars: 'mono',
    locales: LOCALES,
  },
};

/** 이 언어가 싣는 페이스. 순서가 곧 fonts.css 의 순서입니다. */
export function facesFor(locale) {
  return Object.entries(FACES)
    .filter(([, f]) => f.locales.includes(locale))
    .map(([id]) => id);
}

const cp = (ch) => ch.codePointAt(0);
const isHangul = (ch) => {
  const c = cp(ch);
  return (c >= 0xac00 && c <= 0xd7a3) || (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3130 && c <= 0x318f);
};
const isThai = (ch) => cp(ch) >= 0x0e00 && cp(ch) <= 0x0e7f;
/** 한자와 **중국어 문장부호**. `，` `。` 를 빠뜨리면 문장 끝이 시스템 서체로 튑니다. */
const isHan = (ch) => {
  const c = cp(ch);
  return (
    (c >= 0x4e00 && c <= 0x9fff) ||
    (c >= 0x3400 && c <= 0x4dbf) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0x3000 && c <= 0x303f) ||
    (c >= 0xff00 && c <= 0xffef)
  );
};

/** 문자별 짝이 맡는 글자인가 */
const SCRIPT_OF = {
  'display-kr': isHangul,
  'display-th': isThai,
  'display-sc': isHan,
  'body-th': isThai,
  'body-th-bold': isThai,
};

/**
 * 타이 SARA AM(`ำ`, U+0E33)을 쓰려면 U+0E4D 도 있어야 합니다.
 *
 * 브라우저의 타이 셰이퍼는 `ำ` 를 U+0E4D(nikhahit) + U+0E32(sara aa)로 **분해한 뒤**
 * cmap 에서 찾습니다. 서브셋에 U+0E4D 이 없으면 조합이 실패해 `กันน้ำ` 가
 * `กันน ้ำ` 처럼 부호가 옆으로 떨어져 나옵니다. 문구에는 U+0E4D 이 한 번도
 * 나오지 않으므로 글자를 모으는 것만으로는 절대 들어오지 않습니다.
 */
const THAI_SARA_AM = '\u0E33';
const THAI_NIKHAHIT = '\u0E4D';

/**
 * 이 언어에서 **각 페이스가 담아야 할 글자**.
 *
 * 원본을 읽지 않고 문자 종류만으로 가릅니다. 그래야 생성과 검사가 같은 답을
 * 냅니다 — 검사는 CI 에서 원본 없이 돌기 때문입니다.
 */
export function charsPerFace(locale, need) {
  const src = need ?? charsFor(locale);
  const ids = facesFor(locale);
  const out = new Map(ids.map((id) => [id, new Set()]));

  const bodyScripts = ids.filter((id) => id.startsWith('body-'));
  for (const ch of src.body) {
    const owners = bodyScripts.filter((id) => SCRIPT_OF[id](ch));
    if (owners.length) for (const id of owners) out.get(id).add(ch);
    else out.get('body').add(ch);
  }

  // 라벨용 고정폭은 라틴과 숫자만. 한글은 이 서체에 없고, 토큰이 본문 서체로
  // 넘깁니다 — 지금처럼 기기별 시스템 고정폭으로 흩어지지 않게.
  for (const ch of src.body) {
    if (isHangul(ch) || isThai(ch) || isHan(ch)) continue;
    out.get('mono').add(ch);
    out.get('mono-medium').add(ch);
  }

  const displayScripts = ids.filter((id) => id.startsWith('display-'));
  for (const ch of src.display) {
    const owner = displayScripts.find((id) => SCRIPT_OF[id](ch));
    out.get(owner ?? 'display').add(ch);
  }

  // 타이 셰이퍼가 필요로 하는 글자를 채웁니다. 문구에는 나오지 않습니다.
  for (const [id, chars] of out) {
    if (SCRIPT_OF[id] === isThai && chars.has(THAI_SARA_AM)) chars.add(THAI_NIKHAHIT);
  }

  return out;
}

/**
 * 서브셋을 만들고 읽을 파이썬.
 *
 * `.fontsrc/venv` 가 있으면 그것을 씁니다 — 준비물 명령이 거기에 fontTools 와
 * brotli 를 넣습니다. 없으면 시스템 python3 를 시도합니다(대개 실패하고,
 * 그 실패를 `--check` 가 처리합니다).
 *
 * `AVORA_FONT_PY` 로 덮어쓸 수 있습니다. 테스트가 "도구가 없는 상태" 를
 * 재현할 때 씁니다 — 그게 없으면 테스트가 `.fontsrc/venv` 를 잠깐 옮겨야
 * 하는데, 그 사이에 죽으면 저장소가 깨진 채 남습니다.
 */
const VENV_PY = resolve(root, '.fontsrc/venv/bin/python');
const PY = process.env.AVORA_FONT_PY || (existsSync(VENV_PY) ? VENV_PY : 'python3');

/**
 * 헤드라인(--font-display)이 적용되는 자리.
 * global.css 의 .display / .quote / .hero__* / .journey__word /
 * .principles__term / .footer__tagline 에 대응합니다.
 */
const DISPLAY_PATHS = [
  /*
   * 홈 The Choice 의 헤드라인.
   *
   * `display display--tight` 로 그려지는데 이 목록에 없었습니다. 지금까지
   * 무사했던 것은 옛 문구("만들지 않았습니다. 골랐습니다.")의 글자가 우연히
   * 다른 display 문구에 전부 들어 있었기 때문입니다 — 바로 아래 brand.*
   * 주석이 적어 둔 것과 같은 상태였습니다. 문구가 바뀌면서 드러났습니다.
   */
  'home.choice.lead',
  'home.problem.lead',
  'home.company.lead',
  'home.faq.heading',
  /*
   * `home.panel.lead` 는 Phase J 이전부터 빠져 있던 것입니다. 같은 종류의
   * 결함이고 이 목록을 손보는 김에 함께 닫습니다 — 빠뜨리면 검증단 제목의
   * 일부 글자만 기기 기본 서체로 떨어집니다.
   */
  'home.panel.lead',
  'home.journey.lead',
  'home.product.name',
  // 홈에 남은 것은 브랜드로 보내는 브릿지 한 단락입니다.
  'home.origin.statementBefore',
  'home.origin.statementEmphasis',
  'home.origin.statementAfter',
  /*
   * /brand 의 세 덩어리.
   *
   * 서사를 홈에서 떼어 낼 때 이 목록은 그대로 뒀습니다. 그런데 그때
   * 가리키던 `home.question.quote`·`home.philosophy.quote` 는 어느 화면도
   * 그리지 않는 문구가 됐고, 실제로 그려지는 `brand.*` 는 목록에
   * 없었습니다. 두 벌의 글자가 같아서 우연히 동작하던 상태입니다 —
   * 브랜드 문구를 한 글자라도 고치면 그 글자만 시스템 서체로 떨어집니다.
   */
  'brand.origin.statementBefore',
  'brand.origin.statementEmphasis',
  'brand.origin.statementAfter',
  'brand.question.quote',
  'brand.philosophy.quote',
  /* 브랜드 페이지가 넓어지며 생긴 display 헤드라인 셋. */
  'brand.island.lead',
  'brand.audience.lead',
  'brand.company.lead',
  'product.hero.headline',
  'footer.tagline',
  'legal.privacy.heading',
  // /panel 의 제목 둘. 빠뜨리면 그 화면의 h1 이 글자 단위로 다른 서체로
  // 그려집니다 — 서브셋에 없는 글자만 시스템 서체로 떨어지기 때문입니다.
  'panel.heading',
  'panel.form.heading',
  'panel.rejected.heading',
  'notFound.heading',
];

/** 마크업에 직접 박혀 있어 번역 파일에는 없는 문구 + 기본 문자셋 */
const COMMON = [
  'For every movement.',
  'MOVE. SWEAT. REAPPLY.',
  'Sun Sweat Water Movement Reapply',
  'LIGHT COMFORT PROTECTION RESET',
  'SUN MOVE SWEAT WATER RESET',
  'Daily Sunscreen',
  'PAROS SKIN WATER',
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
 * 글 폴더. `AVORA_POSTS_ROOT` 로 덮어쓸 수 있습니다.
 *
 * 테스트가 "서브셋에 없는 글자가 생기면 정말 실패하는가" 를 확인할 때
 * 씁니다 — 그 성질을 실제로 돌려 보지 않으면, 검사가 통째로 죽어 있어도
 * "도구 없을 때 건너뛴다" 같은 주변 검사만 통과합니다.
 */
export const POSTS_ROOT = process.env.AVORA_POSTS_ROOT
  ? resolve(process.env.AVORA_POSTS_ROOT)
  : resolve(root, 'src/content/posts');

/**
 * 이 언어의 글에 쓰인 글자.
 *
 * 로케일을 디렉터리로 가르기 때문에 그 폴더만 읽으면 됩니다. 프론트매터로만
 * 구분했다면 전 파일을 파싱해야 하고, 구분에 실패하면 영어·베트남어 서브셋에
 * 한글이 통째로 들어갑니다.
 */
export function postStringsFor(locale, postsRoot = POSTS_ROOT) {
  const dir = resolve(postsRoot, locale);
  if (!existsSync(dir)) return [];

  const out = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    let raw;
    try {
      raw = readFileSync(resolve(dir, file), 'utf8');
    } catch (error) {
      // 목록을 읽은 뒤 파일이 사라진 경우만 넘어갑니다. 권한·입출력 오류를
      // 함께 삼키면 그 글의 글자가 통째로 빠지는데 검사도 같은 코드를
      // 지나므로 아무도 모릅니다.
      if (error.code === 'ENOENT') continue;
      throw error;
    }

    /*
     * 프론트매터를 파싱하지 않고 **원문을 통째로** 넣습니다.
     *
     * `parseFrontmatter` 는 한 줄짜리 값만 봅니다. YAML 의 접힌 스칼라
     * (`title: >`)나 리터럴 블록(`summary: |`)을 쓰면 값이 다음 줄로 가고,
     * 그러면 제목 글자가 통째로 빠집니다 — 그리고 생성과 검사가 같은
     * 함수를 쓰므로 `--check` 도 못 잡습니다.
     *
     * 폰트 수집에서 위험한 것은 **과소 집계뿐**입니다. 남는 글자는 서브셋을
     * 몇 바이트 키울 뿐이고, 프론트매터의 키 이름·카테고리·날짜는 전부
     * ASCII 라 그마저 0 에 가깝습니다.
     */
    out.push(raw);
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

let subsetSeq = 0;

function subset(sourceFile, outFile, chars, extraArgs = []) {
  /*
   * 글자 목록을 인자가 아니라 파일로 넘깁니다.
   *
   * `--text=` 는 argv 원소 하나이고 리눅스의 인자 길이 한도는 인자당 128KB 로
   * 고정입니다(ARG_MAX 를 올려도 못 넘깁니다). 한글 한 자가 UTF-8 3바이트라
   * 약 43,000자에서 E2BIG 가 납니다. 지금은 수백 자지만 글이 쌓이면
   * 다가가므로 미리 옮깁니다.
   */
  /*
   * 이름에 순번을 씁니다. 글자 수로 구분하려 했더니 en 이 body 106 자,
   * display 105 자로 한 자 차이였습니다 — 지금은 순차 호출이라 부딪히지
   * 않지만, 이름이 "겹치지 않는다" 를 말해 주지 못합니다.
   */
  const listFile = join(tmpdir(), `avora-subset-${process.pid}-${subsetSeq++}.txt`);
  writeFileSync(listFile, [...chars].sort().join(''), 'utf8');

  try {
    execFileSync(
    PY,
    [
      '-m', 'fontTools.subset', sourceFile,
      `--text-file=${listFile}`,
      '--output-file=' + outFile,
      '--flavor=woff2',
      /*
       * 남길 레이아웃 기능.
       *
       * ⚠️ `mark`·`mkmk`·`ccmp` 를 빼면 **태국어와 베트남어의 부호가 어긋납니다.**
       *    성조·모음 부호가 글자 위 어디에 얹히는지를 이 기능들이 정합니다.
       *
       *    한동안 `kern,liga,calt` 만 남겼는데, 그때 제목 서체에는 태국 문자가
       *    아예 없어(폴백) 아무도 몰랐습니다. 문자별 짝을 붙이면서 드러났습니다.
       *
       * `rvrn` 은 가변 폰트가 굵기에 따라 글자꼴을 바꾸는 데 씁니다.
       */
      '--layout-features=kern,liga,calt,ccmp,mark,mkmk,locl,rlig,rvrn',
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

const css = (locale) =>
  `/* 자동 생성 — scripts/build-fonts.mjs (${locale})
   이 언어 페이지에 실제로 쓰이는 글자만 담은 서브셋입니다.
   문구를 바꾸면 npm run fonts 로 다시 만드세요.

   같은 family 가 여러 번 나오는 것은 의도된 것입니다 — 문자마다 짝이
   다릅니다. 페이스끼리 담은 글자가 겹치지 않아 unicode-range 가 필요 없습니다. */
` +
  facesFor(locale)
    .map((id) => {
      const f = FACES[id];
      const fmt = f.variations ? 'woff2-variations' : 'woff2';
      return `@font-face {
  font-family: '${f.family}';
  src: url('/fonts/${locale}/${f.out}') format('${fmt}');
  font-weight: ${f.weight};
  font-style: normal;
  font-display: swap;
}
`;
    })
    .join('');

/**
 * 원본 서체가 가진 글자의 목록.
 *
 * ── 왜 파일로 두는가 ────────────────────────────────────────
 * display 원본(NotoSerifKR.ttf, 23MB)은 `.gitignore` 라 CI 에 없습니다.
 * 그러면 `sourceGlyphs('display')` 가 null 이 되고 판정이 옛 정규식
 * `/[ -ɏ가-힣]/` 으로 되돌아갑니다. 그 규칙은 중국어 display 글자
 * **209자 중 113자(54%)** 를 아예 보지 않습니다 — 헤드라인 서브셋에서
 * 글자가 절반쯤 빠져도 CI 가 통과한다는 뜻입니다.
 *
 * 23MB 를 커밋하는 대신 **cmap 만 33KB 로 압축해** 커밋합니다.
 * `npm run fonts` 가 갱신하고, `--check` 는 읽기만 하되 원본이 있는 곳에서는
 * 어긋났는지 대조합니다 — 검사가 자기 근거를 고치면 "낡았다" 를 잡을 수
 * 없어집니다.
 *
 * body 원본은 npm 의존성이라 어디에나 있어 이 장치가 필요 없습니다.
 */
const COVERAGE_FILES = Object.fromEntries(
  Object.keys(FACES)
    // body 원본은 npm 의존성이라 어디에나 있어 이 장치가 필요 없습니다.
    .filter((id) => id !== 'body')
    .map((id) => [id, resolve(root, `scripts/${id}-source-coverage.txt`)]),
);

/** 연속 구간으로 접습니다. 23,124자가 4,676구간이 됩니다. */
export function packCoverage(chars, sourceTag = '') {
  if (!chars.size) throw new Error('빈 커버리지는 만들지 않습니다 — 원본을 잘못 읽었습니다.');
  const codes = [...chars].map((c) => c.codePointAt(0)).sort((a, b) => a - b);
  const out = [];
  let start = codes[0];
  let prev = codes[0];
  for (const code of codes.slice(1)) {
    if (code === prev + 1) {
      prev = code;
      continue;
    }
    out.push(start === prev ? start.toString(16) : `${start.toString(16)}-${prev.toString(16)}`);
    start = prev = code;
  }
  out.push(start === prev ? start.toString(16) : `${start.toString(16)}-${prev.toString(16)}`);

  /*
   * 줄을 나눕니다. 33KB 한 줄이면 어떤 변경이든 전체 파일 충돌이고, 두
   * 브랜치가 각각 재생성하면 반드시 부딪힙니다. 충돌 마커가 남거나 잘못
   * 해소되면 그것이 곧 "깨진 커버리지" — 검사가 통째로 눈머는 상태입니다.
   */
  const lines = [];
  for (let i = 0; i < out.length; i += 40) lines.push(out.slice(i, i + 40).join(','));

  /*
   * 첫 줄에 기대 개수를 적습니다.
   *
   * 크기 하한만으로는 **잘린 파일**을 못 잡습니다. 앞부분만 남아도 글자
   * 수가 하한을 넘을 수 있고, 그러면 빠진 글자들이 "원본에 없는 글자" 로
   * 분류되어 조용히 통과합니다. 개수를 대조하면 한 글자만 어긋나도 걸립니다.
   */
  return [`# ${codes.length} chars, ${out.length} ranges${sourceTag ? ` — ${sourceTag}` : ''}`, ...lines].join(
    '\n',
  ) + '\n';
}

export function unpackCoverage(text) {
  /*
   * ⚠️ 실패하면 **소리 내어** 실패해야 합니다.
   *
   * 예전에는 파싱 실패가 빈 Set 으로 돌아왔습니다. 그런데 빈 Set 은
   * truthy 라 "근거 없음" 가드를 지나가고, 판정식의 `source.has(ch)` 가
   * 언제나 false 가 되어 **모든 글자가 "원본에 없으니 폴백이 정상"** 으로
   * 분류됩니다. 5개 언어 display 가 무조건 통과합니다 — 옛 정규식의
   * 54% 실명보다 나쁜 100% 실명입니다.
   *
   * 도달 경로가 가설이 아닙니다. 이 파일은 한 줄짜리 33KB 라 두 브랜치가
   * 각각 재생성하면 반드시 충돌하고, 충돌 마커가 남거나 잘못 해소되면
   * 그대로 이 상태가 됩니다.
   */
  const expected = text.match(/^#\s*(\d+)\s*chars/m);

  // 주석은 **줄 단위**로 걸러야 합니다. 토큰으로 쪼갠 뒤 '#' 로 시작하는
  // 조각만 버리면 머리글의 나머지 낱말(chars, ranges)이 구간으로 섞입니다.
  const parts = text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join(',')
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chars = new Set();
  for (const part of parts) {
    const [a, b] = part.split('-');
    const from = parseInt(a, 16);
    const to = b === undefined ? from : parseInt(b, 16);
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from || to > 0x10ffff) {
      throw new Error(
        `커버리지 파일이 깨졌습니다 — 해석할 수 없는 구간 ${JSON.stringify(part)}.\n` +
          '  npm run fonts 로 다시 만든 뒤 커밋하세요.',
      );
    }
    for (let code = from; code <= to; code++) chars.add(String.fromCodePoint(code));
  }

  /*
   * 첫 줄의 개수와 맞는지 봅니다. 크기 하한만으로는 잘린 파일을 못 잡습니다 —
   * 앞부분만 남아도 하한을 넘을 수 있고, 그러면 빠진 글자가 "원본에 없는
   * 글자" 로 분류되어 조용히 통과합니다.
   */
  if (!expected) {
    throw new Error(
      '커버리지 파일에 개수 머리글이 없습니다 — 오래되었거나 잘렸습니다.\n' +
        '  npm run fonts 로 다시 만든 뒤 커밋하세요.',
    );
  }
  if (chars.size !== Number(expected[1])) {
    throw new Error(
      `커버리지가 ${chars.size}자인데 머리글은 ${expected[1]}자라고 적혀 있습니다 — 잘렸거나 잘못 합쳐졌습니다.\n` +
        '  npm run fonts 로 다시 만든 뒤 커밋하세요.',
    );
  }
  return chars;
}

/**
 * 원본 서체가 가진 글자. kind 마다 한 번만 읽고 재사용합니다.
 *
 * body 원본은 npm 의존성이라 어디에나 있지만, display 원본은 23MB 라
 * 저장소에 두지 않습니다(.gitignore). 그래서 커버리지 파일이 CI 에서
 * 유일한 근거입니다.
 *
 * ⚠️ **검사(`--check`)는 이 파일을 쓰지 않습니다.** 검사가 자기 근거를
 *    갱신하면 "낡았다" 는 상태가 존재할 수 없어져 검증이 무의미해집니다.
 *    생성(`npm run fonts`)에서만 쓰고, 검사는 어긋났는지 **비교만** 합니다.
 */
const sourceGlyphCache = new Map();
function sourceGlyphs(kind, { write = false } = {}) {
  if (sourceGlyphCache.has(kind)) return sourceGlyphCache.get(kind);

  const src = FACES[kind].file;
  const coverageFile = Object.hasOwn(COVERAGE_FILES, kind) ? COVERAGE_FILES[kind] : null;
  let result = null;

  if (existsSync(src)) {
    try {
      result = glyphsIn(src);
    } catch (cause) {
      // 원인을 보존합니다. 위쪽 도구 부재 판정이 이것을 보고
      // "손상된 폰트" 와 "fontTools 없음" 을 가릅니다.
      throw new Error(
        `원본 서체를 읽지 못했습니다: ${src}\n` +
          '  파일이 손상되었거나 fontTools 가 없습니다.\n' +
          `  (${cause?.message ?? cause})`,
        { cause },
      );
    }
    if (coverageFile && write) {
      // 원본의 해시를 함께 적습니다. 다른 파일을 받으면 이 줄이 바뀌어
      // diff 에 드러납니다 — main 브랜치라 시점에 따라 달라질 수 있습니다.
      const digest = createHash('sha256').update(readFileSync(src)).digest('hex').slice(0, 16);
      writeFileSync(coverageFile, packCoverage(result, `sha256:${digest}`), 'utf8');
    }
  } else if (coverageFile && existsSync(coverageFile)) {
    result = unpackCoverage(readFileSync(coverageFile, 'utf8'));
  }

  sourceGlyphCache.set(kind, result);
  return result;
}

/**
 * 커버리지 파일이 원본과 어긋나지 않는지.
 *
 * 원본이 있는 곳(개발자 기계)에서만 볼 수 있습니다. 여기서 잡지 않으면
 * 낡은 파일이 그대로 커밋되어 CI 가 틀린 근거로 판정합니다.
 */
function checkCoverageFresh() {
  for (const [kind, file] of Object.entries(COVERAGE_FILES)) {
    if (!existsSync(FACES[kind].file) || !existsSync(file)) continue;
    const digest = createHash('sha256').update(readFileSync(FACES[kind].file)).digest('hex').slice(0, 16);
    const current = packCoverage(sourceGlyphs(kind), `sha256:${digest}`);
    if (current.trim() !== readFileSync(file, 'utf8').trim()) {
      console.error(`\n${file} 이 원본과 다릅니다.`);
      console.error('  npm run fonts 로 다시 만든 뒤 커밋하세요.\n');
      return false;
    }
  }
  return true;
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
/*
 * Node 는 ESM 을 realpath 로 해석하므로 `import.meta.url` 은 실제 경로,
 * `process.argv[1]` 은 호출된 경로입니다. symlink 로 부르면 두 값이 달라
 * 실행부가 통째로 건너뛰어지고 **exit 0** 이 나옵니다 — 검사 스크립트가
 * "아무것도 안 하고 성공" 하는 것이 최악의 실패 모드라, realpath 로
 * 맞춰 보고 그래도 아니면 소리 내어 멈춥니다.
 */
let isEntrypoint = false;
if (process.argv[1]) {
  try {
    isEntrypoint = import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    isEntrypoint = false;
  }
}

if (!isEntrypoint && basename(process.argv[1] ?? '') === 'build-fonts.mjs') {
  console.error('build-fonts.mjs 가 엔트리포인트로 인식되지 않아 검사가 돌지 않았습니다.');
  console.error(`  import.meta.url = ${import.meta.url}`);
  console.error(`  process.argv[1]  = ${process.argv[1] ?? '(없음)'}`);
  process.exit(1);
}

if (isEntrypoint) {

  /*
 * CI 인가.
 *
 * `CI=false` 나 `CI=0` 은 "CI 동작을 끄겠다" 는 관례로 쓰입니다. 빈 문자열이
 * 아니라는 이유로 참이 되면 그 의도를 정반대로 읽습니다.
 */
const inCI = !!process.env.CI && process.env.CI !== 'false' && process.env.CI !== '0';

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
    // 원본이 없는 것과 도구가 없는 것은 다른 문제입니다. 섞으면
    // "pip install 하세요" 라는 처방이 이미 설치된 환경에 나가 시간을 버립니다.
    if (!existsSync(FACES.body.file)) {
      console.error(`원본 폰트가 없습니다: ${FACES.body.file}`);
      console.error('  npm ci 로 의존성을 다시 설치하세요.');
      process.exit(1);
    }
    try {
      // sourceGlyphs 를 거쳐 캐시를 채웁니다 — 아래 검사에서 다시 파싱하지 않게.
      sourceGlyphs('body');
    } catch (cause) {
      toolsOk = false;
      /*
       * 도구 부재만 여기서 다룹니다. 손상된 폰트·권한 오류·버퍼 초과까지
       * "pip install 하세요" 로 안내하면 이미 설치된 환경에 엉뚱한 처방이
       * 나가고 원인을 찾는 시간이 그대로 날아갑니다.
       */
      // sourceGlyphs 가 감싼 오류일 수 있으므로 원인까지 봅니다.
      const root_ = cause?.cause ?? cause;
      const detail = `${cause?.message ?? cause} ${root_?.message ?? ''}`;
      const missingBrotli = detail.includes('Brotli');
      const missingTools =
        root_?.code === 'ENOENT' ||
        cause?.code === 'ENOENT' ||
        /ModuleNotFoundError|No module named|ENOENT/.test(detail);
      if (!missingBrotli && !missingTools) throw cause;

      const reason = missingBrotli
        ? 'brotli 확장이 없어 woff2 를 열지 못합니다'
        : 'fontTools 를 찾지 못했습니다';

      if (inCI) {
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
    const perFace = charsPerFace(locale, need);

    if (checkOnly) {
      let ok = true;
      for (const kind of facesFor(locale)) {
        const file = resolve(outDir, FACES[kind].out);
        if (!existsSync(file)) {
          console.error(`${locale}/${FACES[kind].out} 가 없습니다 — npm run fonts 를 실행하세요.`);
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

        if (!source && inCI) {
          /*
           * 근거 없이 통과시키지 않습니다.
           *
           * 옛 규칙으로 물러서면 중국어 display 는 209자 중 113자를 아예
           * 안 봅니다. "검사했다" 고 말하면서 절반을 지나치느니 멈춥니다.
           */
          console.error(`\n${locale}/${kind}: 원본 서체 정보가 없어 정확히 검사할 수 없습니다.`);
          console.error(`  ${COVERAGE_FILES[kind] ?? SOURCES[kind]} 가 필요합니다.`);
          console.error('  로컬에서 npm run fonts 를 돌린 뒤 그 파일을 커밋하세요.\n');
          failed = true;
          ok = false;
          continue;
        }

        const want = perFace.get(kind);
        const missing = source
          ? [...want].filter((ch) => source.has(ch) && !have.has(ch))
          : [...want].filter((ch) => !have.has(ch) && /[ -ɏ가-힣]/.test(ch));
        if (missing.length) {
          console.error(`${locale}/${kind}: 서브셋에 없는 글자 ${missing.length}자 → ${missing.join('')}`);
          failed = true;
          ok = false;
        }
      }
      if (ok && !toolsOk) {
        // 검사하지 않았는데 "모두 포함" 이라고 쓰면 다섯 줄의 초록이
        // 위의 "생략" 한 줄을 덮습니다.
        console.log(`- ${locale} — 파일 존재만 확인 (글자 검사 생략)`);
      } else if (ok) {
        const shown = facesFor(locale)
          .map((id) => `${id} ${perFace.get(id).size}자`)
          .join(' / ');
        console.log(`✓ ${locale} — ${shown} 모두 포함`);
      }

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

    for (const id of facesFor(locale)) {
      if (!existsSync(FACES[id].file)) {
        console.error(
          `원본 폰트가 없습니다: ${FACES[id].file}\n파일 상단 주석의 준비물 명령을 참고하세요.`,
        );
        process.exit(1);
      }
    }

    mkdirSync(outDir, { recursive: true });

    // 이 언어에 필요 없는 파일이 남아 있으면 지웁니다. 서체를 갈아입고도 옛
    // 파일이 남으면, 어느 것이 실제로 실리는지 디렉터리만 봐서는 모릅니다.
    const keep = new Set([...facesFor(locale).map((id) => FACES[id].out), 'fonts.css']);
    for (const f of readdirSync(outDir)) {
      if (!keep.has(f)) rmSync(resolve(outDir, f), { force: true });
    }

    const sizes = [];
    for (const id of facesFor(locale)) {
      // 커버리지 파일은 여기서만 씁니다. 검사(--check)가 자기 근거를 갱신하면
      // "낡았다" 는 상태가 존재할 수 없어져 검증이 무의미해집니다.
      if (Object.hasOwn(COVERAGE_FILES, id)) sourceGlyphs(id, { write: true });

      const want = perFace.get(id);
      const size = subset(FACES[id].file, resolve(outDir, FACES[id].out), want);
      sizes.push(`${id} ${String(Math.round(size / 1024)).padStart(3)}KB (${want.size}자)`);
    }
    writeFileSync(resolve(outDir, 'fonts.css'), css(locale), 'utf8');

    console.log(`${locale}  ${sizes.join('  ')}`);
  }

  // 원본이 있는 곳(개발자 기계)에서만 볼 수 있습니다. 여기서 안 잡으면
  // 낡은 커버리지가 그대로 커밋되어 CI 가 틀린 근거로 판정합니다.
  if (checkOnly && toolsOk && !checkCoverageFresh()) failed = true;

  if (failed) {
    console.error('\n폰트 서브셋이 현재 문구를 담지 못합니다. npm run fonts 로 다시 만드세요.');
    process.exit(1);
  }

}
