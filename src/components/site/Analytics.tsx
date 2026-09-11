"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ANALYTICS_ID } from "@/lib/analytics";

/**
 * GA4 스크립트 주입. 분석 ID 가 있을 때만 렌더링되며, 라우트가 바뀔 때 page_view 를 직접 보낸다(앱 라우터는 전체 새로고침이 없으므로).
 * IP 익명화·광고 신호 비활성. 개인정보 수집 항목은 개인정보처리방침에 반영돼 있어야 한다.
 */
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!ANALYTICS_ID) return;
    if (!document.querySelector('script[data-ga4="1"]')) {
      window.dataLayer = window.dataLayer ?? [];
      window.gtag = function gtag(...args: unknown[]) {
        window.dataLayer?.push(args);
      };
      window.gtag("js", new Date());
      window.gtag("config", ANALYTICS_ID, { send_page_view: false, anonymize_ip: true, allow_google_signals: false });
      const script = document.createElement("script");
      script.async = true;
      script.dataset.ga4 = "1";
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_ID)}`;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (!ANALYTICS_ID || typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", { page_path: pathname, page_location: window.location.href });
  }, [pathname]);

  return null;
}
