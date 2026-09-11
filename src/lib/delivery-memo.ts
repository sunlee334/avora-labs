import type { Messages } from "@/i18n/messages";

/** 저장된 배송 메모(고정 키 또는 예전 자유 문구)를 현재 언어 문구로 보여준다. 서버·클라이언트 공용. */
export function deliveryMemoText(m: Messages, memo: string | null | undefined): string {
  if (!memo) return "";
  return Object.hasOwn(m.checkout.deliveryMemos, memo)
    ? m.checkout.deliveryMemos[memo as keyof typeof m.checkout.deliveryMemos]
    : memo;
}
