import type { ZodError } from "zod";

/** zod 결과를 필드별 첫 메시지로 정리한다. 최상위 이슈는 "form" 키에 담는다. */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
