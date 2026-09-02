/**
 * 게이트 층 — 빌드 플래그를 아는 유일한 곳.
 *
 * `nav.ts` 가 순수해야 하는 이유는 테스트가 그것을 직접 import 해서 세 화면의
 * 렌더 결과와 대조하기 때문입니다(AC-24). `runtime.ts` 는 `import.meta.env` 와
 * 확장자 속성 없는 JSON import 를 쓰므로 Playwright 러너에서 로드되지
 * 않습니다 — 그래서 그 의존을 이 파일 하나로 몰아 둡니다.
 *
 * 정의는 쪼개지지 않습니다. 항목의 id·경로·라벨·게이트 이름·자식 관계는 전부
 * `nav.ts` 에 있고, 여기 있는 것은 **플래그를 한 번 읽어 묶는 세 줄** 뿐입니다.
 */
import { SELLS_DIRECTLY, ACCOUNTS_ENABLED } from './runtime';
import { visibleTop, visibleUtility, menuDestinations, type NavFlags } from './nav';

/*
 * 공개된 저널 글이 하나라도 있는가.
 *
 * 초안은 페이지가 만들어지지 않으므로, 전부 초안이면 `/journal` 은 빈 목록
 * 입니다. 그 상태로 최상위 메뉴에 두면 **언제 눌러도 빈 페이지로 가는 길** 이
 * 되는데, 리뷰 항목을 감추는 것과 정확히 같은 이유로 그러면 안 됩니다.
 *
 * `import.meta.glob` 은 빌드 때 파일 목록을 정적으로 만듭니다 — 콘텐츠
 * 컬렉션(`getCollection`)은 비동기라 이 모듈에서 쓸 수 없습니다.
 */
const journalFiles = import.meta.glob('../content/posts/*/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

export const HAS_JOURNAL = Object.values(journalFiles).some((raw) => {
  const front = raw.startsWith('---') ? (raw.split('---')[1] ?? '') : '';
  return /^category:\s*journal\s*$/m.test(front) && !/^draft:\s*true\s*$/m.test(front);
});

export const FLAGS: NavFlags = {
  checkout: SELLS_DIRECTLY,
  accounts: ACCOUNTS_ENABLED,
  journal: HAS_JOURNAL,
};

/** 헤더·시트가 쓰는 최상위 목록. 게이트를 지난 결과입니다. */
export const TOP_VISIBLE = visibleTop(FLAGS);

/** 헤더·시트가 쓰는 유틸리티 목록 (장바구니 포함). */
export const UTILITY_VISIBLE = visibleUtility(FLAGS);

/** 푸터가 쓰는 목적지 전부 (장바구니 제외). */
export const MENU_DESTINATIONS = menuDestinations(FLAGS);
