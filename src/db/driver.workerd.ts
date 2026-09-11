import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * Cloudflare Workers 드라이버(운영). wrangler.jsonc 의 D1 바인딩 `DB` 를 사용한다.
 * 쿼리 API 는 libsql 드라이버와 동일하므로 타입은 Node 드라이버와 같은 형태로 노출한다.
 * 주의: D1 은 BEGIN/COMMIT 트랜잭션을 지원하지 않는다. 원자성이 필요하면 `db.batch()` 를 쓴다.
 */
export type Database = LibSQLDatabase<typeof schema>;

/** drizzle 인스턴스는 바인딩 객체별로 한 번만 만든다 (요청마다 스키마 관계 파싱을 반복하지 않도록). */
const instances = new WeakMap<D1Database, Database>();

export function getDb(): Database {
  const { env } = getCloudflareContext();
  const binding = (env as { DB?: D1Database }).DB;
  if (!binding) {
    throw new Error("D1 binding `DB` 가 없습니다. wrangler.jsonc 의 d1_databases 를 확인하세요.");
  }
  let db = instances.get(binding);
  if (!db) {
    db = drizzle(binding, { schema }) as unknown as Database;
    instances.set(binding, db);
  }
  return db;
}

export function createDb(): never {
  throw new Error("createDb() 는 Node 런타임 전용입니다. Workers 에서는 getDb() 를 사용하세요.");
}
