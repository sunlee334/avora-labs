/**
 * drizzle/libsql 은 원본 SQLite 오류를 `cause` 체인으로 감싼다.
 * "UNIQUE constraint failed: <table>.<column>" 를 체인을 따라가며 찾는다.
 * hint 를 주면 해당 테이블·컬럼 이름이 포함된 경우에만 true.
 */
export function isUniqueViolation(error: unknown, hint?: string): boolean {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 6; depth += 1) {
    const message = current.message;
    if (message.includes("UNIQUE constraint failed")) {
      return hint ? message.includes(hint) : true;
    }
    current = (current as Error & { cause?: unknown }).cause;
  }
  return false;
}
