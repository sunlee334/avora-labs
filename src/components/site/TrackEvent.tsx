"use client";

import { useEffect } from "react";
import { track, type AnalyticsParams } from "@/lib/analytics";

/**
 * 서버 컴포넌트에서 분석 이벤트를 보내기 위한 빈 클라이언트 컴포넌트. 마운트 시 한 번 전송한다.
 * `once` 키를 주면 같은 브라우저 세션에서 한 번만 보낸다 (결제 완료 화면 새로고침으로 purchase 가 중복되지 않게).
 */
export function TrackEvent({ name, params, once }: { name: string; params?: AnalyticsParams; once?: string }) {
  useEffect(() => {
    if (once) {
      try {
        const key = `paros-analytics:${once}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch {
        // 저장소를 못 쓰는 환경이면 그냥 보낸다
      }
    }
    track(name, params);
    // 마운트 시 1회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
