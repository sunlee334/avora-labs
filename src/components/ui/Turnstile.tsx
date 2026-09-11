"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/i18n/client";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const LANGUAGE: Record<string, string> = { ko: "ko", en: "en", th: "th", vi: "vi", zh: "zh-cn" };

let ready: Promise<void> | null = null;

/** api.js 를 한 번만 넣고, window.turnstile 이 준비되면 resolve 한다. */
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src^="${SCRIPT_SRC.split("?")[0]}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      ready = null;
      reject(new Error("turnstile script failed"));
    });
  });
  return ready;
}

/**
 * Cloudflare Turnstile 위젯. 사이트 키가 빌드에 없으면 아무것도 그리지 않는다 (서버 검증도 함께 꺼짐).
 * 토큰은 같은 <form> 안의 숨김 필드 `cf-turnstile-response` 로 전송된다. 토큰은 1회용이므로
 * 제출 결과(`resetKey`)가 바뀔 때마다 위젯을 초기화한다.
 */
export function Turnstile({ resetKey }: { resetKey?: unknown }) {
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!SITE_KEY || !container.current) return;
    let cancelled = false;
    const element = container.current;
    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile || widgetId.current) return;
        widgetId.current = window.turnstile.render(element, {
          sitekey: SITE_KEY,
          theme: "light",
          language: LANGUAGE[locale] ?? "auto",
          callback: (value: string) => setToken(value),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
      })
      .catch(() => {
        /* 스크립트를 못 받으면 위젯 없이 제출된다 — 서버가 거부하고 안내 문구를 보여준다. */
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [locale]);

  // 제출 결과가 바뀌면(실패 안내 등) 토큰을 새로 받는다.
  const firstResult = useRef(true);
  useEffect(() => {
    if (firstResult.current) {
      firstResult.current = false;
      return;
    }
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      setToken("");
    }
  }, [resetKey]);

  if (!SITE_KEY) return null;

  return (
    <div>
      <div ref={container} />
      <input type="hidden" name="cf-turnstile-response" value={token} />
    </div>
  );
}
