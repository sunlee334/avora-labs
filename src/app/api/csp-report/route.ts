import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * CSP 위반 리포트 수신. 지금은 Report-Only 정책이라 차단은 없고, 무엇이 막힐지 여기서 배운다
 * (토스 결제창·카드사 인증창 도메인처럼 문서만으로 확정하기 어려운 출처를 실제 트래픽으로 확인).
 * D1 에 쓰지 않고 JSON 로그 한 줄만 남긴다 (Workers Logs 에서 event=csp.violation 으로 검색).
 */
const MAX_BODY = 8 * 1024;

type ReportBody = Record<string, unknown>;

function pick(report: ReportBody): Record<string, unknown> {
  // 두 형식 모두 지원: 구형 `{"csp-report": {...}}` (report-uri) 와 Reporting API 배열 `[{type, body}]` (report-to)
  const body = (report["csp-report"] as ReportBody | undefined) ?? (report.body as ReportBody | undefined) ?? report;
  const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 300) : undefined);
  return {
    document: s(body["document-uri"] ?? body.documentURL),
    directive: s(body["effective-directive"] ?? body["violated-directive"] ?? body.effectiveDirective),
    blocked: s(body["blocked-uri"] ?? body.blockedURL),
    source: s(body["source-file"] ?? body.sourceFile),
    line: typeof body["line-number"] === "number" ? body["line-number"] : body.lineNumber,
    disposition: s(body.disposition),
  };
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY) return new NextResponse(null, { status: 413 });
  let parsed: unknown;
  try {
    const text = (await request.text()).slice(0, MAX_BODY);
    parsed = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const reports = Array.isArray(parsed) ? parsed.slice(0, 10) : [parsed];
  for (const r of reports) {
    if (!r || typeof r !== "object") continue;
    console.warn(JSON.stringify({ level: "warn", event: "csp.violation", ...pick(r as ReportBody) }));
  }
  return new NextResponse(null, { status: 204 });
}
