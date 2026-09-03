/**
 * 글 프론트매터를 **한 가지 방법으로** 읽습니다.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────
 * `getCollection` 을 못 쓰는 자리가 여럿입니다 — `astro.config.ts` 는 콘텐츠
 * 레이어보다 먼저 평가되고, `scripts/build-fonts.mjs` 는 Node 가 직접 읽고,
 * Playwright 스펙은 `astro:content` 스킴을 모릅니다.
 *
 * 그래서 저마다 정규식을 하나씩 적어 두었고, **여섯 벌이 이미 갈렸습니다.**
 *
 *   `astro.config.ts`       `startsWith('---')` 확인이 없었습니다
 *   `build-fonts.mjs`       draft 만 보고 category 는 보지 않았습니다
 *   나머지 스펙 넷          제각각 복사본
 *
 * 갈린 상태에서 누가 `draft: True` 라고 쓰거나 값에 따옴표를 두르면, 네비는
 * 항목을 보여 주고 폰트 서브셋은 글자를 빼고 사이트맵은 또 다른 답을 냅니다 —
 * **한 사실에 대해 서로 다른 세 가지 오답.**
 *
 * ⚠️ 이 파일은 아무것도 import 하지 않습니다. Vite·Node·Playwright 가 모두
 * 물릴 수 있어야 하기 때문입니다(`reserved-paths.ts` 와 같은 이유).
 */

/** 파일 원문에서 프론트매터 블록만. 없으면 빈 문자열입니다. */
export function frontmatterOf(raw: string): string {
  if (!raw.startsWith('---')) return '';
  return raw.split('---')[1] ?? '';
}

/**
 * 프론트매터의 한 항목. **따옴표를 벗깁니다.**
 *
 * YAML 은 `publishedAt: "2026-08-27"` 을 허용하고 zod 의 `coerce.date()` 와
 * `enum` 도 통과시킵니다 — 스키마는 벗겨진 값을 보기 때문입니다. 그런데
 * 정규식으로 `(\S+)` 를 집으면 따옴표까지 딸려 옵니다.
 *
 * 그 값이 사이트맵의 `<lastmod>` 로 나가면 W3C datetime 이 아니라 Google 이
 * 그 항목의 lastmod 를 통째로 버립니다. `category: "journal"` 이면 주소가
 * `support/notice` 로 떨어져 **있지도 않은 주소의 날짜** 가 됩니다.
 * 오류도 경고도 없이 조용히 틀립니다.
 */
export function field(front: string, key: string): string | undefined {
  const raw = front.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'))?.[1];
  if (raw === undefined) return undefined;
  const unquoted = raw.replace(/^(['"])([\s\S]*)\1$/, '$2');
  return unquoted === '' ? undefined : unquoted;
}

/**
 * 내보내지 않는 글인가.
 *
 * `draft: True`·`draft: "true"` 도 초안으로 봅니다. 사람이 그렇게 쓸 때
 * 뜻하는 바는 하나뿐인데, 엄격하게 보면 **초안이 공개됩니다** — 틀리는
 * 방향이 나쁜 쪽입니다.
 */
export function isDraft(front: string): boolean {
  return field(front, 'draft')?.toLowerCase() === 'true';
}

/** 글의 갈래. `journal` 이 아니면 공지로 봅니다 — 스키마의 기본값과 같습니다. */
export function categoryOf(front: string): 'journal' | 'notice' {
  return field(front, 'category') === 'journal' ? 'journal' : 'notice';
}

/** 이 원문이 **내보내는 읽을거리** 인가. 네비·사이트맵·검사가 함께 씁니다. */
export function isPublishedJournal(raw: string): boolean {
  const front = frontmatterOf(raw);
  return categoryOf(front) === 'journal' && !isDraft(front);
}
