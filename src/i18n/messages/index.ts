import type { Locale } from "../config";
import { ko } from "./ko";
import { en } from "./en";
import { th } from "./th";
import { vi } from "./vi";
import { zh } from "./zh";

/** 한국어 원본의 형태. 리터럴은 string 으로 넓혀 번역본이 같은 키에 다른 문장을 넣을 수 있게 한다. */
export type Messages = DeepString<typeof ko>;

type DeepString<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly DeepString<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepString<T[K]> }
      : T;

const MESSAGES: Record<Locale, Messages> = { ko, en, th, vi, zh };

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale] ?? ko;
}
