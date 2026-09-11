import "server-only";

export { paymentMethodKey, type PaymentMethodKey } from "./method-key";

/**
 * 토스페이먼츠 결제 승인 (코어 API v1).
 * 문서: POST https://api.tosspayments.com/v1/payments/confirm
 * 인증: Basic base64(secretKey + ":"). 시크릿 키는 서버에서만 사용한다.
 */

const CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";
const TIMEOUT_MS = 15_000;

export interface TossConfirmInput {
  paymentKey: string;
  orderId: string;
  amount: number;
  /** 재시도 시 중복 승인을 막는 멱등키 (UUID v4) */
  idempotencyKey?: string;
}

export interface TossPaymentResult {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status: string;
  /** CARD, TRANSFER, VIRTUAL_ACCOUNT, EASY_PAY 등 */
  method: string | null;
  totalAmount: number;
  approvedAt: string | null;
  receiptUrl: string | null;
}

export class TossPaymentError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "TossPaymentError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * 운영에서 테스트 키(test_*)는 TOSS_TEST_MODE=1 이 명시된 경우에만 허용한다.
 * 실 키 누락이 테스트 키로 조용히 대체되어 "결제된 것처럼" 보이는 사고를 막는다.
 */
function secretKey(): string {
  const key = process.env.TOSS_SECRET_KEY;
  if (!key) {
    throw new TossPaymentError("CONFIG_MISSING", "결제 설정이 완료되지 않았습니다.", 500);
  }
  if (
    process.env.NODE_ENV === "production" &&
    key.startsWith("test_") &&
    process.env.TOSS_TEST_MODE !== "1"
  ) {
    throw new TossPaymentError("CONFIG_MISSING", "운영 환경에 테스트 결제 키가 설정되어 있습니다.", 500);
  }
  return key;
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${secretKey()}:`).toString("base64")}`;
}

/** Toss 코어 API 공통부. 타임아웃·오류 응답을 TossPaymentError 로 정규화한다. */
async function tossRequest(
  method: "GET" | "POST",
  url: string,
  body?: Record<string, unknown>,
  idempotencyKey?: string,
  timeoutMs = TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader(),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new TossPaymentError(
      aborted ? "TIMEOUT" : "NETWORK_ERROR",
      aborted
        ? "결제 서버 응답이 시간 내에 오지 않았습니다. 결제 내역을 확인해 주세요."
        : "결제 서버에 연결하지 못했습니다.",
      504,
    );
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    const code = typeof record?.code === "string" ? record.code : "REQUEST_FAILED";
    const message =
      typeof record?.message === "string" ? record.message : "결제 서버 요청에 실패했습니다.";
    throw new TossPaymentError(code, message, response.status);
  }
  if (payload === null || payload === undefined) {
    throw new TossPaymentError("INVALID_RESPONSE", "결제 서버 응답을 읽지 못했습니다.", 502);
  }
  return payload;
}

async function tossPost(
  url: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const payload = await tossRequest("POST", url, body, idempotencyKey);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TossPaymentError("INVALID_RESPONSE", "결제 서버 응답을 읽지 못했습니다.", 502);
  }
  return payload as Record<string, unknown>;
}

/** 사용자에게 그대로 노출해도 되는 문구인지 판단하기 어려우므로 코드와 메시지를 함께 보관한다. */
export async function confirmTossPayment(input: TossConfirmInput): Promise<TossPaymentResult> {
  let payload: Record<string, unknown>;
  try {
    payload = await tossPost(
      CONFIRM_URL,
      { paymentKey: input.paymentKey, orderId: input.orderId, amount: input.amount },
      input.idempotencyKey,
    );
  } catch (error) {
    if (error instanceof TossPaymentError && error.code === "REQUEST_FAILED") {
      throw new TossPaymentError("CONFIRM_FAILED", "결제 승인에 실패했습니다.", error.httpStatus);
    }
    throw error;
  }

  const receipt = payload.receipt as { url?: string } | null | undefined;

  return {
    paymentKey: String(payload.paymentKey ?? input.paymentKey),
    orderId: String(payload.orderId ?? input.orderId),
    orderName: String(payload.orderName ?? ""),
    status: String(payload.status ?? "UNKNOWN"),
    method: typeof payload.method === "string" ? payload.method : null,
    totalAmount: Number(payload.totalAmount ?? input.amount),
    approvedAt: typeof payload.approvedAt === "string" ? payload.approvedAt : null,
    receiptUrl: typeof receipt?.url === "string" ? receipt.url : null,
  };
}

export interface TossCancelInput {
  paymentKey: string;
  /** 토스 결제내역·고객 영수증에 남는 취소 사유 (필수) */
  cancelReason: string;
  /** 같은 주문의 재시도가 이중 취소되지 않도록 고정 키를 넘긴다 */
  idempotencyKey?: string;
}

export interface TossCancelResult {
  paymentKey: string;
  /** CANCELED | PARTIAL_CANCELED 등 */
  status: string;
  /** 이번 요청 포함 누적 취소 금액 */
  cancelledAmount: number;
  /** 이미 취소돼 있던 결제라 새로 취소하지 않은 경우 */
  alreadyCancelled: boolean;
}

/**
 * 결제 전액 취소(환불). 문서: POST https://api.tosspayments.com/v1/payments/{paymentKey}/cancel
 * 이미 취소된 결제(ALREADY_CANCELED_PAYMENT)는 성공으로 취급해 관리자 재시도가 막히지 않게 한다.
 * 가상계좌 결제는 refundReceiveAccount 가 필요하므로 이 함수로 취소하지 않는다 (호출부에서 거른다).
 */
export async function cancelTossPayment(input: TossCancelInput): Promise<TossCancelResult> {
  const url = `https://api.tosspayments.com/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`;
  let payload: Record<string, unknown>;
  try {
    payload = await tossPost(url, { cancelReason: input.cancelReason.slice(0, 200) }, input.idempotencyKey);
  } catch (error) {
    if (error instanceof TossPaymentError && error.code === "ALREADY_CANCELED_PAYMENT") {
      return { paymentKey: input.paymentKey, status: "CANCELED", cancelledAmount: 0, alreadyCancelled: true };
    }
    if (error instanceof TossPaymentError && error.code === "REQUEST_FAILED") {
      throw new TossPaymentError("CANCEL_FAILED", "결제 취소에 실패했습니다.", error.httpStatus);
    }
    throw error;
  }

  const cancels = Array.isArray(payload.cancels) ? (payload.cancels as { cancelAmount?: unknown }[]) : [];
  const cancelledAmount = cancels.reduce((sum, c) => sum + (Number(c.cancelAmount) || 0), 0);
  return {
    paymentKey: String(payload.paymentKey ?? input.paymentKey),
    status: String(payload.status ?? "UNKNOWN"),
    cancelledAmount,
    alreadyCancelled: false,
  };
}

export interface TossCancelRecord {
  cancelAmount: number;
  canceledAt: string | null;
  cancelReason: string;
}

/** 결제 조회 응답 중 대사에 필요한 부분 */
export interface TossPaymentSnapshot {
  paymentKey: string;
  orderId: string;
  /** READY | IN_PROGRESS | WAITING_FOR_DEPOSIT | DONE | CANCELED | PARTIAL_CANCELED | ABORTED | EXPIRED */
  status: string;
  method: string | null;
  totalAmount: number;
  /** 취소 후 남은 금액. 전액 취소면 0 */
  balanceAmount: number;
  approvedAt: string | null;
  cancels: TossCancelRecord[];
}

function toSnapshot(payload: Record<string, unknown>): TossPaymentSnapshot {
  const cancels = Array.isArray(payload.cancels)
    ? (payload.cancels as Record<string, unknown>[]).map((c) => ({
        cancelAmount: Number(c.cancelAmount) || 0,
        canceledAt: typeof c.canceledAt === "string" ? c.canceledAt : null,
        cancelReason: typeof c.cancelReason === "string" ? c.cancelReason : "",
      }))
    : [];
  return {
    paymentKey: String(payload.paymentKey ?? ""),
    orderId: String(payload.orderId ?? ""),
    status: String(payload.status ?? "UNKNOWN"),
    method: typeof payload.method === "string" ? payload.method : null,
    totalAmount: Number(payload.totalAmount ?? 0),
    balanceAmount: Number(payload.balanceAmount ?? payload.totalAmount ?? 0),
    approvedAt: typeof payload.approvedAt === "string" ? payload.approvedAt : null,
    cancels,
  };
}

const NOT_FOUND_CODES = new Set(["NOT_FOUND_PAYMENT", "NOT_FOUND_PAYMENT_SESSION", "NOT_FOUND"]);

async function tossGetPayment(url: string): Promise<TossPaymentSnapshot | null> {
  try {
    const payload = await tossRequest("GET", url);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TossPaymentError("INVALID_RESPONSE", "결제 서버 응답을 읽지 못했습니다.", 502);
    }
    return toSnapshot(payload as Record<string, unknown>);
  } catch (error) {
    if (error instanceof TossPaymentError && (error.httpStatus === 404 || NOT_FOUND_CODES.has(error.code))) {
      return null;
    }
    throw error;
  }
}

/** 결제 조회 (paymentKey 기준). 토스에 결제가 없으면 null. 문서: GET /v1/payments/{paymentKey} */
export function getTossPayment(paymentKey: string): Promise<TossPaymentSnapshot | null> {
  return tossGetPayment(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}`);
}

/** 결제 조회 (주문번호 기준). 문서: GET /v1/payments/orders/{orderId} */
export function getTossPaymentByOrderId(orderId: string): Promise<TossPaymentSnapshot | null> {
  return tossGetPayment(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`);
}

export interface TossTransaction {
  transactionKey: string;
  paymentKey: string;
  orderId: string;
  status: string;
  /** "yyyy-MM-dd'T'HH:mm:ss±hh:mm" */
  transactionAt: string;
  amount: number;
}

export interface TossTransactionPage {
  transactions: TossTransaction[];
  /** maxPages 를 다 채우고도 더 있을 수 있는 경우. 호출부가 알림을 남긴다. */
  truncated: boolean;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 토스 거래 조회의 startDate/endDate 는 "yyyy-MM-dd'T'HH:mm:ss" 이고 시간대 표기가 없다 (한국 시간 기준). */
export function formatTossLocalDateTime(date: Date): string {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return shifted.toISOString().slice(0, 19);
}

/**
 * 거래 조회 (대사용). 문서: GET /v1/transactions?startDate&endDate&startingAfter&limit (limit 기본 100, 최대 5000).
 * 결제 승인·취소 각각이 한 건의 거래로 온다. 문서상 최대 60초 걸릴 수 있어 타임아웃을 길게 둔다.
 */
export async function listTossTransactions(input: {
  startDate: Date;
  endDate: Date;
  limit?: number;
  maxPages?: number;
}): Promise<TossTransactionPage> {
  const limit = input.limit ?? 500;
  const maxPages = input.maxPages ?? 5;
  const out: TossTransaction[] = [];
  let startingAfter: string | null = null;
  let truncated = false;
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({
      startDate: formatTossLocalDateTime(input.startDate),
      endDate: formatTossLocalDateTime(input.endDate),
      limit: String(limit),
    });
    if (startingAfter) params.set("startingAfter", startingAfter);
    const payload = await tossRequest(
      "GET",
      `https://api.tosspayments.com/v1/transactions?${params.toString()}`,
      undefined,
      undefined,
      65_000,
    );
    if (!Array.isArray(payload)) {
      throw new TossPaymentError("INVALID_RESPONSE", "거래 조회 응답을 읽지 못했습니다.", 502);
    }
    const rows = (payload as Record<string, unknown>[]).map((t) => ({
      transactionKey: String(t.transactionKey ?? ""),
      paymentKey: String(t.paymentKey ?? ""),
      orderId: String(t.orderId ?? ""),
      status: String(t.status ?? "UNKNOWN"),
      transactionAt: String(t.transactionAt ?? ""),
      amount: Number(t.amount ?? 0),
    }));
    out.push(...rows);
    if (rows.length < limit) break;
    startingAfter = rows[rows.length - 1]?.transactionKey ?? null;
    if (!startingAfter) break;
    if (page === maxPages - 1) truncated = true;
  }
  return { transactions: out, truncated };
}

/** 결제수단 코드 → 한국어 표기 */
const TOSS_METHOD_LABEL: Record<string, string> = {
  CARD: "카드",
  카드: "카드",
  VIRTUAL_ACCOUNT: "가상계좌",
  가상계좌: "가상계좌",
  TRANSFER: "계좌이체",
  계좌이체: "계좌이체",
  MOBILE_PHONE: "휴대폰",
  휴대폰: "휴대폰",
  EASY_PAY: "간편결제",
  간편결제: "간편결제",
  GIFT_CERTIFICATE: "상품권",
  상품권: "상품권",
};

/** 토스 결제수단(한글·영문 코드 혼재)을 사전 키로 정규화한다. 모르는 값은 null. */


export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "결제";
  return TOSS_METHOD_LABEL[method] ?? method;
}

/** 가상계좌 결제 여부. 취소 시 환불 계좌(refundReceiveAccount)가 필요해 자동 취소 대상에서 뺀다. */
export function isVirtualAccount(method: string | null | undefined): boolean {
  return method === "VIRTUAL_ACCOUNT" || method === "가상계좌";
}
