/**
 * 고정 경로가 필요한 이미지를 원본에서 만들어 public/ 에 둡니다.
 *
 * 본문 이미지는 Astro 가 해시 붙은 파일명으로 최적화합니다. 그런데 두 곳은
 * 빌드 전에 경로를 알아야 해서 해시가 붙으면 곤란합니다.
 *   - OG 메타태그: 절대 URL 이 필요 (1200×630)
 *   - 장바구니 썸네일: 브라우저 JS 가 그리므로 고정 경로가 필요 (240×320)
 *
 * ── 왜 언어마다 다른 그림인가 ────────────────────────────────
 * 전에는 5개 언어가 `og/home.jpg` 한 장을 함께 썼습니다. 그런데 그 그림에는
 * **글자가 하나도 없었습니다.** 카카오톡이나 왓츠앱에 주소를 붙이면 노을 앞을
 * 달리는 실루엣만 뜨고, 이게 무엇에 관한 링크인지 알 수 없었습니다.
 *
 * 그래서 언어마다 그 언어의 약속 문구를 얹습니다. 문구는 새로 짓지 않고
 * 화면에 이미 있는 `home.hero.promise` 를 그대로 씁니다 — 두 곳이 다른 말을
 * 하면 어느 쪽을 믿어야 할지 알 수 없습니다.
 *
 * ── 왜 서브셋을 커밋하는가 ──────────────────────────────────
 * 글자를 그리려면 폰트 파일이 필요한데 원본이 있는 `.fontsrc/` 는 저장소에
 * 없습니다(gitignore). CI 는 그 폴더 없이 `npm run build` 를 돌리므로, 원본에
 * 기대면 CI 에서만 글자가 깨집니다.
 *
 * 그래서 **필요한 글자만 담은 TTF 를 만들어 저장소에 둡니다.** 서브셋 woff2 를
 * 커밋해 두고 `--check` 로 검사하는 `build-fonts.mjs` 와 같은 방식입니다.
 *   원본이 있는 곳(로컬)  → 서브셋을 다시 만들고 그림도 다시 만듭니다
 *   원본이 없는 곳(CI)    → 커밋된 서브셋으로 그림만 만듭니다
 *   `--check`             → 커밋된 서브셋이 지금 문구를 다 담는지 봅니다
 *
 * 문구를 고치고 `npm run og` 를 잊으면 `--check` 가 빌드를 멈춥니다.
 *
 * ── 왜 그림은 커밋하지 않는가 ───────────────────────────────
 * 서브셋과 반대입니다. 서브셋은 CI 가 **만들 수 없어서** 커밋하고, 그림은
 * CI 가 만들 수 있고 실제로 배포 전에 매번 만듭니다.
 *
 * 한동안 그림도 함께 커밋돼 있었는데, 그러면 저장소의 그림이 **배포되는
 * 그림이 아니게 됩니다.** sharp·Pango 판본이 로컬과 CI 에서 조금 달라 같은
 * 문구로도 바이트가 갈리고(한국어 27,873 vs 28,321), 아무도 보지 않는 사본이
 * 커밋마다 딸려 옵니다. 무엇이 진짜인지 헷갈릴 이유를 남기지 않습니다.
 */
import sharp from 'sharp';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'src/assets/images');
const OUT = resolve(root, 'public/og');
const OG_FONTS = resolve(root, 'scripts/og-fonts');
const FONTSRC = resolve(root, '.fontsrc');

const checkOnly = process.argv.includes('--check');

const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'];

/**
 * 그림 크기.
 *
 * 1200×630 은 OG 표준(1.91:1)입니다. 카카오톡은 2:1 을 선호해 위아래를 조금
 * 잘라내는데, 1200×630 에서 2:1 로 잘리면 위아래 15px 씩입니다. 글자를 그보다
 * 훨씬 안쪽에 두면 한 장으로 둘 다 됩니다 — 그림을 두 벌로 나누면 어느 쪽이
 * `og:image` 인지 크롤러마다 달리 고르는 문제가 생깁니다.
 */
const W = 1200;
const H = 630;
const MARGIN = 72;

/**
 * 어느 폰트로 그리는가.
 *
 * 워드마크는 다섯 언어 모두 라틴 문자라 한 벌이면 됩니다. 약속 문구는
 * 문자 체계가 갈립니다 — 실제 커버리지를 재서 고른 결과입니다.
 *
 *   ko  IBM Plex Sans KR    (Space Grotesk 에 한글 없음)
 *   zh  Noto Sans SC        (다른 셋에 간체 없음)
 *   th  IBM Plex Sans Thai  (다른 셋에 태국 문자 없음)
 *   vi  Space Grotesk       (성조 부호까지 있음)
 *
 * Pango 는 글 한 덩어리에 폰트를 하나만 씁니다. 그래서 워드마크와 문구를
 * 따로 그려 얹습니다.
 */
const WORDMARK_FONT = { file: 'wordmark.ttf', from: 'SpaceGrotesk[wght].ttf', instance: 'wght=500' };

const PROMISE_FONTS = {
  ko: { file: 'promise-ko.ttf', from: 'IBMPlexSansKR-Regular.ttf' },
  en: { file: 'promise-latin.ttf', from: 'SpaceGrotesk[wght].ttf', instance: 'wght=400' },
  vi: { file: 'promise-latin.ttf', from: 'SpaceGrotesk[wght].ttf', instance: 'wght=400' },
  zh: { file: 'promise-zh.ttf', from: 'NotoSansSC[wght].ttf', instance: 'wght=400' },
  th: { file: 'promise-th.ttf', from: 'IBMPlexSansThai-Regular.ttf' },
};

/** 어떤 사진 위에 어떤 문구를 얹는가. */
const SHEETS = [
  { name: 'home', image: 'hero-runner-sunrise.jpg', line: (t) => t.home.hero.promise },
  { name: 'product', image: 'product-daily-sunscreen.jpg', line: (t) => t.product.hero.headline },
];

const WORDMARK = 'PAROS';

// ── 문구 모으기 ──────────────────────────────────────────────

function dict(locale) {
  return JSON.parse(readFileSync(resolve(root, `src/i18n/${locale}.json`), 'utf8'));
}

/** 각 폰트 파일이 담아야 할 글자. */
function charsetsFor() {
  const sets = new Map(); // 파일이름 → Set<char>
  const add = (file, text) => {
    if (!sets.has(file)) sets.set(file, new Set());
    for (const ch of text) if (ch !== '\n') sets.get(file).add(ch);
  };

  add(WORDMARK_FONT.file, WORDMARK);

  for (const locale of LOCALES) {
    const t = dict(locale);
    for (const sheet of SHEETS) add(PROMISE_FONTS[locale].file, sheet.line(t));
  }
  return sets;
}

// ── 서브셋 ───────────────────────────────────────────────────

const VENV_PY = resolve(FONTSRC, 'venv/bin/python');
const PY = process.env.AVORA_FONT_PY || (existsSync(VENV_PY) ? VENV_PY : 'python3');

let seq = 0;

/**
 * 폰트가 스스로 적어 둔 수정 시각을 Unix 초로 읽습니다.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────
 * `fontTools.varLib.instancer` 는 결과물의 `head.modified` 에 **지금 시각** 을
 * 찍습니다. 그래서 문구를 한 글자도 안 바꾸고 `npm run og` 를 돌려도 가변
 * 폰트에서 나온 셋(wordmark · promise-latin · promise-zh)이 매번 6바이트씩
 * 달라지고, 커밋할 때마다 관계없는 변경이 섞입니다.
 *
 * ── 왜 0 이 아니라 원본의 날짜인가 ─────────────────────────
 * `fontTools.subset` 은 이 값을 **건드리지 않고 원본 것을 그대로 넘깁니다.**
 * 그래서 정적 폰트에서 나온 둘(promise-ko · promise-th)은 원래부터 안 흔들렸고,
 * 그 값은 "이 서브셋을 잘라낸 폰트의 날짜" 입니다.
 *
 * instancer 에도 같은 값을 주면 다섯 파일이 **같은 규칙** 을 따르게 됩니다.
 * `SOURCE_DATE_EPOCH=0` 으로 못 박아도 흔들림은 멈추지만, 그러면 가변 폰트만
 * 1970년이라고 적힌 채 다른 규칙으로 남습니다.
 *
 * LONGDATETIME 은 1904-01-01 기준 초이고, Unix 기준과 2,082,844,800초 차이입니다.
 */
const MAC_TO_UNIX_EPOCH = 2082844800n;

function fontModifiedEpoch(file) {
  const b = readFileSync(file);
  const numTables = b.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    if (b.toString('latin1', p, p + 4) !== 'head') continue;
    // head 안에서 modified 는 28바이트째 8바이트입니다.
    const unix = b.readBigUInt64BE(b.readUInt32BE(p + 8) + 28) - MAC_TO_UNIX_EPOCH;
    // 1970년 이전이라고 적힌 폰트가 있으면 fontTools 가 음수를 못 받습니다.
    return unix > 0n ? unix : 0n;
  }
  return 0n;
}


function subsetTtf(source, outFile, chars, instance) {
  const tmpFiles = [];
  // 글자 목록을 파일로 넘깁니다 — build-fonts.mjs 와 같은 이유(인자 길이 한도).
  const listFile = join(tmpdir(), `avora-og-${process.pid}-${seq++}.txt`);
  writeFileSync(listFile, [...chars].sort().join(''), 'utf8');
  tmpFiles.push(listFile);

  try {
    /*
     * 가변 폰트는 **굵기를 먼저 고정** 합니다.
     *
     * 축이 남아 있으면 Pango 가 기본 인스턴스를 고르는데, 그 기본이 렌더러와
     * fontconfig 설정에 따라 달라집니다. 로컬과 CI 의 그림이 미묘하게 어긋날
     * 이유를 남기지 않습니다. `fontTools.subset` 에는 이 기능이 없어 별도
     * 단계입니다(`--instancer` 는 존재하지 않는 옵션입니다).
     */
    let input = source;
    if (instance) {
      const instanced = join(tmpdir(), `avora-og-inst-${process.pid}-${seq++}.ttf`);
      execFileSync(PY, ['-m', 'fontTools.varLib.instancer', source, instance, '-o', instanced], {
        stdio: ['ignore', 'ignore', 'inherit'],
        // 결과물의 날짜를 원본 폰트의 날짜로 못 박습니다 — fontModifiedEpoch 참조.
        env: { ...process.env, SOURCE_DATE_EPOCH: String(fontModifiedEpoch(source)) },
      });
      tmpFiles.push(instanced);
      input = instanced;
    }

    execFileSync(
      PY,
      [
        '-m', 'fontTools.subset', input,
        `--text-file=${listFile}`,
        `--output-file=${outFile}`,
        // woff2 가 아니라 TTF 입니다. Pango 는 woff2 를 열지 못합니다.
        '--layout-features=kern,liga,calt,ccmp,mark,mkmk,locl,rlig',
        '--no-hinting',
        '--desubroutinize',
        '--name-IDs=1,2,3,4,6',
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
  } finally {
    for (const f of tmpFiles) rmSync(f, { force: true });
  }
  return statSync(outFile).size;
}

function buildSubsets() {
  mkdirSync(OG_FONTS, { recursive: true });
  const sets = charsetsFor();
  const specs = [WORDMARK_FONT, ...Object.values(PROMISE_FONTS)];
  const seen = new Set();

  for (const spec of specs) {
    if (seen.has(spec.file)) continue;
    seen.add(spec.file);
    const source = resolve(FONTSRC, spec.from);
    if (!existsSync(source)) throw new Error(`원본 폰트가 없습니다: ${source}`);
    const size = subsetTtf(source, resolve(OG_FONTS, spec.file), sets.get(spec.file), spec.instance);
    console.log(`og 폰트 → ${spec.file} (${sets.get(spec.file).size}자 / ${Math.round(size / 1024)}KB)`);
  }
}

/** 커밋된 서브셋이 지금 문구를 전부 담는지. */
function checkSubsets() {
  const sets = charsetsFor();
  const problems = [];

  for (const [file, chars] of sets) {
    const path = resolve(OG_FONTS, file);
    if (!existsSync(path)) {
      problems.push(`${file} 이 없습니다 — npm run og 를 돌리세요`);
      continue;
    }
    const covered = cmapOf(path);
    const missing = [...chars].filter((ch) => !covered.has(ch.codePointAt(0)));
    if (missing.length) {
      problems.push(`${file} 에 ${missing.length}자가 없습니다: ${missing.join('')}`);
    }
  }
  return problems;
}

/**
 * TTF 의 cmap 을 직접 읽습니다.
 *
 * fontTools 를 부르지 않는 이유: `--check` 는 CI 에서도 돌아야 하는데 CI 에는
 * `.fontsrc/venv` 가 없습니다. 검사가 자기 근거를 남의 도구에 맡기면, 그 도구가
 * 없을 때 조용히 통과합니다.
 *
 * format 4 와 12 만 읽습니다 — 서브셋이 만들어 내는 것이 이 둘입니다.
 */
function cmapOf(file) {
  const b = readFileSync(file);
  const numTables = b.readUInt16BE(4);
  let cmapOff = 0;
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    if (b.toString('latin1', p, p + 4) === 'cmap') cmapOff = b.readUInt32BE(p + 8);
  }
  if (!cmapOff) return new Set();

  const out = new Set();
  const n = b.readUInt16BE(cmapOff + 2);
  for (let i = 0; i < n; i++) {
    const rec = cmapOff + 4 + i * 8;
    const sub = cmapOff + b.readUInt32BE(rec + 4);
    const format = b.readUInt16BE(sub);

    if (format === 4) {
      const segX2 = b.readUInt16BE(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = b.readUInt16BE(ends + s * 2);
        const start = b.readUInt16BE(starts + s * 2);
        if (start === 0xffff) continue;
        for (let c = start; c <= end; c++) out.add(c);
      }
    } else if (format === 12) {
      const groups = b.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g++) {
        const p = sub + 16 + g * 12;
        const start = b.readUInt32BE(p);
        const end = b.readUInt32BE(p + 4);
        for (let c = start; c <= end; c++) out.add(c);
      }
    }
  }
  return out;
}

// ── 그림 ─────────────────────────────────────────────────────

/**
 * 아래에서 위로 어두워지는 장막.
 *
 * 원시 픽셀로 만듭니다. SVG 그라디언트로도 되지만, 렌더러(librsvg)가 있는지
 * 없는지에 그림이 달라질 이유를 하나라도 줄입니다. 히어로의 장막과 같은
 * 성격입니다 — 사진 위 글자가 어떤 사진이 와도 읽히게 합니다.
 */
const VEIL_RGB = [0x1a, 0x1f, 0x24];
const TEXT_RGB = [0xf6, 0xf7, 0xf8];

const srgbToLin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * 글자가 앉는 띠의 평균색을 잽니다.
 *
 * 아래 45% 만 봅니다 — 워드마크와 문구가 놓이는 자리입니다.
 */
async function bandColor(image) {
  const top = Math.round(H * 0.55);
  const { data, info } = await sharp(await image.png().toBuffer())
    .extract({ left: 0, top, width: W, height: H - top })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  /*
   * 평균이 아니라 **가장 밝은 쪽** 을 봅니다.
   *
   * 처음에는 1×1 로 줄여 평균색을 썼습니다. 그런데 밝은 사진에서 글자가 여전히
   * 안 읽혔습니다 — 평균이 3.4:1 을 4.5:1 로 착각하게 만듭니다. 글자는 띠
   * **전체** 위에 놓이므로, 그 안에서 가장 밝은 자리가 기준이어야 합니다.
   *
   * 상위 5% 지점을 씁니다. 최댓값을 그대로 쓰면 사진 속 반사광 한 점 때문에
   * 온 화면이 새까매집니다.
   */
  const lums = [];
  for (let i = 0; i < data.length; i += info.channels * 37) {
    lums.push(luminance([data[i], data[i + 1], data[i + 2]]));
  }
  lums.sort((a, b) => a - b);
  const bright = lums[Math.floor(lums.length * 0.95)];

  // 밝기만 알면 되므로 회색으로 돌려줍니다 — 장막은 색이 아니라 밝기를 누릅니다.
  const c = Math.round(255 * (bright <= 0.0031308 ? bright * 12.92 : 1.055 * bright ** (1 / 2.4) - 0.055));
  return [c, c, c];
}

/**
 * 아래에서 위로 어두워지는 장막.
 *
 * ── 왜 세기를 사진마다 다시 재는가 ──────────────────────────
 * 처음에는 고정값이었습니다. 노을 사진에서는 잘 맞았는데 **밝은 제품 사진에서
 * 흰 글자가 읽히지 않았습니다** — 장막이 옅은 회색 배경을 조금 누르는 데
 * 그쳤습니다.
 *
 * 사진은 앞으로 실촬영으로 교체됩니다. 그때 어떤 밝기가 올지 모르므로, 값을
 * 다시 손보게 만들지 않고 **글자가 읽히는 데 필요한 만큼만** 덮도록 잽니다.
 * 4.5:1 을 넘기는 가장 옅은 값을 고르므로 사진이 어두우면 거의 덮지 않습니다.
 *
 * 위 절반은 건드리지 않습니다. 사진을 어둡게 만드는 것이 목적이 아니라
 * 글자가 앉는 자리만 눌러 주는 것이 목적입니다 — 전체에 깔았더니 노을과
 * 하늘의 색이 통째로 탁해졌습니다.
 */
async function veilFor(image) {
  const base = await bandColor(image);

  // 4.5:1 을 넘기는 가장 옅은 알파를 찾습니다.
  let peak = 0;
  for (let a = 0; a <= 100; a++) {
    const mixed = base.map((c, i) => c * (1 - a / 100) + VEIL_RGB[i] * (a / 100));
    if (contrast(TEXT_RGB, mixed) >= 4.5) { peak = a / 100; break; }
    peak = a / 100;
  }
  // 가장자리에서 장막이 옅어지므로 조금 더 덮습니다.
  peak = Math.min(0.94, peak + 0.06);

  /*
   * 짙어지기 시작하는 곳과 **다 짙어지는 곳** 을 따로 둡니다.
   *
   * 처음에는 맨 아래에서 peak 에 닿는 그라디언트였습니다. 그런데 글자는 맨
   * 아래가 아니라 그보다 위에 앉습니다 — 그 지점의 실제 알파는 계산한 값의
   * 3분의 1도 되지 않아, 4.5:1 을 맞췄다고 생각한 자리가 3.5:1 이었습니다.
   *
   * 글자 띠가 시작하기 전에 다 짙어지고, 거기서부터는 그대로 둡니다.
   */
  const START = 0.40;
  const HOLD = 0.62;
  const px = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const t = Math.min(1, Math.max(0, (y / (H - 1) - START) / (HOLD - START)));
    const a = Math.round(255 * peak * t ** 1.4);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      px[i] = VEIL_RGB[0];
      px[i + 1] = VEIL_RGB[1];
      px[i + 2] = VEIL_RGB[2];
      px[i + 3] = a;
    }
  }
  return { png: await sharp(px, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer(), peak };
}

/** 글자 한 덩어리를 투명 배경 그림으로. */
function textLayer({ text, fontfile, dpi, width, spacing }) {
  return sharp({
    text: {
      text,
      fontfile,
      rgba: true,
      dpi,
      ...(width ? { width } : {}),
      ...(spacing ? { spacing } : {}),
    },
  })
    .png()
    .toBuffer();
}

async function sheetFor(locale, sheet, veilPng) {
  const t = dict(locale);
  const line = sheet.line(t);

  const base = sharp(resolve(SRC, sheet.image)).resize(W, H, { fit: 'cover', position: 'attention' });

  /*
   * 워드마크는 자간을 벌립니다. 화면의 헤더·푸터가 `letter-spacing: .1em` 이라
   * 같은 인상을 주려면 여기서도 벌려야 합니다. Pango 의 단위는 1/1024 pt 라
   * 값이 커 보이지만 실제로는 약 0.1em 입니다.
   */
  const mark = await textLayer({
    text: `<span letter_spacing="4200" foreground="#F6F7F8">${WORDMARK}</span>`,
    fontfile: resolve(OG_FONTS, WORDMARK_FONT.file),
    dpi: 150,
  });

  const promise = await textLayer({
    text: `<span foreground="#F6F7F8">${escapePango(line)}</span>`,
    fontfile: resolve(OG_FONTS, PROMISE_FONTS[locale].file),
    dpi: 210,
    width: W - MARGIN * 2,
    spacing: 12,
  });

  const markMeta = await sharp(mark).metadata();
  const promiseMeta = await sharp(promise).metadata();

  /*
   * 아래에서 쌓아 올립니다. 문구가 길어져 줄이 늘면 워드마크가 위로 밀릴 뿐,
   * 아래 여백은 그대로입니다 — 언어마다 줄 수가 달라도 아래가 들쭉날쭉하지
   * 않습니다(태국어·베트남어가 한국어보다 깁니다).
   */
  const promiseTop = H - MARGIN - promiseMeta.height;
  const markTop = promiseTop - markMeta.height - 26;

  return base
    .composite([
      { input: veilPng, top: 0, left: 0 },
      { input: mark, top: markTop, left: MARGIN },
      { input: promise, top: promiseTop, left: MARGIN },
    ])
    .jpeg({ quality: 80, progressive: true, mozjpeg: true });
}

/** Pango 는 마크업을 읽으므로 문구의 `&`·`<` 를 그대로 두면 안 됩니다. */
function escapePango(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── 썸네일 ───────────────────────────────────────────────────

const THUMB_DIR = resolve(root, 'public/product');
const THUMB_TARGETS = [{ from: 'product-daily-sunscreen.jpg', to: 'thumb.jpg' }];

// ── 실행 ─────────────────────────────────────────────────────

if (checkOnly) {
  const problems = checkSubsets();
  if (problems.length) {
    console.error('공유 그림 폰트가 지금 문구를 담지 못합니다:');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`✓ og 폰트 — 5개 언어 문구가 서브셋에 모두 있습니다`);
} else {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(THUMB_DIR, { recursive: true });

  // 원본이 있으면 서브셋부터 다시 만듭니다. 없으면 커밋된 것을 씁니다.
  if (existsSync(FONTSRC)) {
    buildSubsets();
  } else {
    const problems = checkSubsets();
    if (problems.length) {
      console.error('원본 폰트(.fontsrc)도 없고 커밋된 서브셋도 부족합니다:');
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }
  }

  for (const sheet of SHEETS) {
    // 장막 세기는 사진 한 장당 한 번만 잽니다 — 다섯 언어가 같은 사진을 씁니다.
    const photo = sharp(resolve(SRC, sheet.image)).resize(W, H, { fit: 'cover', position: 'attention' });
    const { png: veilPng, peak } = await veilFor(photo);
    console.log(`장막 ${sheet.name} — ${Math.round(peak * 100)}%`);

    for (const locale of LOCALES) {
      const to = `${sheet.name}.${locale}.jpg`;
      const info = await (await sheetFor(locale, sheet, veilPng)).toFile(resolve(OUT, to));
      console.log(`og → public/og/${to} (${Math.round(info.size / 1024)}KB)`);
    }
  }

  for (const { from, to } of THUMB_TARGETS) {
    const info = await sharp(resolve(SRC, from))
      .resize(240, 320, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 74, progressive: true, mozjpeg: true })
      .toFile(resolve(THUMB_DIR, to));
    console.log(`thumb → public/product/${to} (${Math.round(info.size / 1024)}KB)`);
  }
}
