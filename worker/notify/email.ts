/**
 * 이메일 알림 — Cloudflare Email Routing.
 *
 * ⚠️ 아직 실제로 발송해 본 적이 없는 코드입니다.
 *
 * 공식 문서 기준으로 두 가지 전제가 필요합니다.
 *   1. 보내는 주소가 Cloudflare 에 등록된 도메인이어야 합니다.
 *   2. 받는 주소가 Email Routing 에서 인증(verified)된 주소여야 합니다.
 *
 * 도메인이 아직 확정되지 않았으므로(Round 12) 지금은 두 전제를 만족할 수
 * 없습니다. 그래서 이 어댑터는 자리만 잡아 두고, send_email 바인딩이
 * 없으면 스스로 "설정되지 않음" 으로 물러납니다. wrangler.jsonc 의 바인딩도
 * 주석으로 두었습니다 — 등록되지 않은 도메인으로 바인딩을 걸면 배포가
 * 깨지기 때문입니다.
 *
 * 도메인이 정해지면 README 의 순서대로 켜면 됩니다. 그때 실제 발송을 한 번
 * 확인하기 전까지는 "된다" 고 말하지 마세요.
 *
 * 인증된 주소로 보내는 것은 요금제와 무관하게 무료이며 발송 한도에도
 * 포함되지 않습니다(공식 문서).
 */
import type { Notifier, OrderNotification, NotifyResult } from './types';
import { composeMessage } from './webhook';

interface EmailBinding {
  send(message: unknown): Promise<void>;
}

/**
 * 제목에 한글이 들어가므로 RFC 2047 encoded-word 로 감쌉니다.
 * 이걸 하지 않으면 메일 클라이언트에 제목이 깨져 보입니다.
 */
function encodeHeader(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

/**
 * 최소한의 RFC 5322 메시지.
 *
 * mimetext 같은 라이브러리를 쓸 수도 있지만, 평문 한 통을 보내려고
 * 의존성을 하나 늘릴 만한 일은 아닙니다. 본문은 base64 로 감싸
 * 줄 길이 제한과 한글 인코딩 문제를 함께 피합니다.
 */
function buildMime(from: string, to: string, subject: string, body: string): string {
  const bytes = new TextEncoder().encode(body);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/(.{76})/g, '$1\r\n');

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encoded,
  ].join('\r\n');
}

export const emailNotifier: Notifier = {
  name: 'email',

  isConfigured(env) {
    return (
      typeof env.NOTIFY_EMAIL_FROM === 'string' &&
      typeof env.NOTIFY_EMAIL_TO === 'string' &&
      !!env.NOTIFY_EMAIL_FROM &&
      !!env.NOTIFY_EMAIL_TO &&
      // 바인딩이 없으면 코드가 있어도 보낼 수 없습니다.
      typeof (env.SEND_EMAIL as EmailBinding | undefined)?.send === 'function'
    );
  },

  async send(notification: OrderNotification, env): Promise<NotifyResult> {
    const from = env.NOTIFY_EMAIL_FROM as string;
    const to = env.NOTIFY_EMAIL_TO as string;

    try {
      // EmailMessage 는 Workers 런타임이 제공하는 모듈이라 npm 의존성이 없습니다.
      const { EmailMessage } = (await import('cloudflare:email')) as {
        EmailMessage: new (from: string, to: string, raw: string) => unknown;
      };

      const raw = buildMime(
        from,
        to,
        `[AVORA] 새 주문 ${notification.orderId}`,
        composeMessage(notification),
      );

      await (env.SEND_EMAIL as EmailBinding).send(new EmailMessage(from, to, raw));
      return { ok: true };
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
    }
  },
};
