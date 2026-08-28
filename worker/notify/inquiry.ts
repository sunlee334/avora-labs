/**
 * 새 문의 알림.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────
 * 문의는 **비공개**라 검색 유입에 기여하지 않습니다. 목적이 오직 하나 —
 * 이미 온 사람에게 답하는 것입니다. 답이 늦으면 존재 이유가 사라집니다.
 * 그런데 관리 화면은 누가 열어 보기 전까지 아무 말도 하지 않습니다.
 *
 * ── 무엇을 담지 않는가 ─────────────────────────────────────
 * **제목도 본문도 담지 않습니다.**
 *
 * 웹훅이 닿는 곳은 채팅방이고, 채팅방은 관리 화면과 달리 Cloudflare Access
 * 뒤에 있지 않습니다. 주문 알림이 주소와 연락처를 빼는 것과 같은 이유입니다
 * (`webhook.ts` 헤더).
 *
 * 다만 한 걸음 더 갑니다. 주문 알림은 받는 분 이름을 이스케이프해서 담는데,
 * 이름은 이름일 뿐입니다. 문의 제목은 **손님이 자기 문제를 서술한 문장**
 * 입니다 — "결제가 두 번 됐어요, 카드 끝자리 1234" 같은 것이 그대로 들어올
 * 수 있습니다. 그것을 채팅방에 흘리는 것과 이름을 흘리는 것은 다릅니다.
 *
 * 그리고 개인정보처리방침에 문의 내용을 외부 채널로 보낸다는 항목이
 * 없습니다. 담으려면 방침을 먼저 고쳐야 합니다.
 *
 * 담는 것은 셋뿐입니다 — 문의번호(우리가 만든 값) · 언어 · 관리 화면 링크.
 * 무엇을 물었는지는 링크를 눌러 Access 뒤에서 봅니다.
 *
 * ── 어떻게 실패하는가 ──────────────────────────────────────
 * 조용히 실패합니다. 손님은 이미 문의를 남겼고 그것은 D1 에 있습니다.
 * Slack 이 죽은 것이 손님의 문제가 되어서는 안 됩니다. 그래서 호출부가
 * `waitUntil` 로 응답 뒤에 돌리고, 이 함수는 **절대 throw 하지 않습니다.**
 */
import { postWebhook, webhookConfigured } from './webhook';

export interface InquiryNotification {
  inquiryId: string;
  locale: string;
  /** 로그인으로 남겼는지 주문번호로 남겼는지 — 어느 쪽에서 답할지 갈립니다. */
  via: 'account' | 'order';
  /** 관리 화면 링크 — 알림에서 한 번에 넘어가기 위한 것 */
  adminUrl: string | null;
}

const VIA_LABEL: Record<InquiryNotification['via'], string> = {
  account: '마이페이지',
  order: '주문조회',
};

export function composeInquiryMessage(
  n: InquiryNotification,
  escape: (v: string) => string = (v) => v,
): string {
  const lines = [
    '💬 새 문의',
    // 전부 우리가 만들거나 고른 값이지만, 이스케이프는 그대로 통과시킵니다 —
    // 나중에 손님이 쓴 값이 하나라도 끼면 여기가 이미 막고 있어야 합니다.
    escape(n.inquiryId),
    `${VIA_LABEL[n.via]} · ${escape(n.locale)}`,
  ];
  if (n.adminUrl) lines.push(n.adminUrl);
  return lines.join('\n');
}

/**
 * 문의 알림을 보냅니다. **이 함수는 절대 throw 하지 않습니다.**
 *
 * 이메일 채널은 쓰지 않습니다 — 문의는 "지금 답해야 할 일" 이라 눈에 띄는
 * 쪽이 맞고, 기록은 관리 화면과 D1 에 이미 남습니다.
 */
export async function notifyNewInquiry(
  notification: InquiryNotification,
  env: Record<string, unknown>,
): Promise<void> {
  try {
    if (!webhookConfigured(env)) return;
    const result = await postWebhook((escape) => composeInquiryMessage(notification, escape), env);
    if (!result.ok) {
      console.error('문의 알림 실패', {
        channel: 'webhook',
        inquiryId: notification.inquiryId,
        error: result.error,
      });
    }
  } catch (cause) {
    console.error('문의 알림 중 예외', {
      channel: 'webhook',
      inquiryId: notification.inquiryId,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
