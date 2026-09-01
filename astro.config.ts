import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { hastTableScroll } from './src/hast/table-scroll';
import { ORIGIN, LOCALES, DEFAULT_LOCALE, LOCALE_TAGS, INDEXED_LOCALES } from './src/config/site';
import { inSitemap } from './src/config/reserved-paths';

import sentry from '@sentry/astro';

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
  integrations: [sitemap({
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
  }), sentry({
    /*
     * 소스맵 업로드.
     *
     * 이게 없으면 Sentry 에 뜨는 스택이 `page.CfoeUBPN.js:1:4821` 처럼 압축된
     * 자리만 가리켜, 어느 파일 어느 줄인지 알 수 없습니다.
     *
     * 토큰은 **환경변수로만** 받습니다. 저장소가 공개라 커밋하면 그대로
     * 노출됩니다. 없으면 업로드만 건너뛰고 빌드는 그대로 됩니다 — 로컬에서
     * 토큰 없이 빌드하는 사람을 막지 않기 위해서입니다.
     *
     * CI 에 넣으려면 GitHub 저장소 Secrets 에 `SENTRY_AUTH_TOKEN` 을 추가하고
     * 워크플로의 빌드 단계에 env 로 넘기세요.
     */
    org: 'avora-labs-vd',
    project: 'javascript-astro',
    authToken: process.env.SENTRY_AUTH_TOKEN,
    sourceMapsUploadOptions: {
      enabled: Boolean(process.env.SENTRY_AUTH_TOKEN),
    },
    /*
     * 빌드 로그를 조용히 둡니다. 토큰이 없을 때 경고를 길게 뿜는데, 그게
     * 정상 상태(로컬 빌드)라 매번 나오면 진짜 경고가 묻힙니다.
     */
    telemetry: false,
  })],
  vite: {
    build: {
      cssCodeSplit: false, // 스타일이 작아 파일 하나로 묶는 편이 요청 수에 유리합니다
    },
    define: {
      /*
       * Sentry 에서 안 쓰는 부분을 빌드 때 잘라냅니다.
       *
       * 이 플래그들을 false 로 바꾸면 해당 코드가 죽은 가지가 되어 번들에서
       * 빠집니다. 트레이싱과 리플레이를 껐으므로(sentry.client.config.js) 그
       * 코드가 실려 갈 이유가 없습니다.
       */
      __SENTRY_DEBUG__: false,
      __SENTRY_TRACING__: false,
      __RRWEB_EXCLUDE_IFRAME__: true,
      __RRWEB_EXCLUDE_SHADOW_DOM__: true,
      __SENTRY_EXCLUDE_REPLAY_WORKER__: true,
    },
  },
});