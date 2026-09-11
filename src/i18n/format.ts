import { LOCALE_META, type Locale } from "./config";

const TIME_ZONE = "Asia/Seoul";

/** 원화 표기. 한국어는 "32,000원", 그 외는 "₩32,000". 통화는 어느 언어에서나 KRW 다. */
export function formatPrice(value: number, locale: Locale): string {
  if (locale === "ko") return `${value.toLocaleString("ko-KR")}원`;
  return `₩${value.toLocaleString("en-US")}`;
}

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLocalDate(value: DateInput, locale: Locale): string {
  const date = toDate(value);
  if (!date) return "-";
  return date.toLocaleDateString(LOCALE_META[locale].intl, { dateStyle: "medium", timeZone: TIME_ZONE });
}

export function formatLocalDateTime(value: DateInput, locale: Locale): string {
  const date = toDate(value);
  if (!date) return "-";
  return date.toLocaleString(LOCALE_META[locale].intl, { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE });
}

/** "{name}" 형태의 자리표시자를 채운다. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (Object.hasOwn(vars, key) ? String(vars[key]) : `{${key}}`));
}
