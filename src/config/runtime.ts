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

/** 1차 오픈처럼 외부몰로 보내는 상태인지. */
export const SELLS_EXTERNALLY = CHECKOUT_MODE === 'external';

export const EXTERNAL_STORE_URL: string | null = country.externalStoreUrl || null;

/** 이 빌드가 기본 설정과 다른 상태인지 — 개발 중 혼동을 막기 위한 표시용. */
export const IS_OVERRIDDEN = Boolean(modeOverride || priceOverride);
