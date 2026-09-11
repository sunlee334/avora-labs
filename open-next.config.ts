import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * 모든 페이지가 동적(쿠키·DB)이라 ISR 증분 캐시는 사용하지 않는다.
 * 정적/ISR 페이지가 생기면 여기서 R2 incremental cache 를 켠다.
 */
export default defineCloudflareConfig({});
