/**
 * 사이트 전역 상수.
 *
 * ▸ 도메인이 확정되면 아래 `origin` 한 줄만 바꾸세요.
 *   canonical · hreflang · Open Graph · sitemap.xml 이 전부 따라 바뀝니다.
 */

/**
 * 서비스 도메인. 커스텀 도메인 확정 전까지는 workers.dev 주소를 씁니다.
 *
 * 형식은 <Worker 이름>.<계정 서브도메인>.workers.dev 입니다. 서브도메인은
 * 대시보드(Workers & Pages → Account details → Subdomain)에서 바꿀 수 있고,
 * 바꾸면 이 값과 public/robots.txt 의 Sitemap 줄을 함께 고쳐야 합니다. wrangler.jsonc 의
 * name 을 바꾸면 이 값도 함께 바꿔야 합니다 — 어긋나면 canonical 과 sitemap 이
 * 존재하지 않는 주소를 가리키게 되고, 그건 검색엔진에만 보이는 오류라
 * 화면을 아무리 봐도 드러나지 않습니다.
 */
export const ORIGIN = 'https://avora-labs.sunlee334.workers.dev';

/** 지원 언어. 순서가 언어 선택 UI의 노출 순서입니다. */
export const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'] as const;
export type Locale = (typeof LOCALES)[number];

/** hreflang="x-default" 가 가리킬 언어. 어느 언어권도 아닌 방문자가 받게 됩니다. */
export const DEFAULT_LOCALE: Locale = 'en';

/** 언어 선택 UI에 표시할 이름 — 각 언어의 자기 이름으로 적습니다. */
export const LOCALE_LABELS: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  zh: '简体中文',
  th: 'ไทย',
  vi: 'Tiếng Việt',
};

/** `<html lang>` 과 hreflang 에 들어갈 BCP 47 태그. */
export const LOCALE_TAGS: Record<Locale, string> = {
  ko: 'ko-KR',
  en: 'en',
  zh: 'zh-Hans',
  th: 'th-TH',
  vi: 'vi-VN',
};

/**
 * 번역하지 않고 원문 그대로 유지하는 문구.
 * 기준: 브랜드 자산이거나 국제 규격 표기면 원문, 설명하는 문장이면 번역.
 * 슬로건을 번역하면 브랜드 식별자가 언어 수만큼 쪼개집니다.
 */
export const KEEP_ORIGINAL = [
  'AVORA',
  'For every movement.',
  'MOVE. SWEAT. REAPPLY.',
  'Stay',
  'Breathe',
  'Pure',
  'ACTIVE LIFESTYLE BEAUTY',
  'SPF50+ / PA++++',
] as const;

/** 절대 URL 생성. OG·canonical·sitemap이 전부 이 함수를 지납니다. */
export function absoluteUrl(path: string): string {
  return new URL(path, ORIGIN).href;
}

/** 사업자 정보 — 푸터 및 Organization JSON-LD에 사용. */
export const BUSINESS = {
  legalName: 'AVORA',
  email: 'hello@avora.example',
  /** 실제 값 확정 후 채웁니다. 비어 있으면 푸터에 렌더링되지 않습니다. */
  registrationNumber: '',
  mailOrderNumber: '',
  address: '',
} as const;
