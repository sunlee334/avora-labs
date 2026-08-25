/**
 * 결제 어댑터 인터페이스.
 *
 * PG 는 아직 정해지지 않았습니다(Step 1 결정: 나이스페이 스페셜 조건 문의 후 확정).
 * 어떤 PG 로 가든 화면 코드는 바뀌지 않도록, 승인 절차를 이 인터페이스 뒤에 둡니다.
 * 새 PG 를 붙이려면 이 인터페이스를 구현한 파일 하나를 추가하고 registry 에 등록하면 됩니다.
 */

export interface ConfirmRequest {
  /** PG 가 결제창에서 돌려준 결제 식별자 */
  paymentKey: string;
  /** 우리가 만든 주문 번호 */
  orderId: string;
  /** 결제 금액. 결제창에 넘긴 금액과 반드시 같아야 합니다 */
  amount: number;
}

export interface ConfirmResult {
  ok: boolean;
  /** PG 측 거래 식별자 — 고객 문의 대응에 씁니다 */
  transactionId?: string;
  status?: string;
  approvedAt?: string;
  error?: {
    code: string;
    message: string;
    /**
     * 다시 시도해도 되는 실패인가.
     *
     * 네트워크 오류나 PG 서버 오류(5xx)는 결제가 됐는지 안 됐는지 알 수 없습니다.
     * 이걸 "확정 실패"로 처리해 주문을 닫아버리면, 실제로는 승인이 끝났는데
     * 주문은 실패로 남는 최악의 상태가 생깁니다. 그런 경우 주문을 pending 으로
     * 두어 재시도나 대사(reconciliation)가 가능하게 합니다.
     */
    retriable?: boolean;
  };
}

export interface PaymentAdapter {
  readonly name: string;
  /** 이 어댑터가 동작하는 데 필요한 시크릿이 환경에 들어 있는지 */
  isConfigured(env: Record<string, unknown>): boolean;
  confirm(req: ConfirmRequest, env: Record<string, unknown>): Promise<ConfirmResult>;
}
