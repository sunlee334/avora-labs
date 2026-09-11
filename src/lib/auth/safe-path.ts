/**
 * 로그인 후 이동할 `next` 값이 같은 오리진의 상대 경로인지 검증한다.
 * "/" 로 시작해야 하고, "//"·"\\"(브라우저가 "/"로 해석)·제어문자·스킴을 포함하면 거부한다.
 * URL 파서로 오리진이 바뀌지 않는지도 함께 확인한다.
 */
export function safeRelativePath(raw: string, fallback: string): string {
  if (raw.length === 0 || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const base = "http://paros.invalid";
    const parsed = new URL(raw, base);
    if (parsed.origin !== base) return fallback;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return fallback;
  }
}
