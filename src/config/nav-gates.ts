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
import { visibleUtility, menuDestinations, type NavFlags } from './nav';

export const FLAGS: NavFlags = { checkout: SELLS_DIRECTLY, accounts: ACCOUNTS_ENABLED };

/** 헤더·시트가 쓰는 유틸리티 목록 (장바구니 포함). */
export const UTILITY_VISIBLE = visibleUtility(FLAGS);

/** 푸터가 쓰는 목적지 전부 (장바구니 제외). */
export const MENU_DESTINATIONS = menuDestinations(FLAGS);
