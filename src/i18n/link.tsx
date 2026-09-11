"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useLocale } from "./client";
import { localizePath } from "./config";

/**
 * 현재 언어 접두사를 자동으로 붙이는 Link. 스토어 컴포넌트는 next/link 대신 이것을 쓴다.
 * 외부 URL·관리자·API 경로는 건드리지 않는다.
 */
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  const localized = typeof href === "string" ? localizePath(locale, href) : href;
  return <NextLink href={localized} {...props} />;
}
