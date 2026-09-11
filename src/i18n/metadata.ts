import type { Metadata } from "next";
import { DEFAULT_LOCALE, LOCALE_META, LOCALES, localizePath, type Locale } from "./config";

/**
 * 페이지 메타데이터의 canonical + hreflang. `path` 는 접두사 없는 스토어 경로("/shop").
 * metadataBase 는 루트 레이아웃이 설정하므로 상대 경로를 돌려준다.
 */
export function localeAlternates(locale: Locale, path: string): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[LOCALE_META[l].htmlLang] = localizePath(l, path);
  languages["x-default"] = localizePath(DEFAULT_LOCALE, path);
  return { canonical: localizePath(locale, path), languages };
}
