"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ANALYTICS_ID, ensureGtag } from "@/lib/analytics";

/**
 * GA4 스크립트 주입. 분석 ID 가 있을 때만 동작하며, 라우트가 바뀔 때 page_view 를 직접 보낸다(앱 라우터는 전체 새로고침이 없으므로).
 * 광고 신호·광고 개인화 끔(GA4 는 IP 를 저장하지 않는다). 수집 항목은 개인정보처리방침 7항에 고지돼 있다.
 */
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!ensureGtag()) return;
    if (!document.querySelector('script[data-ga4="1"]')) {
      const script = document.createElement("script");
      script.async = true;
      script.dataset.ga4 = "1";
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_ID)}`;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (!ensureGtag()) return;
    window.gtag?.("event", "page_view", { page_path: pathname, page_location: window.location.href, page_title: document.title });
  }, [pathname]);

  return null;
}
