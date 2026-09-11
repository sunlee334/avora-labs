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

export function track(name: string, params: AnalyticsParams = {}): void {
  if (!ANALYTICS_ID || typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
