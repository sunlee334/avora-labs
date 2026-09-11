import { afterEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { CRON_STALE_AFTER_MS, CRON_STATE_KEYS, getOpsState, setOpsState, summarizeCron } from "@/lib/ops-state";
import { installTestDb, uninstallTestDb } from "../helpers/db";

let client: Client | undefined;

afterEach(() => {
  uninstallTestDb();
  client?.close();
  client = undefined;
});

describe("ops_state cron heartbeat", () => {
  it("upserts keys and summarizes lag/staleness for the health check", async () => {
    const handle = await installTestDb();
    client = handle.client;
    const db = handle.db;
    const t0 = new Date("2026-09-12T00:00:00Z");

    // 아직 기록이 없으면 stale 이 아니다 (첫 배포 직후)
    expect(summarizeCron(await getOpsState(db, CRON_STATE_KEYS), t0)).toMatchObject({ maintenanceAt: null, lagMinutes: null, stale: false });

    await setOpsState(db, "cron:maintenance", t0.toISOString(), t0);
    await setOpsState(db, "cron:pending", t0.toISOString(), t0);
    // 같은 키를 다시 쓰면 덮어쓴다 (PRIMARY KEY 충돌 없이)
    const t1 = new Date(t0.getTime() + 30 * 60_000);
    await setOpsState(db, "cron:maintenance", t1.toISOString(), t1);

    const state = await getOpsState(db, CRON_STATE_KEYS);
    expect(Object.keys(state).sort()).toEqual(["cron:maintenance", "cron:pending"]);
    expect(state["cron:maintenance"].value).toBe(t1.toISOString());

    const fresh = summarizeCron(state, new Date(t1.getTime() + 10 * 60_000));
    expect(fresh).toMatchObject({ maintenanceAt: t1.toISOString(), pendingAt: t0.toISOString(), dailyAt: null, lagMinutes: 10, stale: false });

    const late = summarizeCron(state, new Date(t1.getTime() + CRON_STALE_AFTER_MS + 60_000));
    expect(late.stale).toBe(true);
    expect(late.lagMinutes).toBe(91);
  });
});
