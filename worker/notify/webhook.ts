/**
 * 웹훅 알림 — Slack · Discord · 구글 챗 · 카카오워크.
 *
 * 도메인 없이 오늘 바로 동작하고 비용이 들지 않아, 첫 알림 채널로 골랐습니다.
 * 필요한 것은 웹훅 URL 하나뿐입니다.
 *
 * 본문 모양이 서비스마다 다릅니다. Discord 는 `content`, 나머지는 `text` 를
 * 씁니다. URL 호스트를 보고 갈라 보냅니다 — 두 키를 다 넣어 보내는 방법도
 * 있지만, 어느 쪽이 실제로 쓰였는지 나중에 알 수 없게 됩니다.
 *
 * 개인정보는 최소한만 담습니다. 웹훅이 닿는 곳은 채팅방이고, 채팅방은
 * 관리 화면과 달리 Access 뒤에 있지 않습니다. 그래서 주소와 연락처는
 * 넣지 않고, 필요하면 관리 화면 링크를 눌러 보게 합니다.
 */
import type { Notifier, OrderNotification, NotifyResult } from './types';

const DISCORD_HOSTS = new Set(['discord.com', 'discordapp.com', 'ptb.discord.com']);

function isDiscord(url: string): boolean {
  try {
    return DISCORD_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // 알 수 없는 통화 코드가 저장돼 있어도 알림은 나가야 합니다.
    return `${amount.toLocaleString('ko-KR')} ${currency}`;
  }
}

export function composeMessage(n: OrderNotification): string {
  const items = n.items.map((i) => `${i.name} × ${i.qty}`).join(', ');
  const lines = [
    '🧾 새 주문',
    `${n.orderId}`,
    `${items} — ${money(n.amount, n.currency)}`,
    `받는 분: ${n.recipientName}`,
  ];
  if (n.adminUrl) lines.push(n.adminUrl);
  return lines.join('\n');
}

export const webhookNotifier: Notifier = {
  name: 'webhook',

  isConfigured(env) {
    return typeof env.NOTIFY_WEBHOOK_URL === 'string' && env.NOTIFY_WEBHOOK_URL.length > 0;
  },

  async send(notification, env): Promise<NotifyResult> {
    const url = env.NOTIFY_WEBHOOK_URL as string;
    const message = composeMessage(notification);
    const body = isDiscord(url) ? { content: message } : { text: message };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
    }

    if (!response.ok) {
      // 본문을 읽어 로그에 남깁니다 — Slack 은 왜 거절했는지 평문으로 알려줍니다.
      const detail = await response.text().catch(() => '');
      return { ok: false, error: `HTTP ${response.status} ${detail}`.trim() };
    }

    return { ok: true };
  },
};
