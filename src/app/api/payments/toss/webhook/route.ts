import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/auth/rate-limit";
import { isValidOrderNumber } from "@/lib/orders";
import { reconcileOrderWithToss } from "@/lib/payments/reconcile";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const WINDOW_MS = 60_000;
/** 토스 발신 IP 는 소수라 한 IP 가 정상 웹훅을 몰아 보낼 수 있다. 토스 API 증폭은 아래 주문별 DB 제한이 막는다. */
const MAX_PER_WINDOW = 300;
const hits = new Map<string, { count: number; resetAt: number }>();

function throttled(ip: string, now: number): boolean {
  if (hits.size > 1_000) hits.clear();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

/** 토스 웹훅 본문에서 주문번호만 뽑는다. 이벤트 종류마다 위치가 다르다 (PAYMENT_STATUS_CHANGED: data.orderId, 가상계좌 입금: orderId). */
function extractOrderNumber(body: unknown): { eventType: string; orderNumber: string | null } {
  if (!body || typeof body !== "object") return { eventType: "unknown", orderNumber: null };
  const record = body as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : null;
  const eventType = typeof record.eventType === "string" ? record.eventType : data ? "unknown" : "DEPOSIT_CALLBACK";
  const raw = (data?.orderId ?? record.orderId) as unknown;
  const orderNumber = typeof raw === "string" ? raw.slice(0, 64) : null;
  return { eventType, orderNumber: orderNumber && isValidOrderNumber(orderNumber) ? orderNumber : null };
}

/**
 * 토스페이먼츠 웹훅 수신. 토스는 서명을 주지 않으므로 본문은 "이 주문을 다시 확인하라"는 신호로만 쓰고,
 * 실제 상태는 토스 조회 API 로 다시 읽어 DB 에 맞춘다 (reconcileOrderWithToss). 위조된 본문은 대사 한 번을
 * 유발할 뿐 상태를 바꾸지 못한다. 토스는 2xx 가 아니면 재전송하므로, 일시 오류(토스 API 장애)에만 5xx 를 돌려준다.
 * 상점관리자 등록 URL: https://avoralabs.co/api/payments/toss/webhook
 */
export async function POST(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (throttled(ip, Date.now())) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  // content-length 가 없는(chunked) 요청은 전량 버퍼링하기 전에 크기를 알 수 없으므로 받지 않는다. 토스는 항상 길이를 보낸다.
  const rawLength = request.headers.get("content-length");
  const length = rawLength ? Number.parseInt(rawLength, 10) : Number.NaN;
  if (!Number.isFinite(length)) {
    return NextResponse.json({ ok: false, reason: "length_required" }, { status: 411 });
  }
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, reason: "body_too_large" }, { status: 413 });
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, reason: "body_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const { eventType, orderNumber } = extractOrderNumber(body);
  if (!orderNumber) {
    // 우리 주문번호 형식이 아니면(다른 상점·정산 이벤트 등) 조용히 받는다. 재전송을 막기 위해 200.
    console.log(JSON.stringify({ level: "info", event: "toss_webhook.ignored", eventType }));
    return NextResponse.json({ ok: true });
  }

  // 같은 주문에 대한 대사는 30초에 두 번까지만 토스를 조회한다 (위조 본문으로 토스 조회 API 를 증폭시키지 못하게).
  // 응답은 결과와 무관하게 같은 형태다 — 주문번호 존재 여부를 응답으로 알 수 없게.
  const limit = await rateLimit(`toss-webhook:${orderNumber}`, { limit: 2, windowMs: 30_000 });
  if (!limit.ok) {
    console.log(JSON.stringify({ level: "info", event: "toss_webhook.throttled", order: orderNumber }));
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await reconcileOrderWithToss(orderNumber, { source: "webhook" });
    console.log(
      JSON.stringify({
        level: result.outcome === "needs_attention" ? "warn" : "info",
        event: "toss_webhook.reconciled",
        eventType,
        order: orderNumber,
        outcome: result.outcome,
        tossStatus: result.tossStatus ?? null,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "toss_webhook.failed",
        order: orderNumber,
        cause: error instanceof Error ? error.message.slice(0, 200) : String(error),
      }),
    );
    // 토스 조회 실패 등 일시 오류: 토스가 다시 보내도록 5xx.
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
