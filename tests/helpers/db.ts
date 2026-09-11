import { createDb, type Database } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { seedBase } from "@/db/seed";
import type { Client } from "@libsql/client";

/**
 * 테스트용 인메모리 DB. 마이그레이션을 적용하고, 필요하면 기본 시드까지 채운다.
 * 각 테스트는 독립된 :memory: DB 인스턴스를 사용하므로 격리가 보장된다.
 */
export async function withTestDb(
  options: { seed?: boolean } = {},
): Promise<{ db: Database; client: Client }> {
  const { db, client } = createDb(":memory:");
  await runMigrations(db);
  if (options.seed) {
    await seedBase(db);
  }
  return { db, client };
}

/**
 * `@/db/client` 의 `db` 프록시가 이 테스트 DB 를 쓰도록 Node 드라이버의 globalThis 캐시에 꽂는다.
 * checkout·coupons·order-admin 처럼 `db` 를 직접 import 하는 서버 모듈을 mock 없이 테스트할 때 쓴다.
 * 테스트가 끝나면 반드시 `uninstallTestDb()` 로 정리한다.
 */
export async function installTestDb(
  options: { seed?: boolean } = {},
): Promise<{ db: Database; client: Client }> {
  const handle = await withTestDb(options);
  globalThis.__parosDb = handle;
  return handle;
}

export function uninstallTestDb(): void {
  globalThis.__parosDb?.client.close();
  globalThis.__parosDb = undefined;
}
