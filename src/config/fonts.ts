import type { Locale } from './site';

/**
 * 이 언어 페이지가 **미리 받아 둘** 폰트 파일.
 *
 * ── 왜 전부가 아닌가 ────────────────────────────────────────
 * preload 는 LCP 와 대역폭을 두고 히어로 이미지와 경쟁합니다. 첫 화면에서
 * 곧바로 보이는 것만 넣습니다 — 본문, 그리고 제목의 라틴과 이 언어의 문자.
 * 라벨용 고정폭(mono)은 작고 `font-display: swap` 으로 늦게 와도 글이 읽히므로
 * 여기 두지 않습니다.
 *
 * ⚠️ 이 목록은 `scripts/build-fonts.mjs` 의 FACES 와 짝을 이룹니다. 서체를
 *    더하거나 이름을 바꾸면 여기가 옛 파일을 가리키게 되고, 그러면 **404 를
 *    미리 받는** 상태가 됩니다 — 화면에는 아무 흔적이 없습니다.
 *    `tests/e2e/fonts-preload.spec.ts` 가 실제 생성된 파일과 대조합니다.
 */
export const PRELOAD: Record<Locale, readonly string[]> = {
  ko: ['body.woff2', 'display.woff2', 'display-kr.woff2'],
  en: ['body.woff2', 'display.woff2'],
  zh: ['body.woff2', 'display.woff2', 'display-sc.woff2'],
  th: ['body.woff2', 'body-th.woff2', 'display.woff2', 'display-th.woff2'],
  vi: ['body.woff2', 'display.woff2'],
} as const;
