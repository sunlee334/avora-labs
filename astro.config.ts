import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { hastTableScroll } from './src/hast/table-scroll';
import { ORIGIN, LOCALES, DEFAULT_LOCALE, LOCALE_TAGS, INDEXED_LOCALES } from './src/config/site';
import { inSitemap } from './src/config/reserved-paths';
import { resolveCheckoutMode, resolvePrice, sellsDirectly } from './src/config/sells-directly';
import { frontmatterOf, field, isDraft, categoryOf } from './src/config/post-frontmatter';
import { loadEnv } from 'vite';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import paymentConfig from './src/config/payment-config.json' with { type: 'json' };
import paymentProduct from './src/data/product.json' with { type: 'json' };

import sentry from '@sentry/astro';

/**
 * 자사 결제가 켜져 있는가. 꺼져 있으면 후기가 존재할 수 없어 사이트맵에서 뺍니다.
 *
 * ⚠️ **환경변수만 보면 안 됩니다.** `src/config/runtime.ts` 는 환경변수를
 * *덮어쓰기* 로만 쓰고, 없으면 `payment-config.json` 의 `checkout` 과
 * `product.json` 의 `price` 를 봅니다. 그 파일 주석이 못 박아 두었습니다 —
 * "운영 배포에서는 이 변수들을 설정하지 않습니다. 실제로 결제를 열 때는
 * 환경변수가 아니라 payment-config.json 과 product.json 을 고치세요."
 *
 * 처음에는 여기서 환경변수만 읽었습니다. 그러면 문서가 시키는 대로 설정
 * 파일을 고쳐 결제를 열었을 때 **화면은 후기를 보여주는데 사이트맵에서는
 * 영영 빠진 채** 로 남습니다. `reserved-paths.ts` 가 "결제가 켜지는 순간
 * 사이트맵에도 저절로 돌아옵니다" 라고 적어 둔 것이 거짓이 됩니다.
 *
 * 같은 규칙을 여기서 다시 씁니다 — `runtime.ts` 를 import 할 수는 없습니다
 * (`import.meta.env` 를 타서 설정 파일 평가 시점에 로드되지 않습니다).
 * 판정 순서와 기본값을 그쪽과 똑같이 맞춥니다.
 */
/*
 * ⚠️ `.env` 는 `process.env` 에 오지 않습니다.
 *
 * Vite 는 root·envDir·mode 를 정한 뒤에야 `.env` 를 읽어 `import.meta.env` 에
 * 넣습니다. 설정 파일은 그보다 먼저 평가되므로, 여기서 `process.env` 만 보면
 * `.env` 에 `PUBLIC_CHECKOUT_MODE` 를 적어 둔 사람에게 **화면과 사이트맵이
 * 서로 다른 값을 보게 됩니다.** `loadEnv` 가 Vite 와 같은 방식으로 읽어
 * `process.env` 의 값과 합쳐 줍니다.
 */
const ENV = loadEnv(
  process.env.NODE_ENV === 'development' ? 'development' : 'production',
  process.cwd(),
  'PUBLIC_',
);

/*
 * 판정 규칙은 `src/config/sells-directly.ts` 한 곳에 있습니다. 여기서는
 * Node 쪽 값을 들고 가서 부르기만 합니다 — 화면(`runtime.ts`)이 같은 함수를
 * 자기 값으로 부릅니다.
 */
const SELLS_DIRECTLY = sellsDirectly(
  resolveCheckoutMode(
    ENV.PUBLIC_CHECKOUT_MODE,
    paymentConfig.countries[paymentConfig.defaultCountry as 'KR'].checkout as string,
  ),
  resolvePrice(ENV.PUBLIC_PRODUCT_PRICE, paymentProduct.price as number | null),
);

/**
 * 글 주소 → 마지막으로 달라진 날.
 *
 * `getCollection` 을 쓸 수 없어(설정 파일이 콘텐츠 레이어보다 먼저 평가됩니다)
 * 프론트매터를 직접 읽습니다. 스키마가 이미 `publishedAt`·`updatedAt` 을
 * 강제하므로 형식은 믿을 수 있고, 여기서는 있는 값을 옮기기만 합니다.
 *
 * 고친 날이 있으면 그것을, 없으면 발행일을 씁니다 — `dateModified` 를
 * 발행일로 채우지 않는 `jsonld.ts` 의 규칙과 어긋나지 않습니다. 저쪽은
 * "고친 적 있는가" 를 말하고, 이쪽은 "언제까지의 내용인가" 를 말합니다.
 */
/*
 * 내보낸 읽을거리가 하나라도 있는가.
 *
 * `nav-gates.ts` 의 `HAS_JOURNAL` 과 **같은 사실** 인데, 그쪽은
 * `import.meta.glob` 이라 설정 파일에서 쓸 수 없습니다. 판정 자체는
 * `post-frontmatter.ts` 의 같은 함수를 부르므로 규칙은 한 벌입니다.
 */
let HAS_JOURNAL = false;
const POST_DATES = new Map<string, string>();
for (const locale of readdirSync('./src/content/posts')) {
  /*
   * 디렉터리인지 먼저 봅니다. macOS 가 만드는 `.DS_Store` 가 여기 있으면
   * `readdirSync` 가 ENOTDIR 로 던지고, 설정 파일 평가 중이라 Astro 의 오류
   * 처리를 거치지 못한 채 `npm run build` 와 `npm run dev` 가 통째로 죽습니다.
   * `scripts/check-slugs.mjs` 가 같은 자리에서 이미 이 검사를 하고 있었는데,
   * 이 반복문을 새로 쓰면서 빠뜨렸습니다.
   */
  const dir = `./src/content/posts/${locale}`;
  if (!statSync(dir).isDirectory()) continue;

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const front = frontmatterOf(readFileSync(`${dir}/${file}`, 'utf8'));

    // 초안은 페이지 자체가 만들어지지 않으므로 사이트맵에도 없습니다.
    if (isDraft(front)) continue;
    if (categoryOf(front) === 'journal') HAS_JOURNAL = true;

    const date = field(front, 'updatedAt') ?? field(front, 'publishedAt');
    // 주소는 카테고리가 정합니다 — `src/lib/posts.ts` 의 BASE 와 같은 표입니다.
    const base = categoryOf(front) === 'journal' ? 'journal' : 'support/notice';
    if (date) POST_DATES.set(`/${locale}/${base}/${file.replace(/\.md$/, '')}/`, date);
  }
}

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
    filter: (url: string) =>
      inSitemap(url, INDEXED_LOCALES, { sellsDirectly: SELLS_DIRECTLY, hasJournal: HAS_JOURNAL }),
    /*
     * `lastmod` — 이 주소가 마지막으로 달라진 날.
     *
     * 21개 주소에 이 값이 하나도 없었습니다. Google 은 일관되게 붙은 lastmod 를
     * 재크롤 우선순위에 씁니다.
     *
     * ⚠️ **모든 주소에 빌드 시각을 똑같이 박으면 안 됩니다.** 배포할 때마다
     * 사이트 전체가 바뀌었다고 말하는 셈이고, 그러면 이 값이 신호이기를
     * 그칩니다. 실제로 날짜를 아는 것 — 글 — 에만 답니다.
     *
     * 날짜는 마크다운 프론트매터에서 직접 읽습니다. 이 파일은 콘텐츠 레이어보다
     * 먼저 평가되어 `getCollection` 을 쓸 수 없습니다.
     */
    serialize: (item) => {
      const lastmod = POST_DATES.get(new URL(item.url).pathname);
      return lastmod ? { ...item, lastmod } : item;
    },
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