/**
 * 운영 알림. 결제·재고처럼 사람이 확인해야 하는 이상 상황을 한 형식의 로그로 남기고,
 * `OPS_ALERT_WEBHOOK_URL` 이 설정돼 있으면 Slack/Discord 호환 웹훅(`{ text }`)으로도 보낸다.
 *
 * - 로그는 JSON 한 줄(`{"level":"alert","event":...}`)이라 Workers Logs 에서 `event` 로 검색·필터할 수 있다.
 * - 웹훅 전송 실패는 삼킨다. 알림 때문에 결제 흐름이 실패해서는 안 된다.
 * - `server-only` 를 걸지 않는다: Next 서버 코드와 Workers cron(worker.ts) 양쪽에서 쓴다. 클라이언트에서 import 하지 말 것.
 */

const WEBHOOK_TIMEOUT_MS = 3_000;
/** 같은 이벤트·같은 대상(주문번호 등)은 이 시간 안에 웹훅을 다시 보내지 않는다 (로그는 항상 남긴다). isolate 단위 근사치. */
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;
const recentWebhooks = new Map<string, number>();

function dedupeKey(event: string, detail: Record<string, unknown>): string {
  const subject = detail.order ?? detail.orderNumber ?? detail.orderId ?? detail.paymentKey ?? "";
  return `${event}:${String(subject)}`;
}

function shouldSendWebhook(key: string, now: number): boolean {
  if (recentWebhooks.size > 500) recentWebhooks.clear();
  const last = recentWebhooks.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
  recentWebhooks.set(key, now);
  return true;
}

export type OpsAlertLevel = "warn" | "error";

export interface OpsAlertOptions {
  level?: OpsAlertLevel;
  /** 기본값은 process.env.OPS_ALERT_WEBHOOK_URL. Workers cron 처럼 env 를 직접 받는 곳에서 넘긴다. */
  webhookUrl?: string | null;
}

/**
 * 로그에 실을 수 있는 형태로 줄인다. 오류는 이름·메시지만 남기고(스택·SQL 바인딩·헤더 제외),
 * 객체는 통째로 덤프하지 않는다 — 드라이버 오류 객체에 이메일·주소 같은 바인딩 값이 섞여 들어오는 것을 막는다.
 */
function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    const code = (value as { code?: unknown }).code;
    return {
      name: value.name,
      ...(typeof code === "string" ? { code } : {}),
      message: value.message.slice(0, 300),
    };
  }
  if (typeof value === "string") return value.slice(0, 300);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
  return `[${typeof value}]`;
}

export async function opsAlert(
  event: string,
  detail: Record<string, unknown> = {},
  options: OpsAlertOptions = {},
): Promise<void> {
  const level = options.level ?? "error";
  const payload = {
    level: "alert",
    severity: level,
    event,
    at: new Date().toISOString(),
    ...Object.fromEntries(Object.entries(detail).map(([k, v]) => [k, serialize(v)])),
  };
  const line = JSON.stringify(payload);
  if (level === "warn") console.warn(line);
  else console.error(line);

  const url = options.webhookUrl ?? process.env.OPS_ALERT_WEBHOOK_URL;
  if (!url) return;
  if (!shouldSendWebhook(dedupeKey(event, detail), Date.now())) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const summary = Object.entries(detail)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => {
        if (v instanceof Error) {
          const code = (v as { code?: unknown }).code;
          return `${k}=${v.name}${typeof code === "string" ? `/${code}` : ""}: ${v.message.slice(0, 160)}`;
        }
        return `${k}=${serialize(v)}`;
      })
      .join(" ");
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[PAROS ${level.toUpperCase()}] ${event} ${summary}`.trim() }),
      signal: controller.signal,
    });
  } catch (error) {
    // 오류 메시지에 웹훅 URL(그 자체가 비밀값)이 섞일 수 있으므로 종류만 남긴다.
    console.error(
      JSON.stringify({
        level: "alert",
        event: "ops_alert.webhook_failed",
        cause: error instanceof Error ? error.name : typeof error,
      }),
    );
  } finally {
    clearTimeout(timer);
  }
}
