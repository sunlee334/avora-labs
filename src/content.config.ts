/**
 * 공지·읽을거리 글.
 *
 * ── 왜 데이터베이스가 아니라 파일인가 ───────────────────────
 * 이 사이트는 정적 빌드이고 SSR 어댑터가 없습니다. 글을 D1 에 넣으면
 * 상세 페이지를 Worker 가 만들어야 하고, 그러면 세 가지가 따라옵니다 —
 * 사이트맵에 자동으로 안 올라가고, 상세 URL 을 손으로 짜야 하고,
 * **글자가 폰트 서브셋에 없어 화면에서 서체가 섞입니다.**
 *
 * 파일로 두면 셋 다 사라집니다. 빌드가 주소를 만들고, 사이트맵이 그걸
 * 줍고, `scripts/build-fonts.mjs` 가 글자를 미리 읽습니다.
 * 대가는 글 하나를 올릴 때마다 배포가 필요하다는 것입니다.
 *
 * ── 로케일은 디렉터리, 번역본은 같은 slug ───────────────────
 *   src/content/posts/ko/shipping-notice.md
 *   src/content/posts/en/shipping-notice.md    ← 같은 글의 영문판
 *
 * 프론트매터에 `locale` 을 두지 않는 이유: 진실이 둘이 되면 어긋납니다.
 * 디렉터리 하나만 봅니다.
 *
 * `translationKey` 같은 필드를 두지 않는 이유: 번역본을 다른 slug 로
 * 묶으면 페이지가 내는 hreflang 과 `@astrojs/sitemap` 이 만드는
 * `xhtml:link` 가 서로 다른 신호가 됩니다(사이트맵은 경로가 같은 것끼리
 * 묶습니다). slug 를 공유하면 둘이 저절로 일치합니다.
 *
 * ── slug 검사는 여기서 못 합니다 ────────────────────────────
 * 컬렉션 스키마는 **프론트매터만** 받습니다. slug 는 파일 경로에서
 * 나오므로 스키마 함수가 볼 수 없습니다. `scripts/check-slugs.mjs` 가
 * `prebuild` 에서 대신 봅니다 — 사이트맵 filter 가 부분 문자열 검사라
 * `checkout-tips` 같은 이름이 색인에서 조용히 빠지기 때문입니다.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  // id 가 `ko/shipping-notice` 형태로 나옵니다. 첫 조각이 언어입니다.
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),

    /**
     * notice  — 운영 공지(배송·휴무·품절). 손님에게 알리는 것
     * journal — 읽을거리(성분·자외선). 검색으로 새 사람을 데려오는 것
     *
     * 목적이 다르므로 목록에서 갈라 보여줍니다.
     */
    category: z.enum(['notice', 'journal']),

    /** 발행일. 답변엔진이 "언제 쓴 글인가" 를 봅니다. */
    publishedAt: z.coerce.date(),

    /**
     * 실제로 고친 날에만 넣습니다. 발행일을 복사해 넣으면
     * "고친 적 없음" 과 "발행일에 고침" 을 구분할 수 없게 됩니다.
     */
    updatedAt: z.coerce.date().optional(),
  }),
});

export const collections = { posts };
