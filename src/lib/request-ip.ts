import "server-only";
import { headers } from "next/headers";

/**
 * 레이트리밋용 클라이언트 IP.
 * Cloudflare 뒤에서는 `cf-connecting-ip` 가 유일하게 신뢰할 수 있는 값이다 (클라이언트가 위조할 수 없음).
 * 그 외 프록시에서는 X-Forwarded-For 의 **마지막** 항목(가장 가까운 프록시가 붙인 값)을 쓴다.
 * `x-real-ip` 등 클라이언트가 임의로 보낼 수 있는 헤더는 신뢰하지 않는다.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return "local";
}
