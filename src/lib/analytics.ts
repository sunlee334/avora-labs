/**
 * 웹 분석 이벤트 (GA4 gtag). `NEXT_PUBLIC_ANALYTICS_ID` 가 빌드에 없으면 아무것도 하지 않는다.
 * 클라이언트 전용. 서버 컴포넌트는 <TrackEvent> 로 이벤트를 위임한다.
 * 이벤트 이름·파라미터는 GA4 전자상거래 권장 스키마(view_item, add_to_cart, begin_checkout, purchase)를 따른다.
 */
export const ANALYTICS_ID = process.env.NEXT_PUBLIC_ANALYTICS_ID ?? "";

export type AnalyticsItem = { item_id: string; item_name: string; price: number; quantity: number };
export type AnalyticsParams = Record<string, string | number | boolean | AnalyticsItem[] | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * gtag 대기열을 준비한다 (스크립트 로드 전에 쌓인 명령은 gtag.js 가 로드되며 순서대로 처리한다).
 * - dataLayer 에는 반드시 `arguments` 객체를 넣어야 한다. 배열을 넣으면 gtag.js 가 명령으로 인식하지 않아 아무것도 전송되지 않는다.
 * - config 를 가장 먼저 넣어야 뒤따르는 이벤트가 이 속성으로 전송된다. 그래서 어떤 이벤트든 먼저 부르는 쪽이 초기화한다.
 */
export function ensureGtag(): boolean {
  if (!ANALYTICS_ID || typeof window === "undefined") return false;
  if (typeof window.gtag === "function") return true;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", ANALYTICS_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  return true;
}

export function track(name: string, params: AnalyticsParams = {}): void {
  if (!ensureGtag()) return;
  window.gtag?.("event", name, params);
}
