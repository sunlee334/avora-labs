/**
 * 발송 채널 어댑터. 이메일은 Resend HTTP API(RESEND_API_KEY + NOTIFY_FROM_EMAIL 이 있을 때만),
 * 문자·알림톡은 아직 대행사를 연동하지 않았다. 어댑터가 없으면 `no_provider` 로 돌려주고 호출부가 skipped 처리한다.
 * 로그에는 수신자 주소를 가린 형태(a***@domain)만 남기고, API 키는 어디에도 쓰지 않는다.
 */

export type SendResult = { ok: true; id?: string } | { ok: false; error: string; retryable: boolean };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 8_000;

export function maskEmail(address: string): string {
  const at = address.indexOf("@");
  if (at <= 0) return "***";
  return `${address[0]}***@${address.slice(at + 1)}`;
}

export function isEmailProviderConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM_EMAIL);
}

export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, error: "no_provider", retryable: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
      signal: controller.signal,
    });
    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as { id?: string };
      return { ok: true, id: typeof body.id === "string" ? body.id : undefined };
    }
    // 429·5xx 는 잠시 뒤 다시 시도할 수 있다. 그 외 4xx(잘못된 발신 주소·수신 주소 등)는 재시도해도 같다.
    const retryable = response.status === 429 || response.status >= 500;
    return { ok: false, error: `resend_http_${response.status}`, retryable };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, error: aborted ? "timeout" : "network", retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

// 알림톡·문자 대행사 미연동. 연동 시 여기만 채우면 대기열·템플릿은 그대로 쓴다.
export async function sendSms(): Promise<SendResult> {
  return { ok: false, error: "no_provider", retryable: false };
}
