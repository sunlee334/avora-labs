/**
 * 새 주문 알림 인터페이스.
 *
 * 결제 어댑터와 같은 모양입니다. 채널(웹훅·이메일·메신저)이 바뀌어도
 * 주문 처리 코드는 바뀌지 않도록 이 인터페이스 뒤에 둡니다.
 *
 * 알림은 **주문을 방해해서는 안 됩니다.** 고객 입장에서 결제는 이미 끝났고,
 * 판매자에게 알리는 일은 그 뒤의 이야기입니다. Slack 이 죽었다고 결제 완료
 * 화면이 오류를 보이면 안 됩니다. 그래서 호출부는 waitUntil 로 응답 뒤에
 * 돌리고, 실패는 로그로만 남깁니다.
 */

/** 알림에 담을 주문 요약. */
export interface OrderNotification {
  orderId: string;
  amount: number;
  currency: string;
  items: Array<{ name: string; qty: number }>;
  recipientName: string;
  /** 관리 화면의 이 주문 링크 — 알림에서 한 번에 넘어가기 위한 것 */
  adminUrl: string | null;
  paidAt: string;
}

export interface NotifyResult {
  ok: boolean;
  error?: string;
}

export interface Notifier {
  readonly name: string;
  /** 이 채널이 동작하는 데 필요한 설정이 환경에 들어 있는지 */
  isConfigured(env: Record<string, unknown>): boolean;
  send(notification: OrderNotification, env: Record<string, unknown>): Promise<NotifyResult>;
}
