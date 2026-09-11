import type { MetadataRoute } from "next";
import { SITE } from "@/lib/config";

/** 검색 엔진 안내. 개인 화면·관리자·API 는 색인하지 않는다. 언어 접두사 경로도 같은 규칙. */
export default function robots(): MetadataRoute.Robots {
  const base = SITE.url.replace(/\/$/, "");
  const privatePaths = ["/admin", "/api/", "/account", "/checkout", "/cart", "/login", "/register", "/orders/lookup"];
  const disallow = privatePaths.flatMap((p) => [p, `/en${p}`, `/th${p}`, `/vi${p}`, `/zh${p}`]);
  return {
    rules: [{ userAgent: "*", allow: "/", disallow }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
