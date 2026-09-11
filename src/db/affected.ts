/**
 * drizzle `.run()`/`batch()` 결과에서 영향받은 행 수를 읽는다.
 * libsql(ResultSet.rowsAffected)과 Cloudflare D1(D1Result.meta.changes)을 모두 지원한다.
 */
export function affectedRows(result: unknown): number {
  if (result && typeof result === "object") {
    const r = result as { rowsAffected?: number; meta?: { changes?: number } };
    if (typeof r.rowsAffected === "number") return r.rowsAffected;
    if (typeof r.meta?.changes === "number") return r.meta.changes;
  }
  return 0;
}
