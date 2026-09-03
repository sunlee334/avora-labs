/**
 * schema.org 구조화 데이터.
 *
 * SEO 뿐 아니라 GEO(생성형 AI 검색)에도 쓰입니다. 답변엔진이 브랜드·제품 정보를
 * 정확히 인용하려면 사실이 기계가 읽을 수 있는 형태로 있어야 합니다.
 *
 * 원칙: 확정되지 않은 값은 넣지 않습니다. 가격이 없는데 offers 를 만들어
 * 0원이나 빈 문자열을 넣으면 검색엔진에 잘못된 사실을 주게 됩니다.
 */
import { FOUNDED } from '../config/company';
import { ORIGIN, absoluteUrl, BUSINESS, SOCIAL, type Locale, BRAND_KO, COMPANY_KO,
} from '../config/site';
import { localePath } from '../i18n';
import { PRICE, CURRENCY } from '../config/runtime';
import product from '../data/product.json';

/**
 * 노드 이름표.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────
 * 지금까지 스키마들은 각자 떨어진 섬이었습니다. 홈이 `Organization` 을 내고
 * 제품 페이지가 `Product` 를 내는데, 그 `Product` 의 브랜드가 저 `Organization`
 * 의 브랜드와 **같다는 말이 어디에도 없었습니다.**
 *
 * 이 파일은 이미 그 문제를 알고 있었습니다 — "PAROS 는 에게해의 섬 이름이고,
 * 검색엔진은 이 이름을 먼저 섬으로 읽는다. 도메인과 브랜드명이 달라 둘을 잇는
 * 근거가 사이트 밖에 거의 없다." 그 근거를 사이트 안에서 만드는 방법이
 * `@id` 입니다. 같은 `@id` 를 여러 페이지가 가리키면 기계는 그것을 **하나의
 * 개체**로 모읍니다.
 *
 * 주소 형태(`#organization`)를 쓰는 이유: `@id` 는 전역에서 유일해야 하고,
 * URL 이 이미 유일합니다. 새 규칙을 만들 이유가 없습니다.
 */
const ID = {
  organization: `${ORIGIN}/#organization`,
  brand: `${ORIGIN}/#brand`,
  /*
   * ⚠️ **제품은 언어마다 다른 노드입니다.**
   *
   * 처음에는 회사·브랜드처럼 전역 이름표 하나를 줬습니다. 그런데 `url` 과
   * `image` 와 `description` 은 전부 언어마다 다릅니다. 그러면 다섯 페이지가
   * **같은 개체에 대해 서로 다른 정식 주소와 그림과 설명을 주장** 하게 되고,
   * 그건 이름표가 아예 없는 것보다 나쁩니다.
   *
   * `website` 를 언어별로 둔 것과 같은 이유입니다.
   */
  product: (locale: Locale) => `${absoluteUrl(localePath(locale, 'product'))}#product`,
  website: (locale: Locale) => `${absoluteUrl(localePath(locale))}#website`,
} as const;

/** 브랜드 로고. `Organization.logo` 와 `publisher.logo` 가 같은 것을 가리켜야 합니다. */
const LOGO = absoluteUrl('/brand/avora-wordmark-forest.svg');

export function organization() {
  return {
    '@context': 'https://schema.org',
    /*
      * 여기는 **회사** 입니다. 사업자 정보와 저작권의 주체이므로 브랜드
      * (PAROS)가 아니라 운영사(AVORA LABS)의 이름이 들어갑니다. 브랜드는
      * 아래 productSchema 의 Brand 노드가 가리킵니다.
      */
    '@type': 'Organization',
    '@id': ID.organization,
    name: BUSINESS.companyName,
    url: ORIGIN,
    logo: LOGO,
    slogan: 'We create brands for people in motion.',

    /*
     * sameAs — "이 사이트와 이 계정은 같은 주체" 라는 선언입니다.
     * 브랜드명을 검색했을 때 사이트와 인스타그램이 따로 흩어지지 않고 한
     * 덩어리로 묶이게 하는 신호이고, 답변엔진이 계정을 인용할 근거이기도
     * 합니다. 계정이 비어 있으면 항목 자체를 넣지 않습니다.
     */
    ...(SOCIAL.instagramUrl ? { sameAs: [SOCIAL.instagramUrl] } : {}),

    /*
     * 브랜드를 **명시적으로** 매답니다.
     *
     * PAROS 는 에게해의 섬 이름입니다. 검색엔진과 답변엔진 모두 이 이름을
     * 먼저 섬으로 읽고, 도메인(avoralabs.co)과 브랜드명이 달라 둘을 잇는
     * 근거가 사이트 밖에 거의 없습니다.
     *
     * 여기서 "이 PAROS 는 선케어 브랜드이고 AVORA LABS 가 만든다" 를 기계가
     * 읽을 수 있는 형태로 선언합니다. 카피 규칙(본문에서 브랜드명을 어떻게
     * 병기할지)은 담당자 합의가 필요하지만, 이 선언은 그와 무관합니다.
     */
    brand: {
      '@type': 'Brand',
      '@id': ID.brand,
      name: BUSINESS.brandName,
      alternateName: BRAND_KO,
      description: 'Active lifestyle sun care brand. 액티브 라이프스타일 선케어 브랜드.',
      ...(SOCIAL.instagramUrl ? { sameAs: [SOCIAL.instagramUrl] } : {}),
    },
    alternateName: COMPANY_KO,
    /*
     * 설립 시점은 확인되면 나갑니다. 비어 있는 동안에는 항목 자체가
     * 없습니다 — 빈 문자열을 내보내면 "모른다" 가 아니라 "없다" 가 됩니다.
     */
    ...(FOUNDED ? { foundingDate: FOUNDED } : {}),
    /*
     * 카테고리를 제목·llms.txt 와 같은 말로 적습니다. 여기만 "beauty" 로
     * 남아 있으면 기계가 읽는 세 곳(제목·구조화 데이터·llms.txt)이 서로
     * 다른 카테고리를 말하게 됩니다.
     */
    description:
      'AVORA LABS creates brands for people in motion. Its first brand is PAROS, an active lifestyle sun care brand named after the Aegean island — made for anyone who moves, not only athletes.',

    // 사업자 정보. 답변엔진이 "이 브랜드는 누가 파는가" 에 답할 수 있어야
    // 하고, 그 답이 푸터의 법정 표시와 어긋나면 안 됩니다.
    // 확정되지 않은 값은 넣지 않습니다 — 없는 것을 사실로 만들지 않기 위해서입니다.
    legalName: BUSINESS.legalName,
    ...(BUSINESS.registrationNumber ? { taxID: BUSINESS.registrationNumber } : {}),
    ...(BUSINESS.address
      ? { address: { '@type': 'PostalAddress', streetAddress: BUSINESS.address, addressCountry: 'KR' } }
      : {}),
    ...(BUSINESS.email || BUSINESS.phone
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            ...(BUSINESS.email ? { email: BUSINESS.email } : {}),
            ...(BUSINESS.phone ? { telephone: BUSINESS.phone } : {}),
            availableLanguage: ['ko', 'en'],
          },
        }
      : {}),
  };
}

export function website(locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': ID.website(locale),
    // 손님이 보는 사이트 이름입니다 — 페이지 제목도 이 이름으로 끝납니다.
    name: BUSINESS.brandName,
    url: absoluteUrl(localePath(locale)),
    inLanguage: locale,
    // 이 사이트를 누가 내는가. 홈이 같은 문서에서 Organization 을 함께 내므로
    // 여기서는 이름표만으로 이어집니다.
    publisher: { '@type': 'Organization', '@id': ID.organization, name: BUSINESS.companyName },
  };
}

export function breadcrumb(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function productSchema(locale: Locale, name: string, description: string) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': ID.product(locale),
    name,
    description,
    sku: product.sku,
    /*
     * 브랜드와 제조사에 **이름과 `@id` 를 함께** 답니다.
     *
     * 전에는 이름만 있었습니다. 그러면 기계 입장에서 이 "PAROS" 가 홈이 선언한
     * 그 PAROS 인지 알 길이 없습니다 — 같은 문자열일 뿐입니다. `@id` 를 붙이면
     * 흩어진 노드가 한 개체로 모입니다.
     *
     * ⚠️ 그렇다고 `@id` 만 남기면 안 됩니다. `Organization` 노드는 홈에만 있고
     * 이 페이지에는 없어서, 참조만 있으면 **가리키는 곳이 없는 이름표**가
     * 됩니다. 이름을 함께 두어야 이 페이지 하나만 읽어도 브랜드를 알 수 있고,
     * 여러 페이지를 함께 읽으면 `@id` 로 합쳐집니다.
     */
    brand: { '@type': 'Brand', '@id': ID.brand, name: BUSINESS.brandName },
    manufacturer: {
      '@type': 'Organization',
      '@id': ID.organization,
      name: BUSINESS.companyName,
    },
    category: 'Sunscreen',
    /*
     * 공유 그림은 **언어마다 다릅니다**(`/og/product.ko.jpg`). 여기에 접미사 없는
     * 이름을 적어 두었더니 그 파일이 아예 없어서, 구조화 데이터가 404 를 가리키고
     * 있었습니다. 검색엔진은 이미지를 못 불러오는 `Product` 를 무효로 봅니다.
     *
     * 화면이 `og:image` 로 내보내는 것과 같은 규칙을 씁니다 — 한 페이지가 두 개의
     * 다른 그림을 자기 대표 이미지라고 말할 이유가 없습니다.
     *
     * 지금 가리키는 것은 글자가 얹힌 공유 카드입니다. 실촬영본이 목업을 대체하면
     * (`product.json` 의 `$pending`) 진짜 제품 사진의 고정 주소로 옮기는 편이 낫습니다.
     * `/product/thumb.jpg` 는 240×320 이라 그 자리에 쓸 수 없습니다.
     */
    image: absoluteUrl(`/og/product.${locale}.jpg`),
    url: absoluteUrl(localePath(locale, 'product')),
  };

  // 가격이 확정되기 전에는 offers 를 아예 넣지 않습니다.
  // 화면에 표시하는 값과 같은 출처(runtime)를 읽습니다 — 예전에는 product.json 을
  // 직접 읽어서, 미리보기 빌드에서 화면에는 가격이 보이는데 구조화 데이터에는
  // offers 가 없는 모순이 생겼습니다.
  if (typeof PRICE === 'number') {
    schema.offers = {
      '@type': 'Offer',
      price: PRICE,
      priceCurrency: CURRENCY,
      availability: `https://schema.org/${product.availability}`,
      url: absoluteUrl(localePath(locale, 'product')),
    };
  }

  return schema;
}

/**
 * 공지·읽을거리 글 하나.
 *
 * 답변엔진이 "언제 쓴 글인가" 를 묻습니다. 오래된 안내를 최신 사실로 인용하면
 * 손님이 틀린 정보를 받으므로 `datePublished` 를 반드시 넣습니다.
 *
 * `dateModified` 는 실제로 고친 날이 있을 때만 넣습니다. 발행일을 그대로
 * 복사해 넣으면 "고친 적 없음" 과 "발행일에 고침" 을 구분할 수 없게 됩니다 —
 * 이 파일의 원칙(확정되지 않은 값은 넣지 않는다)이 그대로 적용됩니다.
 */
export function article(input: {
  headline: string;
  description: string;
  path: string;
  locale: Locale;
  publishedAt: string;
  updatedAt?: string;
  /** 이 화면이 실제로 내보내는 og:image 이름. `Base.astro` 의 `ogImage` 와 같은 값을 넘기세요. */
  ogImage?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.headline,
    description: input.description,
    url: absoluteUrl(input.path),
    mainEntityOfPage: absoluteUrl(input.path),
    // website() 와 같은 형태를 씁니다 — BCP 47 태그가 아니라 언어 코드입니다.
    inLanguage: input.locale,
    datePublished: input.publishedAt,
    ...(input.updatedAt ? { dateModified: input.updatedAt } : {}),
    /*
     * 대표 그림.
     *
     * 글에는 그림이 없습니다. 그렇다고 비워 두면 Google 의 Article 안내가
     * 권장하는 항목이 빠집니다. **지어내지 않고**, 이 글의 화면이 이미
     * `og:image` 로 내보내고 있는 것과 같은 그림을 가리킵니다 — 한 페이지가
     * 두 개의 다른 대표 그림을 말할 이유가 없습니다.
     *
     * ⚠️ 그 "같은 그림" 을 **여기서 정하지 않습니다.** 한동안 이 줄이
     * `og/home` 을 직접 적어 두고 `Base.astro` 의 기본값과 우연히 같기를
     * 기대했습니다. 호출부가 언젠가 `ogImage` 를 바꾸면 화면과 구조화
     * 데이터가 조용히 다른 파일을 가리킵니다 — 어긋나도 아무 신호가 없는
     * 종류입니다. 그래서 이름을 **받습니다.**
     */
    image: absoluteUrl(`/og/${input.ogImage ?? 'home'}.${input.locale}.jpg`),
    /*
     * 글쓴이는 개인이 아니라 회사입니다. 1인 운영이라도 개인 이름을 구조화
     * 데이터로 내보낼 이유가 없습니다.
     *
     * ⚠️ 한때 여기서 `#brand` 를 가리키면서 타입을 `Organization` 으로 적었습니다.
     * 그런데 `organization()` 이 같은 이름표를 **`Brand`** 로 선언합니다. 합치면
     * 한 노드가 Brand 이면서 Article 의 저자가 되는데, Google 의 Article 안내는
     * 저자를 Person 또는 Organization 으로 요구합니다. 아래 `publisher` 와 같은
     * 노드를 가리킵니다.
     */
    author: { '@type': 'Organization', '@id': ID.organization, name: BUSINESS.companyName },
    /*
     * 펴낸 곳에는 로고가 붙어야 합니다(Google Article 안내). 값은
     * `organization()` 이 쓰는 것과 같은 상수라, 브랜드 자산을 바꿀 때
     * 두 곳이 갈라지지 않습니다.
     */
    publisher: {
      '@type': 'Organization',
      '@id': ID.organization,
      name: BUSINESS.companyName,
      logo: { '@type': 'ImageObject', url: LOGO },
    },
  };
}

/**
 * 배점표 — 이 브랜드가 가진 **가장 인용되기 쉬운 사실**.
 *
 * "눈 시림 30점, 백탁 25점, 커트라인 미만은 총점과 무관하게 탈락." 화면에서는
 * 이미 표로 두었습니다(그림이 아니라 표여야 한다는 판단은 `panel.astro` 주석에
 * 있습니다). 다만 표까지였습니다 — 답변엔진이 순서와 배점을 확실히 읽으려면
 * 그 관계가 마크업으로도 있어야 합니다.
 *
 * `ItemList` 를 쓰는 이유: 이것은 등수가 아니라 **배점 순으로 정렬된 목록**이고,
 * 그 순서 자체가 정보입니다(눈 시림이 가장 무겁다). `position` 이 그것을 말합니다.
 *
 * ⚠️ 지어낼 값이 없습니다. 화면에 있는 것을 그대로 옮깁니다 — 항목 이름,
 * 확인 방법, 배점, 커트라인. 새 사실을 만들면 화면과 기계가 다른 말을 합니다.
 */
export function criteriaList(input: {
  name: string;
  path: string;
  columns: { score: string; cut: string };
  rows: ReadonlyArray<{ item: string; how: string; score: string; cut: string }>;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: input.name,
    url: absoluteUrl(input.path),
    // 배점이 큰 것부터 적혀 있고, 그 순서가 곧 무게입니다.
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: input.rows.length,
    itemListElement: input.rows.map((row, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: row.item,
      description: row.how,
      /*
       * 배점과 커트라인은 이름이 붙은 값이라 `PropertyValue` 로 냅니다.
       * 설명 문장에 섞어 넣으면 기계가 숫자를 도로 추출해야 합니다.
       *
       * 커트라인이 없는 항목(`—`)은 항목 자체를 넣지 않습니다 — 이 파일의
       * 원칙대로, 없는 값을 빈 문자열로 채우지 않습니다.
       */
      additionalProperty: [
        { '@type': 'PropertyValue', name: input.columns.score, value: row.score },
        ...(/\d/.test(row.cut)
          ? [{ '@type': 'PropertyValue', name: input.columns.cut, value: row.cut }]
          : []),
      ],
    })),
  };
}

export function faqPage(items: Array<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}
