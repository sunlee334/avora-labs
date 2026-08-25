/**
 * 테스트 전용 결제 어댑터.
 *
 * ⚠️ 운영에서는 절대 쓰지 마세요. PAYMENT_PROVIDER=mock 일 때만 등록되며,
 * wrangler.jsonc 에는 이 값을 넣지 않습니다.
 *
 * 존재하는 이유: 승인 단계의 금액 검증은 이 프로젝트에서 가장 중요한 보안 경로인데,
 * 실제 PG 없이는 그 코드에 도달할 수 없습니다. 테스트 더블이 없으면
 * "금액을 조작하면 막힌다"를 확인할 방법이 없습니다.
 *
 * paymentKey 접두어로 경로를 고릅니다.
 *   fail_    확정 거절 → 주문이 failed 로 닫힙니다
 *   flaky_   일시적 실패 → 주문이 pending 으로 남아 재시도할 수 있습니다
 */
import type { PaymentAdapter, ConfirmRequest, ConfirmResult } from './types';

export const mockPayments: PaymentAdapter = {
  name: 'mock',

  isConfigured() {
    return true;
  },

  async confirm(req: ConfirmRequest): Promise<ConfirmResult> {
    if (req.paymentKey.startsWith('fail_')) {
      return {
        ok: false,
        error: { code: 'MOCK_DECLINED', message: '테스트 어댑터가 거절했습니다.', retriable: false },
      };
    }
    if (req.paymentKey.startsWith('flaky_')) {
      return {
        ok: false,
        error: { code: 'MOCK_TIMEOUT', message: '테스트 어댑터가 응답하지 않았습니다.', retriable: true },
      };
    }
    return {
      ok: true,
      transactionId: req.paymentKey,
      status: 'DONE',
      approvedAt: new Date().toISOString(),
    };
  },
};
