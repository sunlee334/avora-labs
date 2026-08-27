import type { APIRequestContext } from '@playwright/test';

/**
 * 사이트맵과 구조화 데이터를 훑는 도구.
 *
 * `product-seo.spec.ts` 안에만 있던 것을 꺼냈습니다. 다른 스펙이 "사이트
 * 전체" 를 확인해야 할 때 — 예컨대 FAQPage 를 내는 페이지가 정말 한 곳뿐인지 —
 * 같은 방식으로 순회해야 하는데, 스펙 파일 안 지역 함수는 import 할 수
 * 없었습니다.
 */

/** 사이트맵에 실린 주소 전부. */
export async function sitemapUrls(request: APIRequestContext): Promise<string[]> {
  const xml = await (await request.get('/sitemap-0.xml')).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

/**
 * HTML 안의 JSON-LD 블록 전부.
 *
 * `page` 가 아니라 문자열을 받습니다 — 사이트맵 전수 순회는 브라우저를
 * 46번 띄우는 대신 `request` 로 HTML 만 받아 보기 때문입니다.
 */
export function jsonLdOf(html: string): any[] {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)];
  return blocks.map((m) => JSON.parse(m[1]));
}

/** 언어 접두어와 뒤 슬래시를 뗀 경로. `/ko/support/` → `support` */
export function pathKey(url: string): string {
  return new URL(url).pathname.replace(/^\/[a-z]{2}\//, '').replace(/\/$/, '');
}
