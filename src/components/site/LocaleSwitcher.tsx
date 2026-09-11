"use client";

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useMessages } from "@/i18n/client";
import { isLocale, LOCALE_META, LOCALES, switchLocalePath } from "@/i18n/config";

/**
 * 언어 전환기. 현재 경로를 같은 페이지의 다른 언어 URL 로 바꾼다 (한국어는 접두사 없음).
 * `links` 는 next/link 를 직접 쓴다 — @/i18n/link 는 현재 언어 접두사를 다시 붙이기 때문.
 */
export function LocaleSwitcher({ variant = "select", className = "" }: { variant?: "select" | "links"; className?: string }) {
  const locale = useLocale();
  const m = useMessages();
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  if (variant === "links") {
    return (
      <nav aria-label={m.common.language} className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] ${className}`}>
        {LOCALES.map((l) => (
          <NextLink
            key={l}
            href={switchLocalePath(l, pathname)}
            hrefLang={LOCALE_META[l].htmlLang}
            lang={LOCALE_META[l].htmlLang}
            aria-current={l === locale ? "true" : undefined}
            className={l === locale ? "font-semibold text-ink" : "text-charcoal/70 transition hover:text-ink"}
          >
            {LOCALE_META[l].nativeLabel}
          </NextLink>
        ))}
      </nav>
    );
  }

  return (
    <label className={`inline-flex items-center ${className}`}>
      <span className="sr-only">{m.common.language}</span>
      <select
        value={locale}
        onChange={(e) => {
          const target = e.target.value;
          if (!isLocale(target) || target === locale) return;
          router.push(switchLocalePath(target, pathname) + window.location.search);
        }}
        className="h-8 cursor-pointer rounded-full border border-line-2 bg-white/60 pl-3 pr-7 text-[12px] font-medium text-charcoal/80 outline-none transition hover:border-ink focus-visible:border-ink"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={LOCALE_META[l].htmlLang}>
            {LOCALE_META[l].nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
