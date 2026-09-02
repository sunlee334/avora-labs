/**
 * 토스페이먼츠 승인 어댑터.
 *
 * 공식 문서 기준 흐름:
 *   프론트에서 requestPayment({ successUrl, failUrl }) 로 결제창을 띄우고,
 *   성공하면 successUrl 로 paymentKey · orderId · amount 가 쿼리로 넘어옵니다.
 *   서버가 시크릿 키로 승인 API 를 호출해야 결제가 확정됩니다.
 *
 * 주의: 결제 요청 후 10분 안에 승인해야 합니다.
 * 순수 REST 라 Cloudflare Workers 의 fetch 만으로 동작합니다.
 */
import type { PaymentAdapter, ConfirmRequest, ConfirmResult } from './types';

const ENDPOINT = 'https://api.tosspayments.com/v1/payments/confirm';

/**
 * 주문번호로 결제를 조회하는 자리.
 *
 * 승인이 "이미 처리됐다" 고 돌아왔을 때, **정말로 성사됐는지** 확인하는 데
 * 씁니다. 문서가 그 상황을 위해 준 도구입니다.
 */
const ORDER_ENDPOINT = 'https://api.tosspayments.com/v1/payments/orders/';

/**
 * HTTP 상태만 보면 안 되는 실패들.
 *
 * 출처: https://docs.tosspayments.com/reference/error-codes (결제 승인)
 *
 * ── 왜 이 목록이 필요한가 ───────────────────────────────────
 * 전에는 `status >= 500 || status === 429` 만 재시도 가능으로 봤습니다.
 * 그런데 토스는 **일시적인 오류를 4xx 로 돌려줍니다.** 그 응답을 확정
 * 거절로 읽으면 주문이 `failed` 로 닫히는데, 그 순간 결제가 실제로
 * 성사됐는지는 아무도 모릅니다.
 *
 * `ALREADY_PROCESSED_PAYMENT` 는 더 나쁩니다. 이건 실패가 아니라 **이미
 * 승인이 끝났다** 는 뜻입니다. 완료 화면을 새로고침하거나 네트워크가
 * 끊겼다 이어졌을 때 나옵니다. 확정 거절로 처리하면 **돈은 나갔는데
 * 주문은 실패로 남습니다** — 이 파일이 막아야 하는 최악의 상태입니다.
 *
 * 그래서 둘 다 `retriable: true` 로 돌려보냅니다. 그러면 워커가 주문을
 * 닫지 않고 `pending` 으로 두어(worker/index.ts 의 승인 핸들러), 재시도나
 * 대사(reconciliation)로 실제 상태를 확인할 수 있습니다. 이 인터페이스의
 * `retriable` 주석이 처음부터 그렇게 쓰라고 적어 둔 자리입니다.
 *
 * 목록에 없는 코드는 확정 거절로 봅니다 — 한도 초과·정지 카드·잔액 부족은
 * 다시 눌러도 같은 답이 오고, 그때는 주문을 닫아 주는 편이 정직합니다.
 */
const RETRIABLE_CODES = new Set([
  /*
   * 이미 승인이 끝난 결제. 실패가 아니라 **중복 호출** 입니다.
   * 아래 `confirm()` 이 이 둘을 만나면 조회로 실제 상태를 확인합니다.
   */
  'ALREADY_PROCESSED_PAYMENT',
  'ALREADY_COMPLETED_PAYMENT',
  /*
   * 앞선 멱등 요청이 아직 처리 중입니다(409).
   *
   * 문서가 "이 에러가 돌아오면 **다시 한번 요청해서 응답을 확인하세요**" 라고
   * 적은, 정의상 재시도 코드입니다. 그런데 409 는 5xx 도 429 도 아니라
   * 상태로만 보면 확정 거절이 됩니다.
   *
   * 완료 화면을 연타하면 바로 이 상황이 됩니다 — 주문번호를 멱등 키로 쓰므로
   * 두 번째 요청이 409 를 받습니다. `forcePaid`(worker/orders.ts)가 대부분
   * 되살려 주지만, 첫 요청이 끝내 실패하면 되살릴 것이 없습니다.
   */
  'IDEMPOTENT_REQUEST_PROCESSING',
  // 결제사·내부 시스템의 일시적 오류. 문서가 "잠시 후 다시 시도" 라고 적은 것들입니다.
  'PROVIDER_ERROR',
  'CARD_PROCESSING_ERROR',
  'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING',
  'FAILED_INTERNAL_SYSTEM_PROCESSING',
  'UNKNOWN_PAYMENT_ERROR',
  /*
   * 시간이 지나면 되는 것들.
   *
   * `NOT_AVAILABLE_BANK` 가 은행 점검 시간대(403)이고, `NOT_AVAILABLE_PAYMENT`
   * 는 결제가 불가능한 시간대입니다. 전에는 앞의 것을 빠뜨린 채 뒤의 것에
   * "은행 점검" 이라는 주석을 달아 두었습니다 — 주석이 다른 코드를 가리키고
   * 있었습니다.
   */
  'NOT_AVAILABLE_BANK',
  'NOT_AVAILABLE_PAYMENT',
]);

/**
 * 우리가 만드는 코드 — **여기가 유일한 정의입니다.**
 *
 * 워커가 Sentry 등급을 가를 때 이 값을 봅니다(`worker/index.ts`). 전에는
 * 양쪽이 맨 문자열 리터럴이라, 한쪽 이름을 바꾸면 등급이 조용히
 * `error` → `warning` 으로 떨어지고 아무 검사도 빨개지지 않았습니다.
 */
export const PAYMENT_STATE_UNSETTLED = 'PAYMENT_STATE_UNSETTLED';
export const PAYMENT_NOT_DONE = 'PAYMENT_NOT_DONE';

/** 승인이 이미 끝났다는 뜻의 코드. 조회로 실제 상태를 확인합니다. */
const ALREADY_DONE_CODES = new Set(['ALREADY_PROCESSED_PAYMENT', 'ALREADY_COMPLETED_PAYMENT']);

/**
 * 이 실패를 다시 시도해도 되는가 — 주문을 닫지 않아도 되는가.
 *
 * 코드가 먼저입니다. 코드가 없거나(본문을 못 읽었거나) 모르는 코드면
 * 상태로 판단합니다. 5xx·429 는 그대로 두고, 본문이 없으면(`!payload`)
 * 무엇이 일어났는지 알 수 없으므로 닫지 않습니다.
 */
export function isRetriable(code: string | undefined, status: number, hasBody: boolean): boolean {
  if (code && RETRIABLE_CODES.has(code)) return true;
  if (code) return status >= 500 || status === 429;
  return !hasBody || status >= 500 || status === 429;
}

/**
 * 주문번호로 결제 상태를 조회해 승인 결과를 확정합니다.
 *
 * 확정할 수 없으면 `null` 입니다 — 부르는 쪽이 원래 실패 처리로 돌아갑니다.
 *
 * ── 금액을 여기서 다시 봅니다 ───────────────────────────────
 * 조회 응답의 `totalAmount` 가 우리가 승인하려던 금액과 다르면 **성공으로
 * 처리하지 않습니다.** 같은 주문번호로 다른 금액이 결제된 상태라면 그건
 * 사람이 봐야 하는 일이지, 자동으로 `paid` 를 찍을 일이 아닙니다.
 */
export type LookupOutcome =
  /** 승인이 확인됐습니다. 그대로 성공으로 돌립니다. */
  | { kind: 'settled'; result: ConfirmResult }
  /** 조회 자체를 못 했습니다 — 네트워크·타임아웃·5xx. 원래 실패로 돌아갑니다. */
  | { kind: 'unreachable' }
  /**
   * 조회는 됐는데 **판정이 서지 않습니다.**
   *
   * 금액이 다르거나(위변조·중복승인 신호), 부분취소·에스크로·입금대기처럼
   * `DONE` 이 아닌 상태입니다. 이건 네트워크 실패와 성질이 완전히 다릅니다 —
   * **사람이 봐야 합니다.**
   */
  | { kind: 'unsettled'; status?: string; amount?: number };

/**
 * 조회가 매달리지 않게 하는 상한.
 *
 * 이 호출은 승인 응답 안쪽에 있습니다. 여기서 매달리면 손님이 보는 완료
 * 화면이 통째로 매달립니다 — 승인(한 번) + 조회(한 번)라 최악 지연이 두
 * 배가 됐습니다. 못 받으면 `unreachable` 로 떨어져 원래 동작(주문을 열어
 * 둠)으로 돌아가므로, 끊는 쪽이 안전합니다.
 */
const LOOKUP_TIMEOUT_MS = 5000;

export async function lookupOrder(
  orderId: string,
  credentials: string,
  expectedAmount: number,
): Promise<LookupOutcome> {
  let response: Response;
  try {
    response = await fetch(`${ORDER_ENDPOINT}${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'unreachable' };
  }

  if (!response.ok) return { kind: 'unreachable' };

  const payload = (await response.json().catch(() => null)) as Record<string, any> | null;
  if (!payload) return { kind: 'unreachable' };

  /*
   * `DONE` 만 성공입니다.
   *
   * `PARTIAL_CANCELED`·`CANCELED` 는 돈이 일부/전부 돌아간 상태이고,
   * `WAITING_FOR_DEPOSIT` 는 가상계좌 입금 전입니다. 어느 것도 자동으로
   * `paid` 를 찍을 일이 아닙니다.
   *
   * 금액은 `totalAmount` 로 봅니다 — 부분취소가 나도 이 값은 변하지 않고
   * 줄어드는 것은 `balanceAmount` 입니다(문서 확인).
   */
  if (payload.status !== 'DONE' || payload.totalAmount !== expectedAmount) {
    return { kind: 'unsettled', status: payload.status, amount: payload.totalAmount };
  }

  return {
    kind: 'settled',
    result: {
      ok: true,
      transactionId: payload.paymentKey,
      status: payload.status,
      approvedAt: payload.approvedAt,
    },
  };
}

export const tossPayments: PaymentAdapter = {
  name: 'tosspayments',

  isConfigured(env) {
    return typeof env.TOSS_SECRET_KEY === 'string' && env.TOSS_SECRET_KEY.length > 0;
  },

  async confirm(req: ConfirmRequest, env): Promise<ConfirmResult> {
    // 시크릿 키 뒤에 콜론을 붙여 base64 로 인코딩한 값이 Basic 인증 자격증명입니다.
    const credentials = btoa(`${env.TOSS_SECRET_KEY as string}:`);

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
          // 같은 주문이 두 번 승인되지 않도록 주문번호를 멱등 키로 씁니다.
          'Idempotency-Key': req.orderId,
        },
        body: JSON.stringify({
          paymentKey: req.paymentKey,
          orderId: req.orderId,
          amount: req.amount,
        }),
      });
    } catch (cause) {
      // 연결 자체가 실패했으므로 승인이 됐는지 알 수 없습니다. 주문을 닫지 않습니다.
      return {
        ok: false,
        error: { code: 'NETWORK_ERROR', message: '결제사에 연결하지 못했습니다.', retriable: true },
      };
    }

    const payload = (await response.json().catch(() => null)) as Record<string, any> | null;

    if (!response.ok || !payload) {
      /*
       * "이미 처리된 결제" 는 실패가 아닙니다 — **확인이 덜 된 성공** 입니다.
       *
       * 전에는 이것을 `retriable: true` 로만 돌려보내 주문을 `pending` 으로
       * 두고 "대사(reconciliation)에 맡긴다" 고 적었습니다. 그런데 검토에서
       * **그 대사가 이 저장소 어디에도 없다** 는 것이 드러났습니다 — 재시도도,
       * 알림도, 정리 작업도 없었습니다. 결과는 "돈은 나갔는데 주문은 pending
       * 이고 아무도 모른다" 였고, 손님 화면에는 실패가 떴습니다.
       *
       * 그래서 그 자리에서 조회해 확정합니다. 요청 한 번이고, 이 분기에서만
       * 일어납니다. 조회가 실패하면 예전 동작(pending 유지)으로 떨어집니다 —
       * 최악을 피하는 바닥은 그대로 둡니다.
       */
      if (payload?.code && ALREADY_DONE_CODES.has(payload.code)) {
        const outcome = await lookupOrder(req.orderId, credentials, req.amount);
        if (outcome.kind === 'settled') return outcome.result;

        /*
         * 조회는 됐는데 판정이 안 섭니다 — **사람이 봐야 합니다.**
         *
         * 전에는 이것도 조회 실패와 같은 `null` 로 돌려서, Sentry 에서
         * 일시적 네트워크 오류와 구분되지 않았습니다(둘 다 warning). 같은
         * 주문번호로 다른 금액이 승인돼 있다면 위변조나 중복승인 신호이고,
         * 그건 "잠시 후 다시" 로 넘길 일이 아닙니다.
         *
         * 주문은 여전히 열어 둡니다(`retriable`) — 닫을 근거가 없습니다.
         * 다만 코드를 갈라 두면 워커가 `level: 'error'` 로 올릴 수 있습니다.
         */
        if (outcome.kind === 'unsettled') {
          return {
            ok: false,
            error: {
              code: PAYMENT_STATE_UNSETTLED,
              message:
                `승인 상태를 확정하지 못했습니다 — status=${outcome.status ?? '?'}, ` +
                `totalAmount=${outcome.amount ?? '?'}, 기대 금액=${req.amount}`,
              retriable: true,
            },
          };
        }
      }

      return {
        ok: false,
        error: {
          code: payload?.code ?? `HTTP_${response.status}`,
          /*
           * 토스가 보낸 문장을 그대로 담습니다 — **로그와 문의 대응용** 입니다.
           * 손님에게 보이는 문구는 화면이 자기 사전에서 고릅니다. PG 의
           * 문장을 그대로 화면에 얹으면 5개 언어 중 한국어만 말이 됩니다.
           */
          message: payload?.message ?? '결제 승인에 실패했습니다.',
          retriable: isRetriable(payload?.code, response.status, payload != null),
        },
      };
    }

    /*
     * 200 이라고 다 승인이 아닙니다.
     *
     * 조회 경로는 `DONE` 을 요구하는데(위 `lookupOrder`) 여기는 아무 status
     * 나 받고 있었습니다 — 같은 파일 안에 기준이 둘이었습니다.
     *
     * 가상계좌를 켜면 승인 응답이 `WAITING_FOR_DEPOSIT` 으로 200 을
     * 돌려줍니다. 그대로 두면 **입금 전인데 주문이 `paid`** 가 됩니다.
     * 지금은 `payment-config.json` 에서 꺼져 있지만, 실제 노출은 개발자센터가
     * 정하므로 그 파일이 보증해 주지 않습니다.
     *
     * 확정할 수 없으니 주문을 닫지도 않습니다 — 열어 두고 사람을 부릅니다.
     */
    if (payload.status !== 'DONE') {
      return {
        ok: false,
        error: {
          code: PAYMENT_NOT_DONE,
          message: `승인 응답이 DONE 이 아닙니다 — status=${payload.status ?? '?'}`,
          retriable: true,
        },
      };
    }

    return {
      ok: true,
      transactionId: payload.paymentKey,
      status: payload.status,
      approvedAt: payload.approvedAt,
    };
  },
};
