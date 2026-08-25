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
  error?: { code: string; message: string };
}

export interface PaymentAdapter {
  readonly name: string;
  /** 이 어댑터가 동작하는 데 필요한 시크릿이 환경에 들어 있는지 */
  isConfigured(env: Record<string, unknown>): boolean;
  confirm(req: ConfirmRequest, env: Record<string, unknown>): Promise<ConfirmResult>;
}
