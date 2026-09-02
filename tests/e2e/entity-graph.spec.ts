import { test, expect } from '@playwright/test';
import { ORIGIN, BUSINESS } from '../../src/config/site';
import { jsonLdOf, sitemapUrls } from '../support/sitemap';

/**
 * 흩어진 스키마가 한 개체로 모이는가, 그리고 공유 태그가 페이지 성격을 말하는가.
 *
 * ── 왜 이것이 필요한가 ──────────────────────────────────────
 * `src/lib/jsonld.ts` 가 스스로 적어 둔 문제입니다 — "PAROS 는 에게해의 섬
 * 이름이고, 검색엔진은 이 이름을 먼저 섬으로 읽는다. 도메인(avoralabs.co)과
 * 브랜드명이 달라 둘을 잇는 근거가 사이트 밖에 거의 없다."
 *
 * 그 근거를 사이트 안에서 만드는 것이 `@id` 입니다. 여러 페이지가 같은 이름표를
 * 가리키면 기계는 그것을 하나로 모읍니다. 이름만 반복하면 모이지 않습니다 —
 * 같은 문자열일 뿐입니다.
 */

const ID = {
  organization: `${ORIGIN}/#organization`,
  brand: `${ORIGIN}/#brand`,
  product: `${ORIGIN}/#product`,
};

/** 문서 하나의 JSON-LD 를 타입별로 찾아 줍니다. */
async function schemasOf(request: import('@playwright/test').APIRequestContext, path: string) {
  const list = jsonLdOf(await (await request.get(path)).text());
  return {
    all: list,
    of: (type: string) => list.find((s) => s['@type'] === type),
  };
}

test.describe('브랜드가 하나의 개체로 모인다', () => {
  test('홈이 회사·브랜드·사이트에 이름표를 단다', async ({ request }) => {
    const { of } = await schemasOf(request, '/ko/');

    const org = of('Organization');
    expect(org?.['@id'], 'Organization 에 @id 가 없습니다').toBe(ID.organization);
    expect(org?.brand?.['@id'], 'Brand 에 @id 가 없습니다').toBe(ID.brand);

    const site = of('WebSite');
    expect(site?.['@id'], 'WebSite 에 @id 가 없습니다').toBeTruthy();
    expect(site?.publisher?.['@id'], 'WebSite 가 펴낸 곳을 가리키지 않습니다').toBe(
      ID.organization,
    );
  });

  test('제품이 홈이 선언한 그 브랜드를 가리킨다', async ({ request }) => {
    const { of } = await schemasOf(request, '/ko/product');
    const product = of('Product');

    expect(product?.['@id']).toBe(ID.product);
    expect(product?.brand?.['@id'], '제품이 이름만 반복하고 있습니다').toBe(ID.brand);
    expect(product?.manufacturer?.['@id']).toBe(ID.organization);
  });

  test('참조에 이름이 함께 있어 페이지 하나만 읽어도 알 수 있다', async ({ request }) => {
    /*
     * `@id` 만 남기면 안 됩니다. `Organization` 노드는 홈에만 있으므로,
     * 제품 페이지에는 **가리키는 곳이 없는 이름표** 만 남습니다. 그 상태의
     * `brand` 는 이름이 있을 때보다 나쁩니다.
     */
    const { of } = await schemasOf(request, '/ko/product');
    const product = of('Product');

    expect(product?.brand?.name, '브랜드 이름이 사라졌습니다').toBe(BUSINESS.brandName);
    expect(product?.manufacturer?.name).toBe(BUSINESS.companyName);
  });

  test('글이 펴낸 곳과 로고를 함께 낸다', async ({ request }) => {
    const { of } = await schemasOf(request, '/ko/support/posts/shipping-notice');
    const art = of('Article');

    expect(art, 'Article 이 없습니다').toBeTruthy();
    expect(art.publisher?.logo?.url, 'publisher 에 로고가 없습니다').toContain('/brand/');
    expect(art.image, 'Article 에 대표 그림이 없습니다').toBeTruthy();
  });

  test('구조화 데이터의 그림이 화면이 말하는 것과 같다', async ({ request }) => {
    /*
     * 한 페이지가 두 개의 다른 대표 그림을 말할 이유가 없습니다. 갈라지면
     * 어느 쪽이 진짜인지 기계가 고르게 되고, 그 선택은 우리 것이 아닙니다.
     */
    for (const path of ['/ko/product', '/ko/support/posts/shipping-notice']) {
      const html = await (await request.get(path)).text();
      const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
      const schema = jsonLdOf(html).find((s) => s.image);
      expect(schema?.image, `${path} 의 구조화 데이터 그림`).toBe(og);
    }
  });
});

test.describe('공유 태그가 페이지 성격을 말한다', () => {
  const cases = [
    { path: '/ko/', type: 'website' },
    { path: '/ko/product', type: 'product' },
    { path: '/ko/support/posts/shipping-notice', type: 'article' },
  ];

  for (const { path, type } of cases) {
    test(`${path} 는 ${type}`, async ({ request }) => {
      const html = await (await request.get(path)).text();
      expect(html).toContain(`<meta property="og:type" content="${type}">`);
    });
  }

  test('글에는 발행 시각이 함께 나간다', async ({ request }) => {
    const html = await (await request.get('/ko/support/posts/shipping-notice')).text();
    expect(html, 'article:published_time 이 없습니다').toMatch(
      /article:published_time" content="\d{4}-\d{2}-\d{2}"/,
    );
    /*
     * 고친 적이 없으면 태그도 없어야 합니다. 발행일을 복사해 넣으면
     * "고친 적 없음" 과 "발행일에 고침" 이 구분되지 않습니다 —
     * `jsonld.ts` 의 `dateModified` 와 같은 규칙입니다.
     */
    expect(html).not.toContain('article:modified_time');
  });

  test('글이 아닌 화면에는 발행 시각이 붙지 않는다', async ({ request }) => {
    const html = await (await request.get('/ko/product')).text();
    expect(html).not.toContain('article:published_time');
  });

  test('공유 그림의 치수가 실제 파일과 같다', async ({ request }) => {
    /*
     * 치수를 적어 두면 받는 쪽이 파일을 내려받기 전에 자리를 잡습니다.
     * 다만 **틀린 치수는 없느니만 못합니다** — 그래서 적힌 값과 실제 파일을
     * 대조합니다.
     */
    const html = await (await request.get('/ko/')).text();
    const w = Number(html.match(/og:image:width" content="(\d+)"/)?.[1]);
    const h = Number(html.match(/og:image:height" content="(\d+)"/)?.[1]);
    const src = html.match(/<meta property="og:image" content="([^"]+)"/)![1];

    const bytes = Buffer.from(await (await request.get(new URL(src).pathname)).body());
    // JPEG SOF 마커에서 실제 치수를 읽습니다.
    let i = 2;
    let real: { w: number; h: number } | null = null;
    while (i < bytes.length && !real) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xc2) {
        real = { h: bytes.readUInt16BE(i + 5), w: bytes.readUInt16BE(i + 7) };
      } else if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
        i += 2;
      } else {
        i += 2 + bytes.readUInt16BE(i + 2);
      }
    }
    expect(real, '공유 그림의 치수를 읽지 못했습니다').toBeTruthy();
    expect({ w, h }, '적힌 치수가 실제 파일과 다릅니다').toEqual(real);
  });
});

test.describe('사이트 전체', () => {
  test('같은 개체가 서로 다른 이름표를 갖지 않는다', async ({ request }) => {
    /*
     * 이름표가 흩어지면 모으려던 것이 오히려 쪼개집니다. 사이트맵을 전수로
     * 훑어 같은 `@id` 가 서로 다른 `name` 을 말하지 않는지 봅니다.
     */
    const names = new Map<string, Set<string>>();

    const collect = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(collect);
      const o = node as Record<string, unknown>;
      if (typeof o['@id'] === 'string' && typeof o.name === 'string') {
        const set = names.get(o['@id']) ?? new Set<string>();
        set.add(o.name);
        names.set(o['@id'], set);
      }
      Object.values(o).forEach(collect);
    };

    for (const url of await sitemapUrls(request)) {
      jsonLdOf(await (await request.get(new URL(url).pathname)).text()).forEach(collect);
    }

    for (const [id, set] of names) {
      expect([...set], `${id} 가 두 가지 이름으로 불립니다`).toHaveLength(1);
    }
  });
});

test.describe('배점표를 기계도 읽는다', () => {
  test('화면의 표와 구조화 데이터가 같은 것을 말한다', async ({ request, page }) => {
    /*
     * 이 배점표는 브랜드가 가진 가장 인용되기 쉬운 사실입니다 — "눈 시림 30점,
     * 백탁 25점, 커트라인 미만은 총점과 무관하게 탈락."
     *
     * 화면에서 그림이 아니라 표로 둔 판단은 이미 옳았습니다. 다만 표까지였고,
     * 순서와 배점의 관계는 마크업에 없었습니다.
     *
     * ⚠️ 스키마만 보면 "지어낸 값이 실려도" 통과합니다. 그래서 **화면과
     * 대조합니다** — 둘이 갈라지는 순간이 곧 결함입니다.
     */
    const list = jsonLdOf(await (await request.get('/ko/panel')).text()).find(
      (s) => s['@type'] === 'ItemList',
    );
    expect(list, '배점표 구조화 데이터가 없습니다').toBeTruthy();

    await page.goto('/ko/panel');
    const shown = await page.locator('table tbody tr').evaluateAll((rows) =>
      rows.map((r) => [...r.querySelectorAll('th,td')].map((c) => c.textContent!.trim())),
    );

    expect(list.itemListElement, '항목 수가 화면과 다릅니다').toHaveLength(shown.length);

    list.itemListElement.forEach((entry: any, i: number) => {
      expect(entry.position, `${i}번째 순서`).toBe(i + 1);
      expect(shown[i], `${entry.name} 이 화면에 없습니다`).toContain(entry.name);
      const score = entry.additionalProperty.find((p: any) => /배점|score/i.test(p.name));
      expect(shown[i], `${entry.name} 의 배점이 화면과 다릅니다`).toContain(score.value);
    });
  });

  test('커트라인이 있는 항목에만 커트라인이 적힌다', async ({ request }) => {
    /*
     * 여섯 항목 중 둘에만 커트라인이 있습니다. 나머지는 화면에서 `—` 입니다.
     * 그것을 빈 문자열로 실어 보내면 "커트라인이 있는데 값이 없다" 가 됩니다 —
     * 없는 값을 채우지 않는다는 이 저장소의 규칙과 어긋납니다.
     */
    const list = jsonLdOf(await (await request.get('/ko/panel')).text()).find(
      (s) => s['@type'] === 'ItemList',
    );
    const withCut = list.itemListElement.filter((e: any) =>
      e.additionalProperty.some((p: any) => /커트라인|cut/i.test(p.name)),
    );
    expect(withCut).toHaveLength(2);
    for (const e of withCut) {
      const cut = e.additionalProperty.find((p: any) => /커트라인|cut/i.test(p.name));
      expect(cut.value, `${e.name} 의 커트라인이 비어 있습니다`).toMatch(/\d/);
    }
  });
});
