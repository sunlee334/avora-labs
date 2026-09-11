import { DEFAULT_LOCALE } from "@/i18n/config";
import { formatLocalDate, formatLocalDateTime } from "@/i18n/format";

/**
 * 관리자 화면·운영 로그용 날짜 표기(한국어 고정, Asia/Seoul). 구현은 `src/i18n/format.ts` 하나뿐이다.
 */
type DateInput = Parameters<typeof formatLocalDate>[0];

/** 날짜만 표시한다. 값이 없거나 잘못되면 "-". */
export function formatDate(value: DateInput): string {
  return formatLocalDate(value, DEFAULT_LOCALE);
}

/** 날짜와 시각을 함께 표시한다. 값이 없거나 잘못되면 "-". */
export function formatDateTime(value: DateInput): string {
  return formatLocalDateTime(value, DEFAULT_LOCALE);
}
