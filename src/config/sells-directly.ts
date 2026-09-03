/**
 * "우리 결제로 직접 파는가" 를 정하는 **한 벌의 규칙.**
 *
 * ── 왜 따로 떼어냈나 ────────────────────────────────────────
 * 이 판정은 두 곳에서 필요합니다.
 *
 *   `src/config/runtime.ts`   화면이 무엇을 그릴지 (`import.meta.env`)
 *   `astro.config.ts`         사이트맵에 `/reviews` 를 넣을지 (Node)
 *
 * 설정 파일은 콘텐츠 레이어보다 먼저 평가되어 `import.meta.env` 를 타는
 * 모듈을 물릴 수 없습니다. 그래서 한동안 **같은 규칙을 두 벌 적어** 두었고,
 * 재 보니 세 자리에서 갈렸습니다(판매를 켠 상태 기준):
 *
 *   PUBLIC_CHECKOUT_MODE=Internal   사이트맵 false / 화면 true
 *   PUBLIC_CHECKOUT_MODE=nonsense   사이트맵 false / 화면 true
 *   PUBLIC_PRODUCT_PRICE=abc        사이트맵 false / 화면 true
 *
 * 갈리면 사이트맵은 "그 페이지 없다", 화면은 "있다" 고 말합니다. 마지막
 * 경우는 **화면 쪽이 틀렸습니다** — `Number('abc')` 는 `NaN` 이고 `NaN != null`
 * 은 참이라, 가격이 없는데 결제를 열었습니다.
 *
 * 그래서 규칙을 여기 한 벌만 두고 양쪽이 **자기 환경변수를 들고 와서**
 * 부릅니다. `reserved-paths.ts` 가 `indexedLocales` 를 인자로 받는 것과 같은
 * 이유이고, 이 파일도 아무것도 import 하지 않습니다.
 */

export type CheckoutMode = 'internal' | 'external' | 'none';

const MODES: readonly string[] = ['internal', 'external', 'none'];

/**
 * 이 빌드에서 쓰이는 결제 방식.
 *
 * 환경변수가 셋 중 하나일 때만 씁니다. 오타(`Internal`)나 헛값은 **조용히
 * 무시하고** 설정 파일을 따릅니다 — 오타 하나로 결제 화면이 열리고 닫히는
 * 것보다, 적어 둔 설정대로 도는 편이 낫습니다.
 */
export function resolveCheckoutMode(
  override: string | undefined,
  fromConfig: string,
): CheckoutMode {
  if (override !== undefined && MODES.includes(override)) return override as CheckoutMode;
  return (MODES.includes(fromConfig) ? fromConfig : 'none') as CheckoutMode;
}

/**
 * 이 빌드에서 쓰이는 가격. 아직 정해지지 않았으면 null.
 *
 * ⚠️ `NaN` 을 `null` 로 접습니다. 숫자가 아닌 값을 그대로 흘리면 "가격이
 * 있다" 는 판정만 통과하고 화면에는 `NaN원` 이 찍힙니다.
 */
export function resolvePrice(
  override: string | undefined,
  fromConfig: number | null,
): number | null {
  const raw = override !== undefined && override !== '' ? Number(override) : fromConfig;
  if (raw === null || raw === undefined || Number.isNaN(raw)) return null;
  return raw;
}

/** 자사 결제 화면(장바구니·체크아웃)을 노출할지. 가격이 없으면 열 수 없습니다. */
export function sellsDirectly(mode: CheckoutMode, price: number | null): boolean {
  return mode === 'internal' && price !== null;
}
