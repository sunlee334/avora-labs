/**
 * 토스페이먼츠 **주문서형 결제위젯** — 브라우저 쪽.
 *
 * 서버 승인은 `worker/payments/tosspayments.ts` 가 합니다. 이 파일은 그
 * 앞단계, **주문서 안에 결제수단 UI 를 그리고 결제를 요청하는 일** 만 합니다.
 *
 * ── 왜 결제창이 아니라 주문서형인가 ────────────────────────
 * 처음에는 `payment()` 로 결제창을 띄웠습니다. 검토에서 두 가지가 드러났습니다.
 *
 *   1. 그 API 의 문서 제목이 **"결제창(구버전)"** 입니다. 현행은
 *      결제창형·주문서형·자체창형으로 갈렸습니다.
 *   2. `customerKey: ANONYMOUS` 는 **`widgets()` 쪽에만** 문서화돼 있습니다.
 *      구버전 `payment()` 의 `customerKey` 는 형식이 따로 정해진 필수값이라,
 *      거기에 `ANONYMOUS` 를 넣는 것은 근거 없는 사용이었습니다.
 *
 * 주문서형은 결제수단 선택이 **주문서 안에** 있습니다. 손님이 페이지를 떠나지
 * 않고, 우리 화면의 결제수단 라디오와 겹치지도 않습니다(그 라디오는 뺐습니다 —
 * 위젯에 전달되지 않아 아무 일도 하지 않는 장식이었습니다).
 *
 * ── 규격은 문서가 아니라 번들에서 확인했습니다 ─────────────
 * 문서 페이지가 SPA 라 코드 블록이 제대로 나오지 않고, 일부 안내는 v1 형태
 * (`widget('ANONYMOUS')`, `setAmount(15000)`)를 섞어 보여 줍니다. 그래서
 * `js.tosspayments.com/v2/standard` 를 받아 직접 확인했습니다:
 *
 *   window.TossPayments                       전역
 *   TossPayments.ANONYMOUS === '@@ANONYMOUS'
 *   widgets({ customerKey })                  객체 인자
 *   setAmount({ currency, value })            번들이 e.value·e.currency 를 읽음
 *   renderPaymentMethods({ selector, variantKey })
 *   renderAgreement({ selector, variantKey })
 *   requestPayment({ orderId, orderName, successUrl, failUrl, … })
 *
 * 참고: https://docs.tosspayments.com/guides/v2/payment-widget/integration
 */

/** 실물로 확인한 주소입니다(200, 약 480KB). 전역 `window.TossPayments` 를 만듭니다. */
const SDK_URL = 'https://js.tosspayments.com/v2/standard';

/** 번들에 있는 위젯 종류 상수. 기본 위젯을 가리킵니다. */
const VARIANT_PAYMENT = 'DEFAULT';
const VARIANT_AGREEMENT = 'AGREEMENT';

/**
 * 토스 규격의 주문번호인가.
 *
 * 6~64자, 영문 대소문자·숫자·`-`·`_`·`=` 만 허용합니다. 우리 주문번호는
 * `AVORA-20260902013000-AB12CD` 꼴(27자)이라 지금은 통과하지만, 접두사나
 * 생성 규칙을 건드리면 **결제창이 열리기 전에** 거절당합니다.
 *
 * 경고만 적어 두고 아무도 검사하지 않으면 주석일 뿐이라, 아래 `requestPayment`
 * 가 보내기 전에 실제로 확인합니다.
 */
export const TOSS_ORDER_ID = /^[A-Za-z0-9\-_=]{6,64}$/;

/** `orderName` 의 상한. 넘기면 결제 요청이 거절됩니다. */
export const ORDER_NAME_MAX = 100;

interface TossWidgets {
  setAmount(amount: { currency: string; value: number }): Promise<void>;
  renderPaymentMethods(options: { selector: string; variantKey?: string }): Promise<unknown>;
  renderAgreement(options: { selector: string; variantKey?: string }): Promise<unknown>;
  requestPayment(request: Record<string, unknown>): Promise<unknown>;
}

type TossGlobal = ((clientKey: string) => {
  widgets(options: { customerKey: string }): TossWidgets;
}) & { ANONYMOUS: string };

declare global {
  interface Window {
    TossPayments?: TossGlobal;
  }
}

let loading: Promise<TossGlobal | null> | null = null;

/**
 * SDK 를 한 번만 불러옵니다.
 *
 * 주문서형은 결제수단 UI 가 **주문서에 미리 떠 있어야** 하므로, 결제 버튼을
 * 누를 때가 아니라 화면이 뜰 때 부릅니다.
 *
 * 실패하면 `null` 입니다. 던지지 않는 이유: 부르는 쪽이 화면 상태를 되돌려야
 * 하는데, 예외로 빠져나가면 그 코드를 지나지 못합니다.
 */
export function loadToss(): Promise<TossGlobal | null> {
  if (window.TossPayments) return Promise.resolve(window.TossPayments);
  if (loading) return loading;

  loading = new Promise<TossGlobal | null>((resolve) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.TossPayments ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return loading;
}

/**
 * 결제창에 보일 주문 이름.
 *
 * 문구를 지어내지 않습니다 — 장바구니에 담긴 **상품 이름 그대로** 를 씁니다.
 * "외 2건" 같은 말을 만들면 5개 언어에 검수받지 않은 줄이 다섯 개 생기고,
 * 그 문장은 우리 화면이 아니라 **토스 결제 화면에** 뜹니다.
 *
 * 100자를 넘으면 자릅니다. 말줄임표를 붙이지 않습니다 — 그 한 글자 때문에
 * 상한을 넘기는 경우를 만들지 않으려는 것입니다.
 */
export function orderNameFrom(names: readonly string[]): string {
  const joined = [...new Set(names.filter(Boolean))].join(', ');
  return joined.slice(0, ORDER_NAME_MAX);
}

export interface MountInput {
  clientKey: string;
  amount: number;
  currency: string;
  /** 결제수단 위젯이 들어갈 자리. CSS 선택자입니다. */
  methodsSelector: string;
  /** 토스 약관 동의 위젯이 들어갈 자리. */
  agreementSelector: string;
}

export type MountResult =
  | { ok: true; widgets: TossWidgets }
  /** SDK 를 못 불러왔습니다 — 네트워크·광고 차단기·사내 방화벽. */
  | { ok: false; reason: 'sdk-unavailable' }
  /**
   * SDK 는 왔는데 위젯을 세우지 못했습니다.
   *
   * 라이브 전환일에 가장 흔한 실패가 여기입니다 — 잘못된 클라이언트 키,
   * 개발자센터에 등록하지 않은 도메인. 조용히 넘기면 "결제수단이 안 보인다"
   * 로만 나타나고 원인을 알 길이 없습니다.
   */
  | { ok: false; reason: 'setup-failed'; code?: string; message?: string };

/**
 * 주문서에 결제수단·약관 위젯을 그립니다.
 *
 * 순서가 정해져 있습니다 — `setAmount` 가 먼저이고 그다음이 렌더입니다.
 * 금액을 모르는 상태로 그리면 위젯이 결제수단별 사용 가능 여부를 판단할 수
 * 없습니다(무이자 할부·최소 결제금액).
 */
export async function mountWidgets(input: MountInput): Promise<MountResult> {
  const TossPayments = await loadToss();
  if (!TossPayments) return { ok: false, reason: 'sdk-unavailable' };

  try {
    /*
     * `customerKey` 를 익명으로 둡니다.
     *
     * 이 값은 브랜드페이(카드 저장)에서 손님을 식별하는 키입니다. 우리는
     * 카드를 저장하지 않고 회원 없이도 주문할 수 있으므로 식별자를 만들어
     * 보낼 이유가 없습니다. SDK 가 그 경우를 위해 상수를 둡니다 —
     * 번들에서 `ANONYMOUS="@@ANONYMOUS"` 로 확인했습니다.
     */
    const widgets = TossPayments(input.clientKey).widgets({
      customerKey: TossPayments.ANONYMOUS,
    });

    await widgets.setAmount({ currency: input.currency, value: input.amount });

    await Promise.all([
      widgets.renderPaymentMethods({
        selector: input.methodsSelector,
        variantKey: VARIANT_PAYMENT,
      }),
      widgets.renderAgreement({
        selector: input.agreementSelector,
        variantKey: VARIANT_AGREEMENT,
      }),
    ]);

    return { ok: true, widgets };
  } catch (error) {
    const e = error as { code?: string; message?: string } | null;
    return { ok: false, reason: 'setup-failed', code: e?.code, message: e?.message };
  }
}

export interface RequestInput {
  widgets: TossWidgets;
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
  customerName?: string;
  customerEmail?: string;
  customerMobilePhone?: string;
}

export type RequestResult =
  /** 요청이 받아들여졌고 브라우저가 successUrl·failUrl 로 떠납니다. */
  | { outcome: 'redirecting' }
  /**
   * 요청이 거절됐습니다.
   *
   * ⚠️ **여기에 "손님이 창을 닫았다" 는 오지 않습니다.**
   *
   * `successUrl`·`failUrl` 을 넘기는 리다이렉트 방식에서는, 손님이 결제를
   * 그만두면 프라미스가 거절되는 대신 **`failUrl` 로 `PAY_PROCESS_CANCELED`
   * 를 달고 이동합니다.** `USER_CANCEL` 은 리다이렉트를 쓰지 않는 방식의
   * 코드입니다.
   *
   * 그래서 이 갈래에 실제로 도달하는 것은 **결제가 시작되기도 전의 검증
   * 실패** 뿐입니다 — 잘못된 클라이언트 키, 미등록 도메인, 주문번호 규격
   * 위반, 주문명 길이 초과, 최소 결제금액 미만. **전부 우리가 알아야 하는
   * 진짜 오류이고, 전부 손님에게 말해야 합니다.**
   *
   * 처음에는 이 갈래를 "마음을 바꾼 것" 으로 보고 조용히 넘겼습니다. 그러면
   * 라이브 전환일에 가장 흔한 실패(도메인 미등록·키 불일치)가 **아무 표시도
   * 없이** 사라집니다.
   */
  | { outcome: 'rejected'; code?: string; message?: string };

/**
 * 결제를 요청합니다.
 *
 * 성공하면 이 함수는 돌아오지 않습니다 — 브라우저가 `successUrl` 로 떠납니다.
 * 그래서 `redirecting` 은 "곧 이 페이지를 떠난다" 는 뜻이지 "결제됐다" 가
 * 아닙니다. 승인은 그다음 화면이 서버에 요청합니다.
 */
export async function requestPayment(input: RequestInput): Promise<RequestResult> {
  /*
   * 주문번호 규격을 **보내기 전에** 확인합니다.
   *
   * 어기면 토스가 거절하는데, 그 실패는 결제창이 열리기도 전에 일어나
   * 화면에는 "눌러도 아무 일이 없다" 로만 보입니다. 여기서 걸러 내면 무엇이
   * 잘못됐는지가 코드로 남습니다.
   */
  if (!TOSS_ORDER_ID.test(input.orderId)) {
    return {
      outcome: 'rejected',
      code: 'INVALID_ORDER_ID',
      message: `주문번호가 토스 규격(6~64자, 영숫자와 -_=)을 벗어납니다: ${input.orderId}`,
    };
  }

  try {
    await input.widgets.requestPayment({
      orderId: input.orderId,
      orderName: input.orderName,
      successUrl: input.successUrl,
      failUrl: input.failUrl,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerMobilePhone: input.customerMobilePhone,
    });
    return { outcome: 'redirecting' };
  } catch (error) {
    const e = error as { code?: string; message?: string } | null;
    return { outcome: 'rejected', code: e?.code, message: e?.message };
  }
}
