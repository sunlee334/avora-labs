import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALE_META, LOCALES, localizePath } from "@/i18n/config";
import { SITE } from "@/lib/config";

/** 공개 스토어 경로(접두사 없음). 상품 상세는 현재 판매 중인 슬러그만 고정으로 둔다. */
const PATHS = [
  "/",
  "/shop",
  "/products/daily-sunscreen",
  "/brand",
  "/standard",
  "/faq",
  "/notify",
  "/orders/lookup",
  "/policy/shipping-returns",
  "/policy/terms",
  "/policy/privacy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url.replace(/\/$/, "");
  return PATHS.flatMap((path) => {
    const languages: Record<string, string> = {};
    for (const l of LOCALES) languages[LOCALE_META[l].htmlLang] = `${base}${localizePath(l, path)}`;
    languages["x-default"] = `${base}${localizePath(DEFAULT_LOCALE, path)}`;
    return LOCALES.map((l) => ({
      url: `${base}${localizePath(l, path)}`,
      changeFrequency: "weekly" as const,
      priority: path === "/" ? 1 : 0.7,
      alternates: { languages },
    }));
  });
}
