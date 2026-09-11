import "server-only";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;

/**
 * Cloudflare Turnstile 봇 확인. 사이트 키(NEXT_PUBLIC_TURNSTILE_SITE_KEY)와 시크릿(TURNSTILE_SECRET_KEY)이
 * 둘 다 있을 때만 켜진다. 하나라도 없으면 위젯도 검증도 없이 예전과 똑같이 동작한다 — 키 두 개만 넣으면 켜진다.
 */
export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
}

/**
 * 폼이 보낸 토큰(`cf-turnstile-response`)을 Cloudflare 에 확인한다.
 * 비활성 상태면 항상 true. 켜져 있는데 토큰이 없거나, 확인 실패·네트워크 오류·타임아웃이면 false (fail-closed).
 * 토큰과 시크릿은 로그에 남기지 않는다.
 */
export async function verifyTurnstileToken(token: string | null, remoteIp: string | null): Promise<boolean> {
  if (!isTurnstileEnabled()) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY as string, response: token });
  if (remoteIp && remoteIp !== "local") body.set("remoteip", remoteIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body, signal: controller.signal });
    if (!response.ok) {
      console.warn(JSON.stringify({ level: "warn", event: "turnstile.verify_failed", status: response.status }));
      return false;
    }
    const data = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success !== true) {
      console.warn(JSON.stringify({ level: "warn", event: "turnstile.rejected", codes: data["error-codes"] ?? [] }));
      return false;
    }
    return true;
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "turnstile.verify_failed",
        cause: error instanceof Error ? error.name : String(error),
      }),
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
