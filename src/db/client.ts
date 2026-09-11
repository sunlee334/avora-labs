import { createDb, getDb, type Database } from "paros-db-driver";
import * as schema from "./schema";

export type { Database };
export { createDb, schema };

/**
 * 요청 시점에 드라이버가 고른 DB 인스턴스로 위임하는 프록시.
 * - Node: libsql(file:/Turso), globalThis 캐시
 * - Workers(CF_BUILD=1): D1 바인딩, 요청마다 getCloudflareContext() 로 조회
 * 모듈 로드 시점(빌드·프리렌더)에는 DB 에 접근하지 않는다.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real as object, prop) as unknown;
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(real);
    }
    return value;
  },
});
