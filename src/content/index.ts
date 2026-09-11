import type { Locale } from "@/i18n/config";
import * as koBrand from "./ko/brand";
import * as koFaq from "./ko/faq";
import * as koPolicies from "./ko/policies";
import * as koProduct from "./ko/product";
import * as koSite from "./ko/site";
import * as koStandard from "./ko/standard";

/**
 * 언어별 콘텐츠(마케팅 카피·FAQ·정책). 한국어 파일이 형태(type)의 기준이고, 다른 언어는 같은 형태를 `satisfies` 로 지킨다.
 * UI 문구(버튼·폼·오류)는 src/i18n/messages 에, 제품·브랜드 서사는 여기 둔다.
 */
export interface SiteContent {
  NAV: readonly { href: string; label: string }[];
  FOOTER_LINKS: {
    shop: readonly { href: string; label: string; external?: boolean }[];
    brand: readonly { href: string; label: string; external?: boolean }[];
    help: readonly { href: string; label: string; external?: boolean }[];
    legal: readonly { href: string; label: string; external?: boolean }[];
  };
  TAGLINES: typeof koSite.TAGLINES;
  DAY_FLOW: typeof koSite.DAY_FLOW;
  BRAND_CODES: readonly { key: string; name: string; ko: string; line: string }[];
}

export type ProductContent = {
  DAILY_SUNSCREEN: {
    slug: string;
    headline: string;
    eyebrow: string;
    intro: string;
    reason: { title: string; body: string; link: { href: string; label: string } };
    senses: readonly { key: string; title: string; body: string }[];
    scenes: readonly { time: string; title: string; body: string }[];
    specs: readonly { label: string; value: string; note?: string }[];
    ingredientsNote: string;
    usage: { title: string; steps: readonly { step: string; title: string; body: string }[]; reapplyLine: string };
    purchaseNotes: readonly string[];
    reviewIntro: string;
  };
  CAMPAIGN_STORY: { eyebrow: string; title: string; steps: readonly { key: string; body: string }[] };
  PROBLEM: { eyebrow: string; title: string; points: readonly string[]; close: string };
  /** DB 카탈로그(한국어)의 언어별 표시 문구. slug/sku 기준. 없으면 DB 값을 그대로 쓴다. */
  CATALOG: {
    products: Record<string, { subtitle?: string; description?: string; launchLabel?: string }>;
    variants: Record<string, string>;
  };
};

export type BrandContent = { BRAND: typeof koBrand.BRAND extends infer T ? DeepString<T> : never };
export type StandardContent = { STANDARD: DeepString<typeof koStandard.STANDARD> };
export type FaqContent = { FAQ_GROUPS: readonly { key: string; title: string; items: readonly { q: string; a: string }[] }[] };
export type PoliciesContent = {
  SHIPPING_RETURNS_POLICY: PolicyDoc;
  TERMS_POLICY: PolicyDoc;
  PRIVACY_POLICY: PolicyDoc;
  /** 번역본에만 있음: 한국어 원문이 법적 효력을 가진다는 고지 */
  legalNotice?: string;
};
export type PolicyDoc = { title: string; updatedNote: string; sections: readonly koPolicies.PolicySection[] };

/** `as const` 로 좁혀진 리터럴 타입을 string 으로 넓힌다 (번역본이 같은 형태를 다른 문장으로 채울 수 있게). */
type DeepString<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? readonly DeepString<U>[]
        : T extends object
          ? { readonly [K in keyof T]: DeepString<T[K]> }
          : T;

export type Content = SiteContent & ProductContent & BrandContent & StandardContent & FaqContent & PoliciesContent;

const ko: Content = {
  NAV: koSite.NAV,
  FOOTER_LINKS: koSite.FOOTER_LINKS,
  TAGLINES: koSite.TAGLINES,
  DAY_FLOW: koSite.DAY_FLOW,
  BRAND_CODES: koSite.BRAND_CODES,
  DAILY_SUNSCREEN: koProduct.DAILY_SUNSCREEN,
  CAMPAIGN_STORY: koProduct.CAMPAIGN_STORY,
  PROBLEM: koProduct.PROBLEM,
  CATALOG: { products: {}, variants: {} },
  BRAND: koBrand.BRAND,
  STANDARD: koStandard.STANDARD,
  FAQ_GROUPS: koFaq.FAQ_GROUPS,
  SHIPPING_RETURNS_POLICY: koPolicies.SHIPPING_RETURNS_POLICY,
  TERMS_POLICY: koPolicies.TERMS_POLICY,
  PRIVACY_POLICY: koPolicies.PRIVACY_POLICY,
};

import { en } from "./en";
import { th } from "./th";
import { vi } from "./vi";
import { zh } from "./zh";

const CONTENT: Record<Locale, Content> = { ko, en, th, vi, zh };

export function getContent(locale: Locale): Content {
  return CONTENT[locale] ?? ko;
}

export type { PolicySection } from "./ko/policies";
