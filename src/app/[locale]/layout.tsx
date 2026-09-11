import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";

/**
 * 언어 세그먼트. 한국어는 프록시가 `/shop` → `/ko/shop` 으로 내부 재작성하므로 URL 에는 접두사가 보이지 않는다.
 * 지원하지 않는 언어 코드는 404 — 프록시가 `/fr/shop` 을 `/ko/fr/shop` 으로 재작성해 라우팅 단계에서 이미 404 가 나므로
 * 평소에는 도달하지 않지만, 프록시를 거치지 않는 경로가 생겨도 잘못된 세그먼트가 렌더링되지 않게 하는 방어선이다.
 * 언어 프로바이더와 `<html lang>` 은 루트 레이아웃이 프록시 헤더를 읽어 세팅한다.
 */
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return children;
}
