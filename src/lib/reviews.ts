import { ACTIVITY_TAGS, type ActivityTag } from "@/lib/config";
import type { Messages } from "@/i18n/messages";

/**
 * 리뷰 사진은 JSON 배열 문자열로 저장한다. 업로드 API 경로만 통과시켜
 * 외부 URL 이 렌더링되지 않게 한다.
 */
export function parseReviewPhotos(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === "string" && item.startsWith("/api/uploads/"),
    );
  } catch {
    return [];
  }
}

export function isActivityTag(tag: string): tag is ActivityTag {
  return Object.hasOwn(ACTIVITY_TAGS, tag);
}

/** 활동 태그 라벨. 알 수 없는 태그는 원문 그대로 보여준다. */
export function activityLabel(tag: string): string {
  return isActivityTag(tag) ? ACTIVITY_TAGS[tag] : tag;
}

/** 스토어 화면용: 현재 언어 사전의 활동 태그 라벨. 알 수 없는 태그는 그대로 보여준다. */
export function localizedActivityLabel(m: Messages, tag: string): string {
  return isActivityTag(tag) ? m.activity[tag] : tag;
}
