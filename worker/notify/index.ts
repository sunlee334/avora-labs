/**
 * 새 주문 알림 — 언제 보내고, 어떻게 실패하는가.
 *
 * **언제 보내는가:** 결제가 실제로 성사된 순간에만 보냅니다. 주문이 만들어진
 * 순간이 아닙니다. 체크아웃까지 왔다가 결제창에서 그만두는 사람이 훨씬 많고,
 * 그걸 다 알리면 판매자에게 오는 알림 대부분이 처리할 일이 없는 알림이 됩니다.
 * 발송할 것이 생긴 순간이 알릴 순간입니다.
 *
 * **어떻게 실패하는가:** 조용히 실패합니다. 고객은 이미 결제를 마쳤고, Slack 이
 * 죽은 것은 고객의 문제가 아닙니다. 알림 실패로 결제 완료 화면에 오류가
 * 뜨는 일은 없어야 합니다. 그래서 waitUntil 로 응답 뒤에 돌리고, 실패는
 * console.error 로만 남깁니다(Workers 관측성에서 보입니다).
 *
 * 대신 알림이 안 왔다고 주문이 사라지는 것은 아닙니다 — 주문은 D1 에 있고
 * 관리 화면에서 보입니다. 알림은 편의이지 유일한 통로가 아닙니다.
 */
import { webhookNotifier } from './webhook';
import { emailNotifier } from './email';
import type { Notifier, OrderNotification } from './types';
import type { OrderRecord } from '../orders';

/**
 * 설정된 채널로 모두 보냅니다.
 *
 * 하나만 고르게 하지 않은 이유: 웹훅은 즉시 눈에 띄고 이메일은 기록으로
 * 남아, 둘의 쓸모가 다릅니다. 설정하지 않은 채널은 조용히 건너뜁니다.
 */
const NOTIFIERS: Notifier[] = [webhookNotifier, emailNotifier];

export function toNotification(order: OrderRecord, adminUrl: string | null): OrderNotification {
  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    items: order.items.map((item) => ({ name: item.name, qty: item.qty })),
    recipientName: order.recipientName,
    adminUrl,
    paidAt: order.paidAt ?? new Date().toISOString(),
  };
}

/**
 * 알림을 보냅니다. **이 함수는 절대 throw 하지 않습니다.**
 * 호출부가 try/catch 를 잊어도 주문 처리가 깨지지 않아야 하기 때문입니다.
 */
export async function notifyNewOrder(
  notification: OrderNotification,
  env: Record<string, unknown>,
): Promise<void> {
  const active = NOTIFIERS.filter((n) => {
    try {
      return n.isConfigured(env);
    } catch {
      return false;
    }
  });

  if (active.length === 0) return;

  await Promise.all(
    active.map(async (notifier) => {
      try {
        const result = await notifier.send(notification, env);
        if (!result.ok) {
          console.error('주문 알림 실패', {
            channel: notifier.name,
            orderId: notification.orderId,
            error: result.error,
          });
        }
      } catch (cause) {
        console.error('주문 알림 중 예외', {
          channel: notifier.name,
          orderId: notification.orderId,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }),
  );
}
