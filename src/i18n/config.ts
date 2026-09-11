/**
 * 지원 언어. 한국어는 접두사 없이(`/shop`), 나머지는 경로 접두사로 구분한다(`/en/shop`).
 * 관리자·API 경로는 언어를 나누지 않는다 (한국어 고정).
 */
export const LOCALES = ["ko", "en", "th", "vi", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ko";

/** 프록시가 세팅하고 서버 컴포넌트·액션이 읽는 요청 헤더 */
export const LOCALE_HEADER = "x-paros-locale";

export const LOCALE_META: Record<
  Locale,
  { label: string; nativeLabel: string; htmlLang: string; ogLocale: string; intl: string }
> = {
  ko: { label: "Korean", nativeLabel: "한국어", htmlLang: "ko", ogLocale: "ko_KR", intl: "ko-KR" },
  en: { label: "English", nativeLabel: "English", htmlLang: "en", ogLocale: "en_US", intl: "en-US" },
  th: { label: "Thai", nativeLabel: "ไทย", htmlLang: "th", ogLocale: "th_TH", intl: "th-TH" },
  vi: { label: "Vietnamese", nativeLabel: "Tiếng Việt", htmlLang: "vi", ogLocale: "vi_VN", intl: "vi-VN" },
  zh: { label: "Chinese", nativeLabel: "中文", htmlLang: "zh-Hans", ogLocale: "zh_CN", intl: "zh-CN" },
};

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** 경로 맨 앞의 언어 접두사를 떼어낸다. `/en/shop` → { locale: "en", pathname: "/shop" }, `/shop` → { locale: "ko", pathname: "/shop" } */
export function splitLocale(pathname: string): { locale: Locale; pathname: string; prefixed: boolean } {
  const match = pathname.match(/^\/([a-z]{2})(?=\/|$)/);
  if (match && isLocale(match[1]) && match[1] !== DEFAULT_LOCALE) {
    const rest = pathname.slice(match[0].length);
    return { locale: match[1], pathname: rest === "" ? "/" : rest, prefixed: true };
  }
  return { locale: DEFAULT_LOCALE, pathname, prefixed: false };
}

/** 언어 접두사가 붙지 않는 경로 (관리자·API·정적 파일) */
export function isLocaleAgnosticPath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/opengraph-image" ||
    pathname === "/icon.svg" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  );
}

/** 내부 경로에 언어 접두사를 붙인다. 외부 URL·관리자·API 경로·이미 접두사가 있는 경로는 그대로 둔다. */
export function localizePath(locale: Locale, href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  // 확장자·접두사 판정은 쿼리스트링·해시를 뺀 경로 부분으로만 한다 (`?next=...x.jpg` 가 정적 파일로 오판되지 않게).
  const path = href.split(/[?#]/, 1)[0];
  if (locale === DEFAULT_LOCALE || isLocaleAgnosticPath(path)) return href;
  if (splitLocale(path).prefixed) return href;
  return `/${locale}${path === "/" ? href.slice(1) : href}`;
}

/** 현재 경로를 다른 언어의 같은 페이지로 바꾼다 (언어 전환기용). 프로토콜 상대 경로·백슬래시는 홈으로 폴백한다. */
export function switchLocalePath(target: Locale, currentPathname: string): string {
  if (!currentPathname.startsWith("/") || currentPathname.startsWith("//") || currentPathname.includes("\\")) {
    return localizePath(target, "/");
  }
  const { pathname } = splitLocale(currentPathname);
  return localizePath(target, pathname);
}
