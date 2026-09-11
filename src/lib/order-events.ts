import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";

/**
 * 주문 상태 변경 이력. `@/db/client` 프록시와 cron(worker.ts)의 D1 인스턴스 양쪽에서 쓰므로 DB 를 인자로 받고,
 * `server-only`·경로 별칭을 쓰지 않는다 (order-maintenance.ts 와 같은 규칙).
 */
type Db = LibSQLDatabase<typeof schema>;

export type OrderEventActor = "customer" | "admin" | "toss" | "system";

export interface OrderEventInput {
  orderId: number;
  from: string | null;
  to: string;
  actor: OrderEventActor;
  reason?: string | null;
  /** 어느 경로에서 났는지: confirm | fail-url | admin-ui | customer-ui | webhook | cron | daily | reconcile */
  source?: string | null;
}

export async function insertOrderEvent(db: Db, input: OrderEventInput): Promise<void> {
  await db.insert(schema.orderEvents).values({
    orderId: input.orderId,
    fromStatus: input.from,
    toStatus: input.to,
    actor: input.actor,
    reason: (input.reason ?? "").slice(0, 300),
    source: input.source ?? null,
  });
}

/** 이력 기록 실패가 본 처리(결제·취소)를 되돌려서는 안 되므로 삼키고 로그만 남긴다. */
export async function recordOrderEvent(db: Db, input: OrderEventInput): Promise<void> {
  try {
    await insertOrderEvent(db, input);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "order_event.insert_failed",
        orderId: input.orderId,
        to: input.to,
        cause: error instanceof Error ? error.message.slice(0, 200) : String(error),
      }),
    );
  }
}
