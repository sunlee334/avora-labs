import { inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";

/**
 * 운영 상태 키-값 (`ops_state`). cron 이 마지막 성공 시각을 남기고 /api/health 가 읽는다.
 * Worker(cron) 와 Next(헬스체크) 양쪽에서 쓰므로 server-only 를 걸지 않는다. 클라이언트에서 import 하지 말 것.
 */
type OpsDb = LibSQLDatabase<typeof schema>;

export const CRON_STATE_KEYS = ["cron:maintenance", "cron:pending", "cron:daily", "cron:notifications"] as const;
export type CronStateKey = (typeof CRON_STATE_KEYS)[number];

/** 30분 cron 기준: 이 시간 넘게 maintenance 기록이 없으면 cron 이 멈춘 것으로 본다. */
export const CRON_STALE_AFTER_MS = 90 * 60 * 1000;

export async function setOpsState(db: OpsDb, key: string, value: string, now: Date = new Date()): Promise<void> {
  await db
    .insert(schema.opsState)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: schema.opsState.key, set: { value, updatedAt: now } });
}

export async function getOpsState(db: OpsDb, keys: readonly string[]): Promise<Record<string, { value: string; updatedAt: Date }>> {
  if (keys.length === 0) return {};
  const rows = await db.select().from(schema.opsState).where(inArray(schema.opsState.key, [...keys]));
  return Object.fromEntries(rows.map((r) => [r.key, { value: r.value, updatedAt: r.updatedAt }]));
}

/** 헬스체크용 요약: 각 cron 의 마지막 시각과 maintenance 기준 지연(분). */
export function summarizeCron(
  state: Record<string, { value: string; updatedAt: Date }>,
  now: Date = new Date(),
): { maintenanceAt: string | null; pendingAt: string | null; dailyAt: string | null; notificationsAt: string | null; lagMinutes: number | null; stale: boolean } {
  const at = (k: CronStateKey) => state[k]?.value ?? null;
  const maintenance = state["cron:maintenance"]?.updatedAt ?? null;
  const lagMinutes = maintenance ? Math.max(0, Math.round((now.getTime() - maintenance.getTime()) / 60_000)) : null;
  return {
    maintenanceAt: at("cron:maintenance"),
    pendingAt: at("cron:pending"),
    dailyAt: at("cron:daily"),
    notificationsAt: at("cron:notifications"),
    lagMinutes,
    // 기록이 아직 없으면(첫 배포 직후) stale 로 보지 않는다 — 첫 cron 이 돌면 값이 생긴다.
    stale: maintenance !== null && now.getTime() - maintenance.getTime() > CRON_STALE_AFTER_MS,
  };
}
