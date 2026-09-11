"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "./config";
import type { Messages } from "./messages";

type LocaleContextValue = { locale: Locale; messages: Messages };

/**
 * 루트 레이아웃이 현재 언어 사전 하나만 props 로 내려보낸다. 기본값을 두지 않으므로 어떤 사전도 클라이언트 번들에 들어가지 않는다.
 * (관리자·404·오류 경계도 루트 레이아웃 안에 있어 프로바이더 밖에서 렌더링되는 컴포넌트는 없다.)
 */
const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={{ locale, messages }}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("LocaleProvider is missing above this component");
  return value;
}

export function useLocale(): Locale {
  return useLocaleContext().locale;
}

export function useMessages(): Messages {
  return useLocaleContext().messages;
}
