import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { LOCALES, INDEXED_LOCALES } from '../../src/config/site';
import { visibleTop, type NavFlags } from '../../src/config/nav';
import commerce from '../../src/config/commerce.json' with { type: 'json' };
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { postStringsFor } from '../../scripts/build-fonts.mjs';

/*
 * ⚠️ `nav-gates.ts` 를 import 하면 안 됩니다.
 *
 * 그쪽은 `runtime.ts` 를 물고, `runtime.ts` 는 `payment-config.json` 을
 * `with { type: 'json' }` 로 읽습니다 — Playwright 러너가 그 형태를 로드하지
 * 못해 스위트 전체가 시작도 못 합니다. `nav.ts` 가 순수한 이유가 그것이고,
 * 그 파일 머리주석이 "이 파일의 import 문은 import type 하나뿐" 이라고
 * 못 박아 두었습니다. 플래그는 여기서 만듭니다 —
 * `nav-reviews-gate.spec.ts` 가 쓰는 방법과 같습니다.
 */
const MODE = process.env.E2E_MODE === 'launch' ? 'launch' : 'commerce';
/**
 * 공개된 저널 글이 있는가 — 화면이 판정하는 것과 같은 규칙.
 *
 * 초안은 페이지가 만들어지지 않으므로 전부 초안이면 `/journal` 은 빈 목록이고,
 * 그러면 메뉴 항목이 **언제 눌러도 빈 페이지로 가는 길** 이 됩니다.
 * `nav-gates.ts` 가 `import.meta.glob` 으로 세는 것을 여기서는 파일로 셉니다.
 */
const HAS_JOURNAL = readdirSync('src/content/posts')
  .filter((locale) => statSync(`src/content/posts/${locale}`).isDirectory())
  .flatMap((locale) =>
    readdirSync(`src/content/posts/${locale}`)
      .filter((f) => f.endsWith('.md'))
      .map((f) => readFileSync(`src/content/posts/${locale}/${f}`, 'utf8')),
  )
  .some((raw) => {
    const front = raw.startsWith('---') ? (raw.split('---')[1] ?? '') : '';
    return /^category:\s*journal\s*$/m.test(front) && !/^draft:\s*true\s*$/m.test(front);
  });

const FLAGS: NavFlags = {
  checkout: MODE === 'commerce',
  accounts: MODE === 'commerce' ? true : commerce.accounts.enabled,
  journal: HAS_JOURNAL,
};
const TOP_VISIBLE = visibleTop(FLAGS);

/**
 * 공지와 읽을거리가 갈렸는가, 그리고 갈리면서 아무것도 잃지 않았는가.
 *
 * ── 왜 갈랐나 ──────────────────────────────────────────────
 * 브랜드명 검색만으로는 유입이 없습니다. 읽을거리는 사이트에서 유일하게
 * **정보성 검색으로 새 사람을 데려올 수 있는** 자리인데, 고객센터 하위에
 * 있으면 검색에도 사람에게도 "고객지원 문서" 로 읽힙니다.
 *
 *   /support/posts  →  /journal          읽을거리. 최상위
 *                      /support/notice   운영 공지. 고객센터 안
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────
 * 나누는 일에서 가장 흔한 사고는 **밖에 공유된 링크가 죽는 것** 입니다.
 * 그래서 리다이렉트를 성격이 아니라 동작으로 확인합니다.
 */

test.describe('주소가 성격대로 갈린다', () => {
  for (const lang of LOCALES) {
    test(`/${lang}/journal/ 과 /${lang}/support/notice/ 가 둘 다 있다`, async ({ request }) => {
      expect((await request.get(`/${lang}/journal/`)).status()).toBe(200);
      expect((await request.get(`/${lang}/support/notice/`)).status()).toBe(200);
    });
  }

  test('저널은 읽을거리만, 공지는 공지만 보여준다', async ({ page }) => {
    /*
     * 지금 있는 글은 배송 안내(공지) 하나입니다. 저널에 그것이 나오면
     * 카테고리로 가르는 일이 일어나지 않은 것입니다.
     */
    await page.goto('/ko/support/notice/');
    await expect(page.locator('.postList__item')).toHaveCount(1);
    await expect(page.locator('.postList__item')).toContainText('배송');

    await page.goto('/ko/journal/');
    // 저널은 아직 비어 있습니다 — 초안 두 편은 내보내지 않습니다.
    await expect(page.locator('.postList__empty')).toBeVisible();
  });
});

test.describe('옛 주소가 죽지 않는다', () => {
  /*
   * 밖에 공유된 링크는 우리가 회수할 수 없습니다. 목록은 저널로 보냅니다 —
   * 공유되는 것은 대개 읽을거리이고, 공지를 찾던 사람은 고객센터에서 한 칸이면
   * 닿습니다.
   */
  test('목록 주소가 저널로 301 한다', async ({ request }) => {
    const res = await request.get('/ko/support/posts', { maxRedirects: 0 });
    expect(res.status(), '영구 이동이 아닙니다').toBe(301);
    expect(res.headers()['location']).toContain('/ko/journal/');
  });

  test('글 주소가 그 글이 실제로 있는 곳으로 301 한다', async ({ request }) => {
    /*
     * 워커는 마크다운을 읽지 않아 카테고리를 모릅니다. 두 자리를 실제로
     * 두드려 보고 있는 쪽으로 보냅니다 — 표를 만들어 심으면 글을 옮길 때
     * 표와 실물이 갈라질 수 있습니다.
     */
    const res = await request.get('/ko/support/posts/shipping-notice', { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()['location']).toContain('/ko/support/notice/shipping-notice/');
  });

  test('없는 글은 저널 목록으로 보낸다 — 404 로 떨어뜨리지 않는다', async ({ request }) => {
    const res = await request.get('/ko/support/posts/없는글', { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()['location']).toContain('/ko/journal/');
  });

  test('따라가면 실제로 200 이다', async ({ request }) => {
    // 리다이렉트가 또 다른 리다이렉트로 가거나 404 로 끝나면 소용이 없습니다.
    expect((await request.get('/ko/support/posts/shipping-notice')).status()).toBe(200);
    expect((await request.get('/ko/support/posts')).status()).toBe(200);
  });
});

test.describe('헤더에 저널이 있다', () => {
  test('글이 공개되면 최상위가 다섯이 된다', () => {
    /*
     * 정의에는 저널이 있습니다. 다만 **공개된 글이 하나도 없으면 나오지
     * 않습니다** — 리뷰 항목과 같은 규칙입니다("빈 상태 문구가 잘 쓰여
     * 있어도 빈 페이지는 빈 페이지입니다").
     *
     * 그래서 화면이 아니라 **순수 함수** 로 확인합니다. 플래그를 켜면 다섯이
     * 되고, 그 순서가 정해져 있어야 합니다. 첫 글이 공개되는 순간 그대로
     * 화면에 나타납니다.
     */
    const withJournal = visibleTop({ ...FLAGS, journal: true }).map((t) => t.id);
    expect(withJournal).toEqual(['product', 'brand', 'panel', 'journal', 'support']);

    const withoutJournal = visibleTop({ ...FLAGS, journal: false }).map((t) => t.id);
    expect(withoutJournal, '글이 없는데 저널이 메뉴에 있습니다').not.toContain('journal');
  });

  test('지금은 초안뿐이라 메뉴에 저널이 없다', async ({ page }) => {
    /*
     * 초안 두 편은 담당자 검수를 기다리는 중이라 페이지가 만들어지지 않습니다.
     * 그 상태에서 메뉴에 두면 **언제 눌러도 빈 페이지로 가는 길** 이 됩니다.
     */
    test.skip(HAS_JOURNAL, '공개된 저널 글이 생기면 이 검사는 의미가 없습니다');

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    const link = page.locator('.nav__links').getByRole('link', { name: ko.nav.journal, exact: true });
    await expect(link, '빈 저널이 메뉴에 노출됐습니다').toHaveCount(0);

    // 주소 자체는 살아 있습니다 — 길만 감춥니다.
    await page.goto('/ko/journal/');
    await expect(page.locator('h1')).toContainText(ko.journal.heading);
  });

  test('375px 에서 헤더가 가로 스크롤을 만들지 않는다', async ({ page }) => {
    /*
     * 메뉴가 다섯이 되면서 좁은 화면이 걱정입니다. **햄버거로 되돌리지
     * 않는다** 는 것이 지시서의 제약이라, 넘치는지를 여기서 봅니다.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/ko/');
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow, '375px 에서 가로로 넘칩니다').toBeLessThanOrEqual(0);
  });
});

test.describe('색인 신호가 새 주소를 가리킨다', () => {
  test('사이트맵에 옛 주소가 없다', async ({ request }) => {
    const xml = await (await request.get('/sitemap-0.xml')).text();
    expect(xml, '사이트맵이 아직 옛 주소를 말합니다').not.toContain('/support/posts');
    for (const locale of INDEXED_LOCALES) {
      expect(xml).toContain(`/${locale}/journal/`);
      expect(xml).toContain(`/${locale}/support/notice/`);
    }
  });

  test('canonical 이 자기 주소를 가리킨다', async ({ request }) => {
    for (const path of ['/ko/journal/', '/ko/support/notice/', '/ko/support/notice/shipping-notice/']) {
      const html = await (await request.get(path)).text();
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      expect(new URL(canonical!).pathname, `${path} 의 canonical`).toBe(path);
    }
  });
});

test.describe('초안은 없는 페이지다', () => {
  /*
   * 저널 초안은 성분명과 작용 기전을 담고 있어 담당자 검수가 필요합니다.
   * 검수 전에 공개하면 표시·광고 문제가 됩니다.
   *
   * 그래서 "숨긴 페이지" 가 아니라 **없는 페이지** 로 둡니다 — 링크를 아는
   * 사람만 보는 자리를 만들지 않습니다. `draft: true` 면 주소 자체가
   * 만들어지지 않습니다.
   */
  const DRAFTS = ['why-sunscreen-stings-eyes', 'what-spf-and-pa-mean'];

  for (const slug of DRAFTS) {
    test(`${slug} 는 주소로 가면 404 다`, async ({ request }) => {
      const res = await request.get(`/ko/journal/${slug}/`);
      expect(res.status(), '초안이 공개되어 있습니다').toBe(404);
    });
  }

  test('초안이 목록에 없다', async ({ page }) => {
    await page.goto('/ko/journal/');
    for (const slug of DRAFTS) {
      await expect(page.locator(`a[href*="${slug}"]`), `${slug} 가 목록에 있습니다`).toHaveCount(0);
    }
  });

  test('초안이 사이트맵에 없다', async ({ request }) => {
    const xml = await (await request.get('/sitemap-0.xml')).text();
    for (const slug of DRAFTS) {
      expect(xml, `${slug} 가 색인 요청에 실렸습니다`).not.toContain(slug);
    }
  });

  test('초안 파일은 실제로 있다 — 검사가 파일 부재로 통과하지 않는다', () => {
    /*
     * 위 셋은 파일이 아예 없어도 전부 통과합니다. 그러면 "초안을 안전하게
     * 두었다" 가 아니라 "쓰지 않았다" 인데 구분이 안 됩니다.
     */
    for (const slug of DRAFTS) {
      const path = `src/content/posts/ko/${slug}.md`;
      expect(existsSync(path), `${path} 가 없습니다`).toBe(true);
      const source = readFileSync(path, 'utf8');
      expect(source, `${path} 가 draft 가 아닙니다`).toContain('draft: true');
    }
  });
});

test.describe('저널 글이 규칙을 지킨다', () => {
  const DRAFTS = ['why-sunscreen-stings-eyes', 'what-spf-and-pa-mean'];

  for (const slug of DRAFTS) {
    test(`${slug} 가 800~1,200자다`, () => {
      const body = readFileSync(`src/content/posts/ko/${slug}.md`, 'utf8').split('---')[2];
      const text = body.replace(/[#>|*`\-\n]/g, ' ').replace(/\s+/g, '');
      expect(text.length, '분량이 범위를 벗어납니다').toBeGreaterThanOrEqual(800);
      expect(text.length).toBeLessThanOrEqual(1200);
    });

    test(`${slug} 가 출처를 밝히고 단정하지 않는다`, () => {
      const source = readFileSync(`src/content/posts/ko/${slug}.md`, 'utf8');
      /*
       * 줄바꿈을 지웁니다. 면책 문구는 인용구 안에 있어 여러 줄로 접히는데,
       * 그 접히는 자리는 글을 다듬을 때마다 바뀝니다. 검사가 거기에 매이면
       * **문구는 그대로인데 검사만 깨집니다.**
       */
      const flat = source.replace(/\n>\s*/g, ' ').replace(/\s+/g, ' ');

      // 공개 자료 기반임을 밝힌다.
      expect(flat, '출처를 밝히지 않았습니다').toMatch(/공개된 (자료|표기 기준)/);
      // 진단·치료를 말하지 않는다.
      expect(flat, '의학적 조언 면책이 없습니다').toContain('진단이나 치료를 대신하지 않');
      // 특정 브랜드를 지목하지 않는다.
      expect(flat, '특정 제품 지목 금지 문구가 없습니다').toContain('특정 제품이나 브랜드를 가리키지');

      /*
       * 기능성 심사 범위 밖 효능을 말하지 않는다. 이 낱말들이 본문에 있으면
       * 표시·광고 문제가 됩니다.
       */
      for (const banned of ['미백', '주름 개선', '여드름', '아토피', '치료']) {
        const body = source.split('---')[2].replace(/> .*/g, ''); // 면책 인용구는 제외
        expect(body, `«${banned}» 이 본문에 있습니다`).not.toContain(banned);
      }
    });
  }

  test('저널 글이 실제로 있다', () => {
    /*
     * ⚠️ 한때 여기서 글 수를 **2개 이하** 로 못 박았습니다. "여섯 편을 한 번에
     * 쓰지 말 것" 이라는 편집 지침을 검사로 옮긴 것인데, 그러면 **세 번째 글을
     * 쓰는 순간** CI 가 빨개집니다 — 그건 이 기능이 하려던 일 그 자체입니다.
     *
     * 발행 속도는 사람이 정하는 것이고 검사가 막을 일이 아닙니다. 여기서는
     * 저널이 비어 있지 않은지만 봅니다.
     */
    const journal = readdirSync('src/content/posts/ko').filter((f) =>
      readFileSync(`src/content/posts/ko/${f}`, 'utf8').includes('category: journal'),
    );
    expect(journal.length, '저널 글이 하나도 없습니다').toBeGreaterThan(0);
  });
});

test.describe('초안이 글꼴을 무겁게 하지 않는다', () => {
  test('초안에만 있는 글자가 서브셋에 실리지 않는다', () => {
    /*
     * 초안은 페이지가 만들어지지 않으므로 그 글자는 화면 어디에도 나오지
     * 않습니다. 그런데 서브셋 수집이 마크다운을 통째로 읽어서, 초안 두 편을
     * 넣었을 때 `ko/body.woff2` 가 5KB 늘었습니다 — **아무도 볼 수 없는
     * 글자를 모든 한국어 페이지가 받는** 상태였습니다.
     *
     * 글꼴은 `preload` 로 나가므로 LCP 와 직접 대역폭을 다툽니다.
     *
     * ⚠️ 이 검사는 "초안 글자가 하나도 없다" 를 보지 않습니다. 흔한 글자는
     * 다른 문구에도 있어 당연히 들어 있습니다. 보는 것은 **초안에만 있고
     * 다른 어디에도 없는 글자** 입니다.
     */
    const drafts = readdirSync('src/content/posts/ko')
      .map((f) => readFileSync(`src/content/posts/ko/${f}`, 'utf8'))
      .filter((s) => /^draft:\s*true\s*$/m.test(s));
    expect(drafts.length, '초안이 없어 이 검사가 아무것도 재지 않습니다').toBeGreaterThan(0);

    const draftChars = new Set([...drafts.join('')].filter((c) => /[가-힣]/.test(c)));

    // 공개된 글과 번역 파일에 있는 글자는 어차피 서브셋에 있어야 합니다.
    const publicSource =
      readdirSync('src/content/posts/ko')
        .map((f) => readFileSync(`src/content/posts/ko/${f}`, 'utf8'))
        .filter((s) => !/^draft:\s*true\s*$/m.test(s))
        .join('') + readFileSync('src/i18n/ko.json', 'utf8');
    const publicChars = new Set([...publicSource].filter((c) => /[가-힣]/.test(c)));

    const onlyInDrafts = [...draftChars].filter((c) => !publicChars.has(c));
    expect(onlyInDrafts.length, '초안에만 있는 글자가 없어 이 검사가 무의미합니다').toBeGreaterThan(0);

    /*
     * ⚠️ 한때 여기서 **바이트 상한을 못 박았습니다**(123,000). 그러면 정당한
     * 문구 추가로도 빨개지고, 그때 가리키는 곳은 원인이 아닌 초안입니다.
     * 반대로 다른 문구가 줄면 초안이 새어도 통과합니다 — 어느 쪽으로도
     * 재려던 것을 재지 못합니다.
     *
     * 크기 대신 **수집 함수 자체** 를 봅니다. 서브셋을 만드는 그 코드가
     * 초안을 건너뛰는지 직접 확인하면, 파일 크기가 어떻든 판정이 정확합니다.
     */
    const collected = postStringsFor('ko').join('');
    const leaked = onlyInDrafts.filter((c) => collected.includes(c));
    expect(
      leaked,
      `초안에만 있는 글자가 서브셋 수집에 들어갔습니다: ${leaked.join('')}`,
    ).toEqual([]);
  });
});
