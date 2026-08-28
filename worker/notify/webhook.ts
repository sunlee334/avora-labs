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

/**
 * Slack 이 제어 문법으로 읽는 세 글자를 무력화합니다.
 *
 * Slack 의 mrkdwn 은 `<!channel>` 을 전체 멘션으로, `<주소|보이는글자>` 를
 * 링크로 해석합니다. 받는 분 이름은 인증 없이 누구나 주문 API 로 넣을 수 있는
 * 문자열이라, 그대로 흘려보내면 고객이 판매자 채널 전체를 호출하거나
 * 알림 안에 가짜 링크를 심을 수 있습니다.
 *
 * 공식 권고대로 & < > 만 엔티티로 바꿉니다. 순서가 중요합니다 — & 를 먼저
 * 바꾸지 않으면 뒤이어 만든 &lt; 의 & 가 다시 치환됩니다.
 */
function escapeSlack(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function composeMessage(n: OrderNotification, escape: (v: string) => string = (v) => v): string {
  const items = n.items.map((i) => `${escape(i.name)} × ${i.qty}`).join(', ');
  const lines = [
    '🧾 새 주문',
    `${n.orderId}`,
    `${items} — ${money(n.amount, n.currency)}`,
    `받는 분: ${escape(n.recipientName)}`,
  ];
  // 관리 화면 주소는 우리가 만든 값이라 그대로 둡니다.
  if (n.adminUrl) lines.push(n.adminUrl);
  return lines.join('\n');
}

/** 웹훅이 설정돼 있는가. 주문·문의 양쪽이 같은 판정을 씁니다. */
export function webhookConfigured(env: Record<string, unknown>): boolean {
  return typeof env.NOTIFY_WEBHOOK_URL === 'string' && env.NOTIFY_WEBHOOK_URL.length > 0;
}

/**
 * 채널로 한 줄 보냅니다 — 무엇을 보내는지는 부르는 쪽이 정합니다.
 *
 * 여기 있는 것은 **전송 방식**뿐입니다: Slack 과 Discord 의 본문 키가 다르고,
 * 이스케이프 방식도 다릅니다. 그 갈림을 두 곳에서 되풀이하지 않으려고
 * 문구가 아니라 **문구를 만드는 함수**를 받습니다 — 어떤 이스케이프를 써야
 * 하는지는 URL 을 봐야 알 수 있기 때문입니다.
 */
export async function postWebhook(
  compose: (escape: (v: string) => string) => string,
  env: Record<string, unknown>,
): Promise<NotifyResult> {
  const url = env.NOTIFY_WEBHOOK_URL as string;
  const discord = isDiscord(url);

  // Slack 은 엔티티로 막고, Discord 는 엔티티를 그대로 글자로 보여주므로
  // 대신 멘션 자체를 끕니다. allowed_mentions 를 비우면 @everyone 을 포함해
  // 어떤 멘션도 알림을 울리지 않습니다.
  const message = compose(discord ? (v) => v : escapeSlack);
  const body = discord
    ? { content: message, allowed_mentions: { parse: [] as string[] } }
    : { text: message };

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
}

export const webhookNotifier: Notifier = {
  name: 'webhook',
  isConfigured: webhookConfigured,
  send(notification, env): Promise<NotifyResult> {
    return postWebhook((escape) => composeMessage(notification, escape), env);
  },
};
