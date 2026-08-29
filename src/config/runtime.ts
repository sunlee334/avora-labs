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

