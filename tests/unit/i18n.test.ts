import { describe, expect, it } from "vitest";
import { getContent } from "@/content";
import {
  DEFAULT_LOCALE,
  isLocaleAgnosticPath,
  LOCALES,
  localizePath,
  splitLocale,
  switchLocalePath,
} from "@/i18n/config";
import { fill, formatLocalDate, formatPrice } from "@/i18n/format";
import { getMessages } from "@/i18n/messages";
import { ko } from "@/i18n/messages/ko";

/** 중첩 객체의 키 경로를 모두 모은다 (값이 문자열/배열인 리프까지). */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (Array.isArray(value)) return [`${prefix}[]`];
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

/** 리프 문자열의 {placeholder} 집합을 경로별로 모은다. */
function placeholders(value: unknown, prefix = "", out: Record<string, string[]> = {}): Record<string, string[]> {
  if (typeof value === "string") {
    const found = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    if (found.length) out[prefix] = found;
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) placeholders(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

describe("i18n messages", () => {
  const koPaths = keyPaths(ko).sort();
  const koVars = placeholders(ko);

  for (const locale of LOCALES) {
    it(`${locale} dictionary has exactly the Korean key set`, () => {
      expect(keyPaths(getMessages(locale)).sort()).toEqual(koPaths);
    });

    it(`${locale} dictionary keeps exactly the same {placeholders} as Korean`, () => {
      // 양방향: 번역본에만 있는 {token} 도 잡는다 (fill() 이 채우지 못해 그대로 노출되므로).
      expect(placeholders(getMessages(locale))).toEqual(koVars);
    });

    it(`${locale} dictionary has no empty string except deliberately blank suffixes`, () => {
      const empties = keyPaths(getMessages(locale)).filter((p) => {
        const v = p.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], getMessages(locale));
        return v === "";
      });
      // 문장 부호가 없는 언어(태국어)는 '동의합니다.' 의 마침표 자리가 비어 있을 수 있다.
      expect(empties.filter((p) => p !== "auth.termsAfter")).toEqual([]);
    });
  }

  it("non-Korean dictionaries contain no Hangul", () => {
    for (const locale of LOCALES) {
      if (locale === "ko") continue;
      const hangul = keyPaths(getMessages(locale)).filter((p) => {
        const v = p.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], getMessages(locale));
        return typeof v === "string" && /[가-힣]/.test(v);
      });
      expect(hangul, locale).toEqual([]);
    }
  });
});

describe("i18n content", () => {
  const koPaths = keyPaths(getContent("ko")).sort();
  for (const locale of LOCALES) {
    it(`${locale} content has the Korean shape (plus optional legalNotice)`, () => {
      const paths = keyPaths(getContent(locale)).filter((p) => p !== "legalNotice").sort();
      // 번역본은 카탈로그 오버라이드(CATALOG.*)를 채우므로 한국어보다 키가 많을 수 있다.
      const strippedKo = koPaths.filter((p) => !p.startsWith("CATALOG"));
      const stripped = paths.filter((p) => !p.startsWith("CATALOG"));
      expect(stripped).toEqual(strippedKo);
    });
  }

  it("translated policies carry the legal notice (Korean text is binding)", () => {
    for (const locale of LOCALES) {
      if (locale === "ko") continue;
      expect(getContent(locale).legalNotice, locale).toBeTruthy();
    }
  });

  it("navigation and footer hrefs are identical across locales (labels differ, routes do not)", () => {
    const routes = (locale: (typeof LOCALES)[number]) => {
      const c = getContent(locale);
      return {
        nav: c.NAV.map((i) => i.href),
        footer: Object.fromEntries(Object.entries(c.FOOTER_LINKS).map(([k, items]) => [k, items.map((i) => i.href)])),
        reason: c.DAILY_SUNSCREEN.reason.link.href,
        standardNote: c.BRAND.company.standardNote.link.href,
        codes: c.BRAND_CODES.map((b) => b.key),
      };
    };
    const ko = routes("ko");
    for (const locale of LOCALES) expect(routes(locale), locale).toEqual(ko);
  });

  it("FAQ groups keep the same keys and item counts across locales", () => {
    const koGroups = getContent("ko").FAQ_GROUPS.map((g) => [g.key, g.items.length]);
    for (const locale of LOCALES) {
      expect(getContent(locale).FAQ_GROUPS.map((g) => [g.key, g.items.length]), locale).toEqual(koGroups);
    }
  });
});

describe("locale paths", () => {
  it("splits a prefixed path and leaves Korean unprefixed", () => {
    expect(splitLocale("/en/shop")).toEqual({ locale: "en", pathname: "/shop", prefixed: true });
    expect(splitLocale("/en")).toEqual({ locale: "en", pathname: "/", prefixed: true });
    expect(splitLocale("/shop")).toEqual({ locale: "ko", pathname: "/shop", prefixed: false });
    // 지원하지 않는 2글자 코드는 언어가 아니라 그냥 경로다
    expect(splitLocale("/fr/shop")).toEqual({ locale: "ko", pathname: "/fr/shop", prefixed: false });
    // 명시적 /ko 는 접두사로 보지 않는다 (라우트 재작성이 만드는 내부 경로)
    expect(splitLocale("/ko/shop").prefixed).toBe(false);
    // 접두사처럼 보이는 더 긴 세그먼트
    expect(splitLocale("/english").prefixed).toBe(false);
  });

  it("localizePath prefixes only internal store paths", () => {
    expect(localizePath("ko", "/shop")).toBe("/shop");
    expect(localizePath("en", "/shop")).toBe("/en/shop");
    expect(localizePath("en", "/")).toBe("/en");
    expect(localizePath("th", "/en/shop")).toBe("/en/shop");
    expect(localizePath("en", "/admin/orders")).toBe("/admin/orders");
    expect(localizePath("en", "/api/health")).toBe("/api/health");
    expect(localizePath("en", "https://example.com/x")).toBe("https://example.com/x");
    expect(localizePath("en", "//evil.example")).toBe("//evil.example");
    expect(localizePath("en", "/brand/avora-wordmark-forest.svg")).toBe("/brand/avora-wordmark-forest.svg");
    expect(localizePath("vi", "/login?next=%2Faccount")).toBe("/vi/login?next=%2Faccount");
    // 쿼리스트링 끝이 확장자처럼 보여도 정적 파일로 오판하지 않는다
    expect(localizePath("en", "/login?next=%2Fen%2Faccount%3Fa%3Dx.jpg")).toBe("/en/login?next=%2Fen%2Faccount%3Fa%3Dx.jpg");
    expect(localizePath("en", "/shop#reviews")).toBe("/en/shop#reviews");
    expect(localizePath("en", "/?ref=x.com")).toBe("/en?ref=x.com");
    expect(localizePath("en", "/en/shop?tag=running#reviews")).toBe("/en/shop?tag=running#reviews");
  });

  it("switchLocalePath swaps the prefix and keeps the page", () => {
    expect(switchLocalePath("en", "/shop")).toBe("/en/shop");
    expect(switchLocalePath("ko", "/en/shop")).toBe("/shop");
    expect(switchLocalePath("zh", "/th/products/daily-sunscreen")).toBe("/zh/products/daily-sunscreen");
    expect(switchLocalePath("ko", "/en")).toBe("/");
    expect(switchLocalePath("en", "/")).toBe("/en");
    // 오리진을 벗어날 수 있는 값은 홈으로 폴백
    expect(switchLocalePath("en", "//evil.example")).toBe("/en");
    expect(switchLocalePath("ko", "/\\evil.example")).toBe("/");
    expect(switchLocalePath("th", "https://evil.example/x")).toBe("/th");
  });

  it("locale-agnostic paths", () => {
    for (const p of ["/admin", "/admin/orders/1", "/api/health", "/_next/static/x.js", "/icon.svg", "/sitemap.xml", "/robots.txt"]) {
      expect(isLocaleAgnosticPath(p), p).toBe(true);
    }
    for (const p of ["/", "/shop", "/products/daily-sunscreen", "/checkout/success"]) {
      expect(isLocaleAgnosticPath(p), p).toBe(false);
    }
  });

  it("default locale is Korean", () => {
    expect(DEFAULT_LOCALE).toBe("ko");
  });
});

describe("i18n formatting", () => {
  it("formats KRW per locale (currency never changes)", () => {
    expect(formatPrice(32000, "ko")).toBe("32,000원");
    expect(formatPrice(32000, "en")).toBe("₩32,000");
    expect(formatPrice(0, "th")).toBe("₩0");
  });

  it("fills placeholders and leaves unknown ones visible", () => {
    expect(fill("{n} items", { n: 3 })).toBe("3 items");
    expect(fill("Order {order}", {})).toBe("Order {order}");
    // 프로토타입 키는 값으로 보지 않는다
    expect(fill("{constructor}", {})).toBe("{constructor}");
  });

  it("formats dates in Seoul time for every locale", () => {
    const iso = "2026-09-10T15:30:00Z"; // 00:30 KST next day
    for (const locale of LOCALES) {
      const out = formatLocalDate(iso, locale);
      expect(out, locale).toMatch(/11/);
    }
    expect(formatLocalDate(null, "en")).toBe("-");
  });
});
