import type { NextConfig } from "next";

/**
 * CF_BUILD=1 이면 Cloudflare Workers(OpenNext) 빌드다.
 * - DB/업로드 드라이버를 workerd 구현(D1/R2)으로 alias 한다.
 * - Workers 에는 이미지 최적화 서버가 없으므로 next/image 를 unoptimized 로 둔다.
 */
const isCloudflareBuild = process.env.CF_BUILD === "1";

const nextConfig: NextConfig = {
  serverExternalPackages: isCloudflareBuild ? [] : ["@libsql/client"],
  experimental: {
    // 서버 액션 본문 한도는 전역이라 로그인·가입에도 적용된다. 큰 값을 두면 레이트리밋 판정 전에 Worker 가
    // 본문을 전량 버퍼링하므로 작게 유지한다. 리뷰 사진(R2 활성화 시)은 전용 라우트 핸들러로 올린다.
    serverActions: { bodySizeLimit: "1mb" },
  },
  turbopack: {
    resolveAlias: {
      "paros-db-driver": isCloudflareBuild ? "./src/db/driver.workerd.ts" : "./src/db/driver.node.ts",
      "paros-upload-driver": isCloudflareBuild
        ? "./src/lib/upload-driver.workerd.ts"
        : "./src/lib/upload-driver.node.ts",
    },
  },
  images: isCloudflareBuild
    ? { unoptimized: true }
    : {
        // 외부 이미지 핫링크를 사용하지 않는다. 모든 비주얼은 /public 또는 업로드 라우트에서 제공.
        remotePatterns: [],
      },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          ...(isCloudflareBuild
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
