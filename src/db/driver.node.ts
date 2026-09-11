import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * Node 런타임 드라이버(로컬 개발·테스트·스크립트).
 * 로컬은 file: URL(자격증명 불필요), 원격 libsql(Turso)은 DATABASE_URL + DATABASE_AUTH_TOKEN.
 * Cloudflare Workers 빌드(CF_BUILD=1)에서는 next.config 의 alias 로 driver.workerd.ts 가 대신 사용된다.
 */
export type Database = LibSQLDatabase<typeof schema>;

const DEFAULT_URL = "file:./data/paros.db";

declare global {
  var __parosDb: { client: Client; db: Database } | undefined;
}

export function createDb(url = process.env.DATABASE_URL ?? DEFAULT_URL): {
  client: Client;
  db: Database;
} {
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const db = drizzle(client, { schema });
  return { client, db };
}

/** dev HMR 시 커넥션이 중복 생성되지 않도록 globalThis 에 캐시한다. */
export function getDb(): Database {
  if (!globalThis.__parosDb) {
    globalThis.__parosDb = createDb();
  }
  return globalThis.__parosDb.db;
}
