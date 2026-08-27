/**
 * 글 주소가 사이트맵에서 조용히 빠지지 않는지 봅니다.
 *
 * ── 무엇을 막는가 ───────────────────────────────────────────
 * `astro.config.ts` 의 사이트맵 filter 는 **부분 문자열** 검사입니다.
 * `/ko/cart` 도 `/en/cart` 도 한 줄로 걸러야 하니 그게 맞습니다.
 * 그런데 그 느슨함이 글 주소까지 삼킵니다 —
 *
 *   src/content/posts/ko/checkout-tips.md
 *     → /ko/support/posts/checkout-tips/
 *     → '/checkout' 을 포함 → 사이트맵에서 제외
 *
 * 검색에 안 잡히는데 빌드는 통과하고 화면도 멀쩡합니다. 아무도 모릅니다.
 * `public/robots.txt` 의 `Disallow` 규칙(`slash-star-slash-checkout` 형태)도 같은 것을 막으므로
 * 관문이 두 겹이고, 둘 다 조용합니다.
 *
 * ── 왜 콘텐츠 컬렉션 스키마가 아닌가 ────────────────────────
 * Astro 의 collection schema 는 **프론트매터만** 받습니다.
 * slug 는 프론트매터가 아니라 파일 경로(`entry.id`)에서 나오고,
 * 스키마 함수에 넘어오는 것은 `{ image }` 뿐입니다.
 * 그래서 zod 로는 볼 수 없고, 별도 검사가 필요합니다.
 *
 * ── 언제 도는가 ─────────────────────────────────────────────
 * `prebuild` 의 `check:i18n` 과 `check:fonts` 사이. 파일을 직접 읽으므로
 * `astro sync` 보다 앞이어도 됩니다.
 */
import { readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSlug } from '../src/config/reserved-paths.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POSTS = resolve(root, 'src/content/posts');

/** 이 저장소가 지원하는 언어. `src/config/site.ts` 와 같아야 합니다. */
const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'];

const problems = [];

if (!existsSync(POSTS)) {
  // 글이 하나도 없는 상태는 정상입니다. 검사할 것이 없을 뿐입니다.
  console.log('글이 없습니다 — 검사를 건너뜁니다.');
  process.exit(0);
}

for (const entry of readdirSync(POSTS)) {
  const localeDir = resolve(POSTS, entry);
  if (!statSync(localeDir).isDirectory()) continue;

  // 로케일 디렉터리 이름이 오타면 여기서 잡습니다.
  // 그냥 두면 /kr/support/posts/... 가 조용히 생성되어 사이트맵에 실립니다
  // (dict() 가 알 수 없는 언어를 기본 언어로 넘겨서 죽지 않습니다).
  if (!LOCALES.includes(entry)) {
    problems.push(`src/content/posts/${entry}/ — 알 수 없는 언어입니다. ${LOCALES.join(' · ')} 중 하나여야 합니다.`);
    continue;
  }

  for (const file of readdirSync(localeDir)) {
    const full = resolve(localeDir, file);

    // 중첩 디렉터리는 [slug].astro 가 담지 못합니다(비-rest 파라미터라
    // 슬래시를 못 받습니다). 평면 구조만 허용합니다.
    if (statSync(full).isDirectory()) {
      problems.push(`src/content/posts/${entry}/${file}/ — 글은 평면 구조여야 합니다. 하위 폴더를 두지 마세요.`);
      continue;
    }
    if (!file.endsWith('.md')) continue;

    const slug = file.slice(0, -3);

    // 대문자·공백이 든 파일명은 주소와 파일명이 어긋납니다.
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      problems.push(`src/content/posts/${entry}/${file} — 파일 이름은 소문자·숫자·하이픈만 쓰세요. 주소가 파일 이름 그대로 나갑니다.`);
      continue;
    }

    const blocked = checkSlug(slug);
    if (blocked) {
      problems.push(
        `src/content/posts/${entry}/${file} — '${blocked}' 로 시작하는 주소는 사이트맵에서 제외됩니다.\n` +
          `    /${entry}/support/posts/${slug}/ 가 '/${blocked}' 를 포함해 검색에 노출되지 않습니다.\n` +
          `    다른 이름을 쓰세요 (예: ${slug.replace(new RegExp(`^${blocked}`), 'guide')}).`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error('\n글 주소에 문제가 있습니다.\n');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error('');
  process.exit(1);
}

console.log('✓ 글 주소 검사 통과');
