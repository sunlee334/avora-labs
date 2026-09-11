import "server-only";
import { and, asc, eq, lte } from "drizzle-orm";
import { affectedRows } from "@/db/affected";
import { db } from "@/db/client";
import { notifications, type Notification } from "@/db/schema";
import { isLocale } from "@/i18n/config";
import { opsAlert } from "@/lib/ops-alert";
import { maskEmail, sendEmail, sendSms } from "./providers";
import { renderTemplate, type NotificationTemplate, type TemplatePayload } from "./templates";

export const MAX_ATTEMPTS = 5;
const BACKOFF_MS = 30 * 60 * 1000;
const DEFAULT_LIMIT = 50;

export interface DispatchSummary {
  picked: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * 발송 대기열 처리. cron(30분)이 부른다.
 * - 도래한 queued 행을 골라 attempts 를 조건부로 올린다 (동시에 두 실행이 같은 행을 잡지 않도록).
 * - 성공 → sent, 어댑터 없음/재시도 불가 → skipped/failed, 일시 오류 → queued 유지 + 30분 × 시도 횟수 뒤로 미룸.
 * - 5회 실패하면 failed 로 닫고 알림을 남긴다.
 */
export async function runNotificationDispatch(opts: { now?: Date; limit?: number } = {}): Promise<DispatchSummary> {
  const now = opts.now ?? new Date();
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, 200));
  const summary: DispatchSummary = { picked: 0, sent: 0, skipped: 0, failed: 0 };

  const due = await db.query.notifications.findMany({
    where: and(eq(notifications.status, "queued"), lte(notifications.sendAfter, now)),
    orderBy: [asc(notifications.sendAfter), asc(notifications.id)],
    limit,
  });

  for (const row of due) {
    // 같은 행을 다른 실행이 먼저 잡았으면(attempts 가 이미 올라갔으면) 건너뛴다.
    const claimed = await db
      .update(notifications)
      .set({ attempts: row.attempts + 1 })
      .where(and(eq(notifications.id, row.id), eq(notifications.status, "queued"), eq(notifications.attempts, row.attempts)))
      .run();
    if (affectedRows(claimed) === 0) continue;
    summary.picked += 1;
    const attempt = row.attempts + 1;

    if (attempt > MAX_ATTEMPTS) {
      await close(row, "failed", "max_attempts");
      summary.failed += 1;
      await opsAlert("notify.send_failed", { id: row.id, template: row.template, recipient: maskEmail(row.recipient), error: "max_attempts" }, { level: "warn" });
      continue;
    }

    const result = await deliver(row);
    if (result.ok) {
      await db
        .update(notifications)
        .set({ status: "sent", sentAt: now, lastError: null })
        .where(eq(notifications.id, row.id));
      summary.sent += 1;
      continue;
    }

    if (result.error === "no_provider") {
      await close(row, "skipped", result.error);
      summary.skipped += 1;
      continue;
    }

    if (result.retryable && attempt < MAX_ATTEMPTS) {
      await db
        .update(notifications)
        .set({ lastError: result.error, sendAfter: new Date(now.getTime() + BACKOFF_MS * attempt) })
        .where(eq(notifications.id, row.id));
      continue;
    }

    await close(row, "failed", result.error);
    summary.failed += 1;
    await opsAlert("notify.send_failed", { id: row.id, template: row.template, recipient: maskEmail(row.recipient), error: result.error, attempt }, { level: "warn" });
  }

  console.log(JSON.stringify({ level: "info", event: "notify.dispatch", ...summary }));
  return summary;
}

async function close(row: Notification, status: "failed" | "skipped", error: string): Promise<void> {
  await db.update(notifications).set({ status, lastError: error }).where(eq(notifications.id, row.id));
}

async function deliver(row: Notification) {
  let payload: TemplatePayload = {};
  try {
    const parsed: unknown = JSON.parse(row.payload);
    if (parsed && typeof parsed === "object") payload = parsed as TemplatePayload;
  } catch {
    // 손상된 payload 는 빈 값으로 렌더링한다 (템플릿에 자리표시자가 남을 수 있지만 발송은 막지 않는다).
  }
  const locale = isLocale(row.locale) ? row.locale : "ko";
  const { subject, text } = renderTemplate(row.template as NotificationTemplate, locale, payload);
  if (row.channel === "email") return sendEmail({ to: row.recipient, subject, text });
  return sendSms();
}
