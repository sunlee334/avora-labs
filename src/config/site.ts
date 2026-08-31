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
 * `og:locale` 값. **위의 hreflang 태그와 다른 규격입니다.**
 *
 * 전에는 `LOCALE_TAGS` 의 `-` 를 `_` 로 바꿔 썼는데, 그러면 두 개가 깨집니다:
 *
 *   en       → `en`       — og:locale 은 지역까지 요구합니다
 *   zh-Hans  → `zh_Hans`  — Hans 는 지역이 아니라 **문자 체계** 입니다
 *
 * hreflang 은 BCP 47 이라 문자 체계(`Hans`)를 쓰는 것이 맞고, 지역 없이
 * 언어만 적는 것도 맞습니다. og:locale 은 `언어_지역`(ISO 639-1 + ISO 3166-1)
 * 만 받습니다. 규격이 다르므로 표도 따로 둡니다.
 *
 * **이게 왜 중요한가:** 국내에서 링크 공유는 대부분 카카오톡이고, 카카오는
 * 이 값을 읽습니다. 값이 규격에 안 맞으면 미리보기가 엉뚱한 언어로 잡히거나
 * 아예 떨어집니다.
 *
 * 중국어를 `zh_CN` 으로 두는 것은 간체(Hans)를 쓰는 주 시장이 중국 본토라는
 * 뜻입니다. 대만·홍콩(번체)을 따로 내게 되면 그때 `zh_TW`·`zh_HK` 가 붙습니다.
 */
export const OG_LOCALES: Record<Locale, string> = {
  ko: 'ko_KR',
  en: 'en_US',
  zh: 'zh_CN',
  th: 'th_TH',
  vi: 'vi_VN',
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
 * Cloudflare Web Analytics 사이트 토큰 — **대비책입니다. 평소에는 비워 둡니다.**
 *
 * ── 지금은 이 값이 필요 없습니다 ───────────────────────────────
 * avoralabs.co 는 Cloudflare 프록시를 지나고(오렌지 클라우드), 프록시를 지나는
 * 사이트는 대시보드에서 사이트를 추가하는 것만으로 **엣지가 비콘을 자동으로
 * 끼워 넣습니다.** 2026-08-30 에 켰고, 지금 이 순간에도 그렇게 수집 중입니다.
 * 즉 이 값이 비어 있어도 사이트는 측정되고 있습니다.
 *
 * 자동 주입은 브라우저처럼 보이는 요청에만 걸립니다. curl 로 받아 보면 비콘이
 * 없는데, 그건 꺼진 것이 아니라 봇에 스크립트를 물리지 않는 것입니다.
 * 확인하려면 User-Agent 를 크롬으로 주고 받아 보세요.
 *
 * ── 채우면 안 되는 이유 ────────────────────────────────────────
 * **자동 주입이 켜진 채로 여기 값을 넣으면 비콘이 두 개가 되어 방문 수가 두 배로
 * 잡힙니다.** 둘 중 하나만 씁니다.
 *
 * ── 그럼 언제 쓰는가 ───────────────────────────────────────────
 * 자동 주입이 멈췄을 때입니다. 이 사이트는 Worker 가 응답을 만들어서(`run_worker_first`)
 * 엣지 주입이 항상 보장되지는 않습니다. 대시보드 숫자가 갑자기 0 이 되면
 * 브라우저 UA 로 비콘이 실리는지부터 확인하고, 안 실리면 그때
 * Manage site → Enable with JS Snippet installation 으로 바꾼 뒤
 * 거기 나오는 `token` 값(32자리 16진수)을 여기 넣습니다. 그 순간부터 이 코드가
 * 대신 실어 나릅니다.
 *
 * 이 값은 비밀이 아닙니다. 어차피 모든 방문자의 HTML 에 그대로 실려 나가므로
 * 환경변수가 아니라 저장소에 둡니다 — 그래야 무엇이 켜져 있는지가 코드에 남습니다.
 *
 * 쿠키를 쓰지 않는 도구라 동의 배너가 필요 없습니다. 개인정보처리방침의
 * `legal.privacy.analytics` 항목이 이 도구를 설명하며, 그 문구는 자동·수동
 * 어느 쪽이든 같습니다. 다른 도구로 바꾸면 그 문구도 함께 고쳐야 합니다.
 */
export const WEB_ANALYTICS_TOKEN = '';

/**
 * 검색엔진 사이트 소유권 확인 값.
 *
 * **비어 있으면 태그가 아예 나가지 않습니다.** 이 파일의 다른 값들과 같은
 * 규칙입니다 — 빈 값을 가진 메타태그는 확인에 실패할 뿐 아니라, 검색엔진에
 * "이 사이트는 뭔가 하려다 만 상태" 라는 신호를 줍니다.
 *
 * ── 왜 네이버만 여기 있는가 ────────────────────────────────────
 * 구글 서치 콘솔은 DNS TXT 레코드로 확인합니다(도메인 속성). 그쪽은 코드가
 * 아니라 Cloudflare DNS 에 레코드를 하나 넣는 일이라 이 파일과 무관합니다.
 * 네이버 서치어드바이저는 DNS 방식을 지원하지 않고 HTML 파일 업로드 또는
 * 메타태그만 받습니다. 정적 빌드에서는 메타태그가 맞습니다.
 *
 * 값 받는 곳: searchadvisor.naver.com → 웹마스터도구 → 사이트 등록 →
 * 소유확인 → HTML 태그. `content="..."` 안의 값만 여기 넣으세요.
 * 태그 전체(`<meta ...>`)를 붙여넣으면 따옴표가 이중으로 들어가 깨집니다.
 *
 * 확인이 끝난 뒤에도 지우지 마세요. 네이버는 주기적으로 다시 확인하고,
 * 태그가 사라지면 소유권이 해제됩니다.
 */
export const SITE_VERIFICATION = {
  /** 네이버 서치어드바이저. `content` 속성 값만 (예: 'a1b2c3...'). */
  naver: '3ac13435183ebfe85b8a0a808fb1956376915189',
} as const;
