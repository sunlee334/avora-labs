import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { ORIGIN, LOCALES, DEFAULT_LOCALE, LOCALE_TAGS } from './src/config/site';

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
      filter: (page) => !page.includes('/404'),
    }),
  ],
  vite: {
    build: {
      cssCodeSplit: false, // 스타일이 작아 파일 하나로 묶는 편이 요청 수에 유리합니다
    },
  },
});
