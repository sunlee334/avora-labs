/**
 * 글의 주소와 목록을 정하는 한 곳.
 *
 * ── 왜 모듈로 빼는가 ───────────────────────────────────────
 * 공지와 읽을거리가 서로 다른 주소로 갈리면서 화면이 넷이 됐습니다 —
 * 목록 둘, 상세 둘. 넷이 각자 "어느 글을 보여줄지" 와 "주소를 어떻게 만들지"
 * 를 알면 언젠가 하나만 고쳐집니다. 그때 생기는 사고는 조용합니다:
 * 초안이 한 화면에서만 보이거나, 상세의 canonical 이 목록과 다른 곳을
 * 가리키거나.
 *
 * 판정은 전부 여기 있습니다. 화면은 카테고리만 넘깁니다.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { LOCALES, type Locale } from '../config/site';
import { isLocale } from '../i18n';

export type Category = CollectionEntry<'posts'>['data']['category'];

/**
 * 카테고리별 주소 뿌리. **이 표가 곧 라우팅입니다.**
 *
 * 읽을거리를 최상위에 두는 이유: 정보성 검색의 착지점이라 주소가 짧아야 하고,
 * 고객센터 하위에 있으면 "고객지원 문서" 로 읽힙니다. 공지는 반대로 고객센터
 * 안에 있는 편이 맞습니다 — 그것을 찾는 사람은 이미 주문한 사람입니다.
 */
export const BASE: Record<Category, string> = {
  journal: 'journal',
  notice: 'support/notice',
};

/** 글 하나의 주소. 언어 접두어를 뺀 형태입니다(`Base.astro` 가 붙입니다). */
export function pathOf(category: Category, slug: string): string {
  return `${BASE[category]}/${slug}`;
}

/** `ko/shipping-notice` → `shipping-notice` */
export function slugOf(entry: CollectionEntry<'posts'>): string {
  return entry.id.split('/')[1];
}

/**
 * 내보낼 글 전부.
 *
 * 초안은 **여기서 한 번** 걸러집니다. 화면마다 거르면 한 곳을 빠뜨렸을 때
 * 초안이 그 화면에서만 보이고, 그건 검수 전 공개입니다.
 */
export async function published(): Promise<CollectionEntry<'posts'>[]> {
  const all = await getCollection('posts');
  return all.filter((post) => !post.data.draft);
}

/**
 * 한 언어의, 한 카테고리 글 목록. 최신 순.
 */
export async function listFor(locale: Locale, category: Category) {
  return (await published())
    .filter((post) => post.id.split('/')[0] === locale && post.data.category === category)
    .sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());
}

/**
 * 상세 페이지의 `getStaticPaths`.
 *
 * ── hreflang 이 없는 주소를 가리키면 안 됩니다 ──────────────
 * 글은 언어마다 있을 수도, 없을 수도 있습니다. 한국어로만 쓴 글에 5개 언어
 * hreflang 을 붙이면 검색엔진이 없는 주소를 크롤링하고 404 를 받습니다.
 * 그래서 **같은 slug 를 가진 언어만** 넘깁니다.
 *
 * 초안은 `published()` 가 이미 걸렀으므로 여기 오지 않습니다 — 주소 자체가
 * 만들어지지 않고, 따라서 404 입니다.
 */
export async function staticPathsFor(category: Category) {
  const posts = (await published()).filter((post) => post.data.category === category);

  /** slug 하나가 어느 언어에 있는지. hreflang 을 만드는 데 씁니다. */
  const bySlug = new Map<string, Locale[]>();
  for (const post of posts) {
    const [lang, slug] = post.id.split('/');
    if (!isLocale(lang)) continue; // 아래에서 오류로 잡습니다
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), lang]);
  }

  return posts.map((post) => {
    const [lang, ...rest] = post.id.split('/');

    /*
     * 로케일 디렉터리 이름을 여기서 확인합니다.
     *
     * `dict()` 는 알 수 없는 언어를 기본 언어로 넘겨 줍니다 — 빌드 중에 죽지
     * 않게 하려는 설계입니다. 그 덕에 `src/content/posts/kr/`(오타)를 만들면
     * `/kr/...` 가 **조용히 생성되어 사이트맵에 실립니다.** 여기서 세웁니다.
     */
    if (!isLocale(lang)) {
      throw new Error(
        `알 수 없는 언어 폴더입니다: src/content/posts/${lang}/ — ${LOCALES.join(' · ')} 중 하나여야 합니다.`,
      );
    }

    // [slug] 는 rest 파라미터가 아니라 슬래시를 담지 못합니다.
    if (rest.length !== 1) {
      throw new Error(`글은 평면 구조여야 합니다: src/content/posts/${post.id}.md`);
    }

    return {
      params: { lang, slug: rest[0] },
      // 위 두 검사(로케일·평면 구조)를 통과했으므로 키가 반드시 있습니다.
      props: { post, locales: bySlug.get(rest[0])! },
    };
  });
}
