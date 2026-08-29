/**
 * 사이트 전역 상수.
 *
 * ▸ 도메인이 확정되면 아래 `origin` 한 줄만 바꾸세요.
 *   canonical · hreflang · Open Graph · sitemap.xml 이 전부 따라 바뀝니다.
 */

/**
 * 서비스 도메인. **이 값 하나가 정식 주소를 정합니다.**
 *
 * canonical · hreflang · Open Graph · sitemap.xml · JSON-LD 가 전부 여기서 나옵니다.
 * 그래서 이 값이 실제로 응답하는 주소와 어긋나면, 검색엔진과 답변엔진만
 * 존재하지 않는 주소를 보게 됩니다 — 화면을 아무리 봐도 드러나지 않는 오류입니다.
 *
 * www 는 정식 주소가 아닙니다. Cloudflare Redirect Rule 이 apex 로 301 을 보내며,
 * 그 규칙이 없으면 www 가 같은 내용을 그대로 서빙해 색인이 둘로 갈립니다.
 *
 * 바꿀 때 함께 봐야 할 곳: wrangler.jsonc 의 routes, public/robots.txt 의 Sitemap 줄.
 */
export const ORIGIN = 'https://avoralabs.co';

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
  'PAROS',
  'AVORA LABS',
  'For every movement.',
  'MOVE. SWEAT. REAPPLY.',
  'LIGHT',
  'COMFORT',
  'PROTECTION',
  'RESET',
  'ACTIVE LIFESTYLE BEAUTY',
  'SPF50+ / PA++++',
] as const;

/** 절대 URL 생성. OG·canonical·sitemap이 전부 이 함수를 지납니다. */
export function absoluteUrl(path: string): string {
  return new URL(path, ORIGIN).href;
}

/**
 * 사업자 정보 — 푸터 및 Organization JSON-LD에 사용.
 *
 * 전자상거래법 제10조가 표시를 요구하는 항목입니다: 상호·대표자 성명·주소·
 * 전화번호·전자우편주소·사업자등록번호·통신판매업 신고번호.
 *
 * **비어 있는 값은 푸터에 렌더링되지 않습니다.** 지어내지 말고 비워 두세요 —
 * 없는 신고번호를 적는 것은 없는 것보다 나쁩니다.
 *
 * 출처: 사업자등록증명 (2026-07-22 발급, 마포세무서)
 */
export const BUSINESS = {
  /**
   * 브랜드명 — 손님이 아는 이름. 화면과 JSON-LD 에 쓰입니다.
   *
   * 회사(AVORA LABS)와 브랜드(PAROS)는 다릅니다. 브랜딩 문서가 둘을 나눕니다:
   * AVORA LABS 가 브랜드를 만들고, PAROS 가 그중 첫 번째입니다.
   * 사업자 정보·저작권·약관의 주체는 회사이고, 제품과 서사의 주인은 브랜드입니다.
   */
  brandName: 'PAROS',
  /** 운영사. 사업자 정보와 저작권의 주체입니다. */
  companyName: 'AVORA LABS',
  /** 등기상 상호. 법이 요구하는 표시 항목입니다. */
  legalName: '아보라랩스',
  representative: '이영규',
  registrationNumber: '392-32-01888',
  address: '서울특별시 마포구 월드컵북로20안길 22, 301호(성산동)',

  /**
   * 아직 없는 것들. 확인되면 채우세요.
   *
   * mailOrderNumber(통신판매업 신고번호)는 사업자등록만으로는 생기지 않습니다.
   * 관할 구청에 따로 신고해야 하고, 신고할 때 구매안전서비스 이용확인증이
   * 필요해서 보통 PG 계약이 먼저입니다.
   */
  mailOrderNumber: '',
  phone: '010-2173-6358',
  // 브랜드 공용 주소입니다. 5개 언어 푸터와 고객센터에 공개되므로 개인 주소를
  // 쓰지 않습니다. 나중에 Cloudflare Email Routing 으로 hello@avoralabs.co 를
  // 만들어 이 주소로 넘기면, 여기 한 줄만 바꾸면 됩니다.
  email: 'hello.avoralabs@gmail.com',
} as const;

/**
 * 브랜드 계정. 푸터 링크와 Organization JSON-LD 의 `sameAs` 가 여기서 나옵니다.
 *
 * **비어 있으면 링크도 JSON-LD 항목도 나오지 않습니다.** BUSINESS 와 같은 규칙입니다 —
 * 없는 계정을 가리키는 링크는 없는 것보다 나쁩니다.
 *
 * `sameAs` 를 함께 내는 이유: 검색엔진과 답변엔진이 "이 사이트"와 "이 인스타
 * 계정"이 같은 주체라는 것을 알아야, 브랜드명을 검색했을 때 둘이 한 덩어리로
 * 묶입니다. 푸터 링크만으로는 그 연결이 확실하지 않습니다.
 */
export const SOCIAL = {
  /** @avora_labs — 표시용 이름. `@` 를 포함해 적습니다. */
  instagramHandle: '@avora_labs',
  instagramUrl: 'https://www.instagram.com/avora_labs/',
} as const;

/**
 * Cloudflare Web Analytics 사이트 토큰.
 *
 * **값이 없으면 계측 스크립트를 아예 넣지 않습니다.** 그래서 이 파일에 토큰을
 * 넣기 전까지 사이트는 방문자에 대해 아무것도 수집하지 않습니다 — 개인정보
 * 처리방침에 적힌 내용과 실제 동작이 어긋나지 않게 하려는 것입니다.
 *
 * 토큰 받는 곳: Cloudflare 대시보드 → Analytics & Logs → Web Analytics →
 * avoralabs.co → Manage site → JS snippet 의 `token` 값(32자리 16진수).
 *
 * 이 값은 비밀이 아닙니다. 어차피 모든 방문자의 HTML 에 그대로 실려 나가므로
 * 환경변수가 아니라 저장소에 둡니다 — 그래야 무엇이 켜져 있는지가 코드에 남습니다.
 *
 * 쿠키를 쓰지 않는 도구라 동의 배너가 필요 없습니다. 개인정보처리방침의
 * `legal.privacy.analytics` 항목이 이 도구를 설명합니다. 다른 도구로 바꾸면
 * 그 문구도 함께 고쳐야 합니다.
 */
export const WEB_ANALYTICS_TOKEN = '';
