/**
 * schema.org 구조화 데이터.
 *
 * SEO 뿐 아니라 GEO(생성형 AI 검색)에도 쓰입니다. 답변엔진이 브랜드·제품 정보를
 * 정확히 인용하려면 사실이 기계가 읽을 수 있는 형태로 있어야 합니다.
 *
 * 원칙: 확정되지 않은 값은 넣지 않습니다. 가격이 없는데 offers 를 만들어
 * 0원이나 빈 문자열을 넣으면 검색엔진에 잘못된 사실을 주게 됩니다.
 */
import { ORIGIN, absoluteUrl, type Locale } from '../config/site';
import { localePath } from '../i18n';
import { PRICE, CURRENCY } from '../config/runtime';
import product from '../data/product.json';

export function organization() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'AVORA',
    url: ORIGIN,
    logo: absoluteUrl('/brand/avora-wordmark-forest.svg'),
    slogan: 'For every movement.',
    description:
      'AVORA is an active lifestyle skincare brand. The name joins the "A" of Athlete and Active with Vitality & Aura. Positioned as ACTIVE LIFESTYLE BEAUTY rather than sports beauty.',
  };
}

export function website(locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AVORA',
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
    brand: { '@type': 'Brand', name: 'AVORA' },
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
