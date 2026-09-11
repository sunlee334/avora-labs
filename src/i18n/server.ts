import "server-only";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER, type Locale } from "./config";
import { getMessages, type Messages } from "./messages";

/** 프록시가 넣은 헤더에서 현재 요청의 언어를 읽는다. 서버 컴포넌트·서버 액션·라우트 핸들러 공용. */
export async function getLocale(): Promise<Locale> {
  const value = (await headers()).get(LOCALE_HEADER);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** 현재 요청 언어의 UI 문구 사전 */
export async function getT(): Promise<{ locale: Locale; m: Messages }> {
  const locale = await getLocale();
  return { locale, m: getMessages(locale) };
}
