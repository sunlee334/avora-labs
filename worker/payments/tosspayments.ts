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

export const tossPayments: PaymentAdapter = {
  name: 'tosspayments',

  isConfigured(env) {
    return typeof env.TOSS_SECRET_KEY === 'string' && env.TOSS_SECRET_KEY.length > 0;
  },

  async confirm(req: ConfirmRequest, env): Promise<ConfirmResult> {
    const secret = env.TOSS_SECRET_KEY as string;

    // 시크릿 키 뒤에 콜론을 붙여 base64 로 인코딩한 값이 Basic 인증 자격증명입니다.
    const credentials = btoa(`${secret}:`);

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
      return {
        ok: false,
        error: { code: 'NETWORK_ERROR', message: '결제사에 연결하지 못했습니다.' },
      };
    }

    const payload = (await response.json().catch(() => null)) as Record<string, any> | null;

    if (!response.ok || !payload) {
      return {
        ok: false,
        error: {
          code: payload?.code ?? `HTTP_${response.status}`,
          message: payload?.message ?? '결제 승인에 실패했습니다.',
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
