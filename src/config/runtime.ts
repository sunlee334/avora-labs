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

