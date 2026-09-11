import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocaleAgnosticPath, LOCALE_HEADER, localizePath, splitLocale } from "@/i18n/config";
import { SESSION_COOKIE } from "@/lib/config";

/**
 * 1) 언어 라우팅: 한국어는 접두사 없이(`/shop`) 쓰고 내부적으로 `/ko/shop` 으로 재작성한다. 다른 언어는 `/en/shop` 처럼 접두사로 구분.
 *    현재 언어는 `x-paros-locale` 요청 헤더로 서버 컴포넌트·액션에 전달한다.
 * 2) 낙관적 접근 제어: 세션 쿠키가 없으면 /login 으로 보낸다. 실제 권한 검증은 각 레이아웃/서버 액션에서 DB 세션으로 수행한다.
 * 관리자·API·정적 파일은 언어를 나누지 않는다.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // www 는 apex 로 통일한다 (canonical·hreflang·sitemap 이 모두 apex 기준).
  const host = request.headers.get("host") ?? "";
  if (host.startsWith("www.")) {
    const url = request.nextUrl.clone();
    url.host = host.slice(4);
    return NextResponse.redirect(url, 308);
  }

  if (isLocaleAgnosticPath(pathname)) {
    if (pathname.startsWith("/admin") && !request.cookies.get(SESSION_COOKIE)?.value) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    const headers = new Headers(request.headers);
    headers.set(LOCALE_HEADER, DEFAULT_LOCALE);
    return NextResponse.next({ request: { headers } });
  }

  // 한국어는 접두사 없이 쓴다. 누군가 내부 재작성 경로(/ko/...)를 공유하면 정식 주소로 보낸다.
  if (pathname === `/${DEFAULT_LOCALE}` || pathname.startsWith(`/${DEFAULT_LOCALE}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(DEFAULT_LOCALE.length + 1) || "/";
    return NextResponse.redirect(url, 308);
  }

  const { locale, pathname: bare, prefixed } = splitLocale(pathname);

  if (bare.startsWith("/account") && !request.cookies.get(SESSION_COOKIE)?.value) {
    const url = new URL(localizePath(locale, "/login"), request.url);
    url.searchParams.set("next", localizePath(locale, bare));
    return NextResponse.redirect(url);
  }

  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);

  if (prefixed) {
    return NextResponse.next({ request: { headers } });
  }
  // 한국어(기본): URL 은 그대로 두고 `[locale]` 세그먼트로 내부 재작성한다.
  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // 정적 파일(확장자 있는 경로)과 Next 내부 경로는 프록시를 거치지 않는다.
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
