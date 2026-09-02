/**
 * 빌드 시점 오버라이드.
 *
 * 실제 값은 payment-config.json 과 product.json 이 정합니다.
 * 다만 자사 결제를 켜기 전에 그 흐름을 미리 돌려보고 싶을 때가 있어서,
 * 환경변수로 잠깐 덮어쓸 수 있는 통로를 하나 뒀습니다.
 *
 *   PUBLIC_CHECKOUT_MODE=internal   자사 결제 화면을 켭니다 (기본값은 설정 파일대로)
 *   PUBLIC_PRODUCT_PRICE=32000      가격이 아직 없을 때 임시 금액을 넣습니다
 *
 * 예: PUBLIC_CHECKOUT_MODE=internal PUBLIC_PRODUCT_PRICE=32000 npm run build
 *
 * 운영 배포에서는 이 변수들을 설정하지 않습니다. 실제로 결제를 열 때는
 * 환경변수가 아니라 payment-config.json 과 product.json 을 고치세요 —
 * 그래야 무엇이 켜져 있는지가 저장소에 남습니다.
 */
import paymentConfig from './payment-config.json';
import commerceConfig from './commerce.json';
import productData from './../data/product.json';

type CheckoutMode = 'internal' | 'external' | 'none';

const defaultCountry = paymentConfig.defaultCountry as keyof typeof paymentConfig.countries;
const country = paymentConfig.countries[defaultCountry];

const modeOverride = import.meta.env.PUBLIC_CHECKOUT_MODE as CheckoutMode | undefined;
const priceOverride = import.meta.env.PUBLIC_PRODUCT_PRICE;

/** 이 빌드에서 쓰이는 결제 방식. */
export const CHECKOUT_MODE: CheckoutMode =
  modeOverride === 'internal' || modeOverride === 'external' || modeOverride === 'none'
    ? modeOverride
    : (country.checkout as CheckoutMode);

/** 이 빌드에서 쓰이는 가격. 아직 정해지지 않았으면 null. */
export const PRICE: number | null =
  priceOverride != null && priceOverride !== ''
    ? Number(priceOverride)
    : (productData.price as number | null);

export const CURRENCY = productData.currency;

/** 자사 결제 화면(장바구니·체크아웃)을 노출할지. 가격이 없으면 열 수 없습니다. */
export const SELLS_DIRECTLY = CHECKOUT_MODE === 'internal' && PRICE != null;


export const EXTERNAL_STORE_URL: string | null = country.externalStoreUrl || null;

/**
 * 주문이 존재할 수 있는가.
 *
 * 자사 결제든 외부몰이든, 살 길이 하나라도 있으면 참입니다. 이 사실 하나에
 * 여러 화면이 걸려 있습니다 — 마이페이지의 주문 영역, 홈의 신청 폼과 CTA
 * 무게, 개인정보처리방침의 수집 항목.
 *
 * 각자 `!SELLS_DIRECTLY && !EXTERNAL_STORE_URL` 로 다시 쓰면 같은 사실이
 * 여러 벌이 됩니다. 외부몰을 켜는 날(payment-config.json 의 externalStoreUrl
 * 한 줄) 전부를 함께 고쳐야 하는데, 하나를 빠뜨려도 아무것도 알려주지
 * 않습니다.
 *
 * ⚠️ `SELLS_DIRECTLY` 와 헷갈리면 안 됩니다. 오늘은 externalStoreUrl 이 전부
 *    비어 있어 두 값이 같지만, 물어보는 것이 다릅니다:
 *
 *      SELLS_DIRECTLY  우리 DB 에 주문이 생기는가
 *      CAN_ORDER       손님이 어디서든 살 수 있는가
 *
 *    주문 내역·배송지·후기처럼 **우리 주문에 매달린 것** 은 SELLS_DIRECTLY 를
 *    봐야 합니다. 외부몰만 켠 빌드에서 CAN_ORDER 로 열면 빈 목록과 죽은 폼이
 *    나옵니다. 반대로 "살 수 있느냐" 를 묻는 자리(출시 알림 폼, 그 수집 고지)는
 *    CAN_ORDER 가 맞습니다.
 */
export const CAN_ORDER = SELLS_DIRECTLY || EXTERNAL_STORE_URL !== null;

/**
 * 회원 기능(로그인·마이페이지)을 노출할지.
 *
 * 카카오·네이버 연동은 도메인과 사업자 정보가 있어야 켤 수 있습니다.
 * 그때까지는 꺼 둡니다 — 눌러도 아무 일이 없는 로그인 버튼을 보여주는 것은
 * 없는 것만 못하고, 이용약관의 "회원가입이 없습니다" 문구도 이 값을 따라
 * 바뀌므로 켜지 않으면 계속 사실입니다.
 *
 *   PUBLIC_ACCOUNTS=on npm run build   회원 기능을 켠 채로 빌드합니다
 *   PUBLIC_ACCOUNTS=off npm run build  끈 채로 빌드합니다
 *
 * 환경변수를 주지 않으면 commerce.json 의 accounts.enabled 를 따릅니다.
 * 켜고 끄는 판단은 그 파일에 남습니다 — 환경변수로만 켜면 무엇이 켜져 있는지가
 * 저장소에 남지 않고, 다음 사람이 배포 명령을 봐야만 알 수 있습니다.
 */
export const ACCOUNTS_ENABLED =
  import.meta.env.PUBLIC_ACCOUNTS != null
    ? import.meta.env.PUBLIC_ACCOUNTS === 'on'
    : commerceConfig.accounts.enabled;


/**
 * 결제창을 띄울 PG 의 클라이언트 키. 없으면 null.
 *
 * ── 왜 이 값이 공개 상수인가 ────────────────────────────────
 * 토스페이먼츠 주문서형의 클라이언트 키(`test_gck_` / `live_gck_`)는 **브라우저에 그대로
 * 나가는 값** 입니다(문서: reference/using-api/authorization). 결제창을 여는
 * 데 쓰이고, 승인은 서버가 시크릿 키로 따로 합니다. 그래서 저장소에 커밋해도
 * 되고, 커밋하는 편이 낫습니다 — 어느 환경이 켜져 있는지가 코드에 남습니다.
 *
 * ⚠️ 시크릿 키(`test_gsk_` / `live_gsk_`)는 **여기에 절대 오지 않습니다.**
 *    워커 환경변수로만 들어가고(`wrangler secret put TOSS_SECRET_KEY`),
 *    `payment-secrets.spec.ts` 가 저장소에 새어 들어오는지 지킵니다.
 *
 * ── 비어 있으면 무슨 일이 일어나는가 ────────────────────────
 * 결제창 SDK 를 아예 불러오지 않습니다. 체크아웃은 주문만 만들고 완료
 * 화면으로 넘어갑니다 — 계약 전에도 주문 생성·승인 흐름 전체를 돌려볼 수
 * 있게 하려는 것입니다. 키가 들어오는 순간 결제창이 그 사이에 낍니다.
 *
 *   PUBLIC_TOSS_CLIENT_KEY=test_gck_xxx npm run build
 *
 * 다른 오버라이드와 같은 규칙입니다 — 실제로 켤 때는 환경변수가 아니라
 * `payment-config.json` 을 고치세요.
 */
const providerConfig = 'provider' in country ? country.provider : null;
const clientKeyOverride = import.meta.env.PUBLIC_TOSS_CLIENT_KEY as string | undefined;

/**
 * 클라이언트 키의 생김새. 주문서형은 `gck`, API 개별 연동은 `ck` 입니다.
 *
 * ⚠️ **이 검사가 없으면 환경변수로 시크릿을 배포할 수 있습니다.**
 *
 * `payment-secrets.spec.ts` 는 저장소 파일만 훑습니다. 그래서 설정 파일은
 * 지켜지지만 `PUBLIC_TOSS_CLIENT_KEY=test_gsk_… npm run build` 는 아무
 * 저항 없이 지나가고, 시크릿이 **모든 HTML 에** 실려 나갑니다. 저장소
 * 스캔은 `dist` 를 건너뛰므로 그것도 잡지 못합니다.
 *
 * 그래서 빌드를 멈춥니다. 잘못된 키로 배포되는 것보다 배포가 안 되는 편이
 * 낫습니다.
 */
/*
 * ⚠️ `g` 는 **선택이 아닙니다.**
 *
 * 처음에는 `g?` 로 두어 `test_ck_`(API 개별 연동 키)도 통과시켰습니다. 그런데
 * SDK 번들이 그 키를 명시적으로 거부합니다 — 안에 이 문장이 들어 있습니다:
 *
 *   "주문서형, 결제창형 연동 키의 클라이언트 키로 SDK를 연동해주세요.
 *    API 개별 연동 키는 지원하지 않습니다."   (NOT_SUPPORTED_API_INDIVIDUAL_KEY)
 *
 * 즉 헐거운 정규식이 **막으려던 실수를 그대로 통과시키고**, 오류 문구는
 * 심지어 그걸 정상이라고 안내하고 있었습니다. 개발자센터에서 키를 잘못
 * 골라 복사하면 빌드는 통과하고 배포도 되지만, 라이브 전환일에 결제수단이
 * 뜨지 않습니다.
 *
 * 주문서형을 쓰는 한 `gck` 만 받습니다.
 */
const CLIENT_KEY = /^(test|live)_gck_[A-Za-z0-9]+$/;

function checkedClientKey(value: string, where: string): string {
  if (CLIENT_KEY.test(value)) return value;
  throw new Error(
    `[runtime] ${where} 의 값이 주문서형 클라이언트 키가 아닙니다: ${value.slice(0, 12)}…\n` +
      '주문서형·결제창형 연동 키는 test_gck_ / live_gck_ 로 시작합니다.\n' +
      'API 개별 연동 키(test_ck_ / live_ck_)는 SDK 가 거부합니다 — 빌드는 되지만 위젯이 뜨지 않습니다.\n' +
      '시크릿 키(test_gsk_ / live_gsk_)라면 지금 개발자센터에서 재발급하고, ' +
      'npx wrangler secret put TOSS_SECRET_KEY 로만 넣으세요.',
  );
}

/*
 * 끄는 신호는 **`off` 라고 적습니다.**
 *
 * 처음에는 빈 문자열을 "끄라" 로 읽었습니다. 그런데 빈 환경변수는 **실수로
 * 만들어지기 쉽습니다** — CI 변수를 비워 두거나 러너에 `.env` 가 생기면
 * 됩니다. 그러면 운영 빌드가 조용히 결제를 끄고, 아무 검사도 빨개지지
 * 않습니다. 반대로 `off` 라는 글자는 손으로 적어야만 나옵니다.
 *
 * 이 스위치가 필요한 이유: 설정 파일에 테스트 키가 들어가면서, 그대로
 * 빌드하면 E2E 의 체크아웃 검사들이 **실제 토스 SDK 를 부릅니다.**
 * `playwright.config.ts` 가 `off` 를 넘겨 그것을 막습니다.
 */
const WIDGET_OFF = 'off';

export const TOSS_CLIENT_KEY: string | null =
  clientKeyOverride === WIDGET_OFF
    ? null
    : clientKeyOverride
      ? checkedClientKey(clientKeyOverride, 'PUBLIC_TOSS_CLIENT_KEY')
      : providerConfig?.clientKey
        ? checkedClientKey(providerConfig.clientKey, 'payment-config.json 의 provider.clientKey')
        : null;

/*
 * 설정에는 키가 있는데 이 빌드에서 꺼졌다면 **소리를 냅니다.**
 *
 * 조용히 꺼진 빌드는 체크아웃을 "계약 전" 갈래로 흘려보냅니다. 그 갈래는
 * 완료 화면으로 넘기므로, 결제 없이 주문이 접수된 것처럼 보입니다.
 * 의도한 것이라면 로그 한 줄은 값싸고, 의도하지 않았다면 이 줄이 유일한
 * 단서입니다.
 */
if (providerConfig?.clientKey && TOSS_CLIENT_KEY === null) {
  console.warn(
    '[runtime] payment-config.json 에 클라이언트 키가 있는데 이 빌드에서는 꺼졌습니다 ' +
      `(PUBLIC_TOSS_CLIENT_KEY=${WIDGET_OFF}). 결제위젯 없이 빌드됩니다.`,
  );
}
