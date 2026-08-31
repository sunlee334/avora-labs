import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { hastTableScroll } from './src/hast/table-scroll';
import { ORIGIN, LOCALES, DEFAULT_LOCALE, LOCALE_TAGS, INDEXED_LOCALES } from './src/config/site';
import { inSitemap } from './src/config/reserved-paths';

/**
 * 언어별 라우팅은 `src/pages/[lang]/` 동적 라우트가 담당합니다.
 * Astro 내장 i18n 의 prefixDefaultLocale 방식은 언어 수만큼 폴더를 복제해야 해서,
 * 페이지 하나를 5벌로 관리하게 됩니다. 동적 라우트는 파일 하나로 5개 언어를 생성합니다.
 *
 * i18n 블록은 라우팅이 아니라 메타데이터(사이트맵 hreflang 생성)를 위해 둡니다.
 */
export default defineConfig({
  site: ORIGIN,
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },

  /*
   * 마크다운은 Astro 7 의 기본 프로세서(Sätteri)가 그립니다. 여기서 바꾸는
   * 것은 표를 가로 스크롤 상자로 감싸는 것 하나뿐입니다 — body 에
   * overflow-x:hidden 이 걸려 있어 넓은 표가 스크롤바 없이 잘려 보입니다.
   * CSS 로 하려면 표 시맨틱을 깨야 해서 트리 단계에서 감쌉니다.
   */
  markdown: {
    processor: satteri({
      hastPlugins: [hastTableScroll],
    }),
  },
  i18n: {
    locales: [...LOCALES],
    defaultLocale: DEFAULT_LOCALE,
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false, // 루트 리다이렉트는 Worker 가 Accept-Language 로 처리합니다
    },
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: DEFAULT_LOCALE,
        locales: Object.fromEntries(
          LOCALES.map((l) => [l, LOCALE_TAGS[l]]),
        ) as Record<string, string>,
      },
      /*
       * 사이트맵은 "이 주소를 색인해 달라" 는 제출입니다.
       * 그러니 noindex 를 단 페이지나 robots.txt 가 막은 경로가 여기 들어가면,
       * 우리가 서로 반대되는 신호를 동시에 보내는 셈입니다.
       * Search Console 은 이것을 오류로 보고합니다.
       *
       * 실제로 46개 주소 중 26개가 그런 상태였고, **관리 화면 경로까지
       * 공개 사이트맵에 실려 있었습니다.**
       *
       * 새 페이지에 noindex 를 달면 `src/config/reserved-paths.ts` 에 넣으세요.
       * `tests/e2e/product-seo.spec.ts` 가 사이트맵의 모든 주소를 실제로
       * 열어 보고 noindex 가 섞여 있으면 실패합니다.
       *
       * ⚠️ 이 검사는 **부분 문자열**입니다. 그래서 글 slug 도 삼킬 수 있어
       *    (`posts/checkout-tips` → `/checkout`), 같은 배열을
       *    `scripts/check-slugs.mjs` 가 접두 일치로 미리 막습니다.
       */
      /*
       * 판정은 `inSitemap()` 이 합니다 — 여기서 목록을 다시 적으면 안 됩니다
       * (tests/e2e/fonts-content.spec.ts 가 그걸 봅니다). 색인 대상 언어만
       * 넘겨줍니다.
       */
      filter: (url: string) => inSitemap(url, INDEXED_LOCALES),
    }),
  ],
  vite: {
    build: {
      cssCodeSplit: false, // 스타일이 작아 파일 하나로 묶는 편이 요청 수에 유리합니다
    },
  },
});
