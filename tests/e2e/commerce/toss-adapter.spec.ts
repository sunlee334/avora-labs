import { test, expect } from '@playwright/test';
import {
  isRetriable,
  lookupOrder,
  PAYMENT_STATE_UNSETTLED,
  PAYMENT_NOT_DONE,
} from '../../../worker/payments/tosspayments';

/**
 * 토스 승인 실패의 분류.
 *
 * ── 왜 이 검사가 따로 있는가 ────────────────────────────────
 * 이 프로젝트에서 가장 비싼 실수는 "결제는 됐는데 주문은 실패" 입니다.
 * 돈은 나갔고, 손님은 실패 화면을 봤고, 우리 장부에는 실패로 남습니다.
 * 그 상태를 만드는 길이 정확히 하나 있습니다 — **재시도 가능한 실패를
 * 확정 거절로 읽는 것.**
 *
 * 워커는 `retriable` 이 참이면 주문을 `pending` 으로 두고, 거짓이면
 * `failed` 로 닫습니다(worker/index.ts). 그러니 이 함수의 판정이 곧
 * 주문을 닫을지 말지의 판정입니다.
 *
 * ── 왜 브라우저를 띄우지 않는가 ─────────────────────────────
 * 순수 함수라 직접 부릅니다. `www-redirect.spec.ts` 가
 * `canonicalHostRedirect` 를, `admin-allowlist.spec.ts` 가 `verifyAdmin` 을
 * 그렇게 부르는 것과 같습니다. 실제 승인 경로는 `orders-api.spec.ts` 가
 * mock 어댑터로 확인합니다.
 *
 * 코드 목록의 출처: https://docs.tosspayments.com/reference/error-codes
 */

test.describe('이미 승인된 결제를 실패로 닫지 않는다', () => {
  /*
   * 완료 화면을 새로고침하거나, 승인 요청이 나간 뒤 응답만 끊겼을 때
   * 나옵니다. 결제는 성사됐습니다.
   */
  for (const code of ['ALREADY_PROCESSED_PAYMENT', 'ALREADY_COMPLETED_PAYMENT']) {
    test(`${code} 는 주문을 닫지 않는다`, () => {
      expect(
        isRetriable(code, 400, true),
        `${code} 를 확정 거절로 읽으면 돈은 나갔는데 주문은 실패로 남습니다`,
      ).toBe(true);
    });
  }
});

test.describe('일시적 오류는 4xx 로 와도 재시도 가능하다', () => {
  /*
   * 여기가 예전 규칙(`status >= 500`)이 놓치던 자리입니다. 토스는 이
   * 오류들을 4xx 로 돌려줍니다.
   */
  const temporary = [
    'PROVIDER_ERROR',
    'CARD_PROCESSING_ERROR',
    'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING',
    'FAILED_INTERNAL_SYSTEM_PROCESSING',
    'UNKNOWN_PAYMENT_ERROR',
    // 은행 서비스 시간이 아닙니다(403). 전에는 이 코드가 빠진 채 옆 코드에
    // "은행 점검" 주석이 붙어 있었습니다 — 주석이 다른 것을 가리켰습니다.
    'NOT_AVAILABLE_BANK',
    'NOT_AVAILABLE_PAYMENT',
  ];

  for (const code of temporary) {
    test(`${code} (HTTP 400)`, () => {
      expect(isRetriable(code, 400, true), `${code} 는 잠시 후 다시 시도할 수 있는 실패입니다`).toBe(
        true,
      );
    });
  }
});

test.describe('처리 중인 멱등 요청은 다시 물어본다', () => {
  test('IDEMPOTENT_REQUEST_PROCESSING (409) 는 주문을 닫지 않는다', () => {
    /*
     * 문서: 409, "이전 멱등 요청이 처리중입니다. 이 에러가 돌아오면 **다시
     * 한번 요청해서 응답을 확인하세요**." 정의상 재시도 코드인데, 409 는
     * 5xx 도 429 도 아니라 상태로만 보면 확정 거절이 됩니다.
     *
     * 완료 화면을 연타하면 바로 이 상황입니다 — 주문번호를 멱등 키로 쓰므로
     * 두 번째 요청이 409 를 받습니다.
     */
    expect(isRetriable('IDEMPOTENT_REQUEST_PROCESSING', 409, true)).toBe(true);
  });
});

test.describe('확정 거절은 주문을 닫는다', () => {
  /*
   * 다시 눌러도 같은 답이 옵니다. 주문을 열어 둔 채로 두면 손님은 무엇을
   * 기다리는지 모르고, 우리 장부에는 영원히 뜨는 주문이 쌓입니다.
   */
  const declined = [
    'REJECT_CARD_PAYMENT',
    'REJECT_ACCOUNT_PAYMENT',
    'INVALID_STOPPED_CARD',
    'INVALID_CARD_LOST_OR_STOLEN',
    'EXCEED_MAX_DAILY_PAYMENT_COUNT',
    'BELOW_MINIMUM_AMOUNT',
  ];

  for (const code of declined) {
    /*
     * 상태는 문서 표를 따릅니다 — 카드 거절은 403, 나머지는 400 입니다.
     * 판정 결과는 같지만, 검사가 실제와 다른 상태를 쓰면 나중에 상태로
     * 갈리는 규칙이 생겼을 때 조용히 어긋납니다.
     */
    const status = code.startsWith('REJECT_') ? 403 : 400;
    test(`${code} (HTTP ${status})`, () => {
      expect(isRetriable(code, status, true), `${code} 는 다시 시도해도 같은 답이 옵니다`).toBe(
        false,
      );
    });
  }
});

test.describe('코드를 모를 때는 상태로 판단한다', () => {
  test('5xx 는 결과를 단정할 수 없다', () => {
    expect(isRetriable('SOME_UNKNOWN_CODE', 500, true)).toBe(true);
    expect(isRetriable(undefined, 502, false)).toBe(true);
  });

  test('429 도 마찬가지다', () => {
    expect(isRetriable('SOME_UNKNOWN_CODE', 429, true)).toBe(true);
  });

  test('본문을 읽지 못하면 닫지 않는다', () => {
    /*
     * 4xx 인데 JSON 이 아니면 게이트웨이나 프록시가 끼어든 것입니다.
     * 토스가 무엇을 했는지 모르므로 주문을 닫을 근거가 없습니다.
     */
    expect(isRetriable(undefined, 400, false)).toBe(true);
  });

  test('본문은 읽혔는데 코드가 없는 4xx 는 주문을 닫는다', () => {
    /*
     * "토스는 늘 코드를 준다" 는 전제 위에 서 있는 판정입니다. 코드가 없는
     * 4xx 본문이 온다면 그건 우리 요청이 형식부터 틀렸다는 뜻이라 다시
     * 보내도 같습니다. 전제를 검사에 적어 둡니다 — 틀렸다면 여기가 먼저
     * 이상해집니다.
     */
    expect(isRetriable(undefined, 400, true)).toBe(false);
  });

  test('모르는 코드가 4xx 로 오면 확정 거절로 본다', () => {
    // 코드가 왔다는 것은 토스가 판단을 내렸다는 뜻입니다.
    expect(isRetriable('SOME_UNKNOWN_CODE', 400, true)).toBe(false);
  });
});

/**
 * "이미 처리된 결제" 를 조회로 확정하는 자리.
 *
 * 이 함수가 무엇을 성공으로 볼지가 곧 **주문에 `paid` 를 찍을지** 의 판정이라,
 * 세 갈래를 각각 못 박습니다. `fetch` 를 갈아 끼워 응답만 만듭니다 —
 * 네트워크도 토스도 필요 없습니다.
 */
test.describe('조회로 승인을 확정한다', () => {
  const CREDENTIALS = 'dGVzdDo=';

  function withFetch(impl: () => Promise<Response> | Response) {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(impl())) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  }

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  test('DONE 이고 금액이 맞으면 성공으로 확정한다', async () => {
    const restore = withFetch(() =>
      jsonResponse({ status: 'DONE', totalAmount: 32000, paymentKey: 'pk_1', approvedAt: 'now' }),
    );
    try {
      const outcome = await lookupOrder('AVORA-1', CREDENTIALS, 32000);
      expect(outcome.kind).toBe('settled');
      if (outcome.kind === 'settled') {
        expect(outcome.result.ok).toBe(true);
        expect(outcome.result.transactionId).toBe('pk_1');
      }
    } finally {
      restore();
    }
  });

  test('금액이 다르면 확정하지 않는다', async () => {
    /*
     * 같은 주문번호로 다른 금액이 승인돼 있다면 위변조나 중복승인 신호입니다.
     * 자동으로 `paid` 를 찍을 일이 아니라 **사람이 봐야 하는 일** 입니다.
     */
    const restore = withFetch(() =>
      jsonResponse({ status: 'DONE', totalAmount: 1000, paymentKey: 'pk_2' }),
    );
    try {
      const outcome = await lookupOrder('AVORA-2', CREDENTIALS, 32000);
      expect(outcome.kind, '금액이 달라도 성공으로 확정했습니다').toBe('unsettled');
    } finally {
      restore();
    }
  });

  test('DONE 이 아니면 확정하지 않는다', async () => {
    /*
     * `PARTIAL_CANCELED`·`CANCELED` 는 돈이 일부/전부 돌아간 상태이고
     * `WAITING_FOR_DEPOSIT` 은 가상계좌 입금 전입니다.
     */
    for (const status of ['PARTIAL_CANCELED', 'CANCELED', 'WAITING_FOR_DEPOSIT', 'ABORTED']) {
      const restore = withFetch(() => jsonResponse({ status, totalAmount: 32000 }));
      try {
        const outcome = await lookupOrder('AVORA-3', CREDENTIALS, 32000);
        expect(outcome.kind, `${status} 를 성공으로 확정했습니다`).toBe('unsettled');
      } finally {
        restore();
      }
    }
  });

  test('조회 자체를 못 하면 unreachable 이다', async () => {
    /*
     * 판정이 안 서는 것(unsettled)과 물어보지도 못한 것(unreachable)은
     * 다릅니다 — 앞은 사람을 부르고 뒤는 원래 실패로 돌아갑니다. 한 칸에
     * 넣으면 Sentry 에서 구분되지 않습니다.
     */
    const restore = withFetch(() => {
      throw new Error('네트워크 끊김');
    });
    try {
      expect((await lookupOrder('AVORA-4', CREDENTIALS, 32000)).kind).toBe('unreachable');
    } finally {
      restore();
    }

    const restore2 = withFetch(() => new Response('nope', { status: 500 }));
    try {
      expect((await lookupOrder('AVORA-5', CREDENTIALS, 32000)).kind).toBe('unreachable');
    } finally {
      restore2();
    }
  });
});

test.describe('우리가 만드는 코드는 한 곳에서 온다', () => {
  test('워커가 등급을 가를 때 보는 값과 같다', () => {
    /*
     * 전에는 어댑터와 워커가 각자 맨 문자열을 적었습니다. 한쪽 이름을 바꾸면
     * Sentry 등급이 조용히 error → warning 으로 떨어지고 아무것도 빨개지지
     * 않았습니다.
     */
    expect(PAYMENT_STATE_UNSETTLED).toBe('PAYMENT_STATE_UNSETTLED');
    expect(PAYMENT_NOT_DONE).toBe('PAYMENT_NOT_DONE');
  });
});
