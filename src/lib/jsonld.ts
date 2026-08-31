/**
 * schema.org 구조화 데이터.
 *
 * SEO 뿐 아니라 GEO(생성형 AI 검색)에도 쓰입니다. 답변엔진이 브랜드·제품 정보를
 * 정확히 인용하려면 사실이 기계가 읽을 수 있는 형태로 있어야 합니다.
 *
 * 원칙: 확정되지 않은 값은 넣지 않습니다. 가격이 없는데 offers 를 만들어
 * 0원이나 빈 문자열을 넣으면 검색엔진에 잘못된 사실을 주게 됩니다.
 */
import { ORIGIN, absoluteUrl, BUSINESS, SOCIAL, type Locale } from '../config/site';
import { localePath } from '../i18n';
import { PRICE, CURRENCY } from '../config/runtime';
import product from '../data/product.json';

export function organization() {
  return {
    '@context': 'https://schema.org',
    /*
      * 여기는 **회사** 입니다. 사업자 정보와 저작권의 주체이므로 브랜드
      * (PAROS)가 아니라 운영사(AVORA LABS)의 이름이 들어갑니다. 브랜드는
      * 아래 productSchema 의 Brand 노드가 가리킵니다.
      */
    '@type': 'Organization',
    name: BUSINESS.companyName,
    url: ORIGIN,
    logo: absoluteUrl('/brand/avora-wordmark-forest.svg'),
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
      name: BUSINESS.brandName,
      alternateName: '파로스',
      description: 'Active lifestyle sun care brand. 액티브 라이프스타일 선케어 브랜드.',
      ...(SOCIAL.instagramUrl ? { sameAs: [SOCIAL.instagramUrl] } : {}),
    },
    alternateName: '아보라랩스',
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
    // 손님이 보는 사이트 이름입니다 — 페이지 제목도 이 이름으로 끝납니다.
    name: BUSINESS.brandName,
    url: absoluteUrl(localePath(locale)),
    inLanguage: locale,
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
    name,
    description,
    sku: product.sku,
    brand: { '@type': 'Brand', name: BUSINESS.brandName },
    manufacturer: { '@type': 'Organization', name: BUSINESS.companyName },
    category: 'Sunscreen',
    image: absoluteUrl('/og/product.jpg'),
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
    // 글쓴이는 개인이 아니라 브랜드입니다. 1인 운영이라도 개인 이름을
    // 구조화 데이터로 내보낼 이유가 없습니다.
    author: { '@type': 'Organization', name: BUSINESS.brandName },
    publisher: { '@type': 'Organization', name: BUSINESS.brandName },
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
