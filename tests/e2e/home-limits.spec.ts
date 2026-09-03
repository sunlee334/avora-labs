import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/config/site';
import { readdirSync, readFileSync } from 'node:fs';
import { isPublishedJournal } from '../../src/config/post-frontmatter';
import ko from '../../src/i18n/ko.json' with { type: 'json' };

/**
 * 글을 **파일에서** 셉니다.
 *
 * `src/lib/posts.ts` 를 부르면 `astro:content` 가 딸려 오는데, Playwright 의
 * 로더는 그 스킴을 모릅니다 — 스위트 전체가 수집조차 되지 않습니다. 같은
 * 함정을 `nav-reviews-gate.spec.ts` 가 이미 한 번 밟았습니다.
 *
 * 판정 자체는 `post-frontmatter.ts` 를 부릅니다. 정규식을 여기 또 적어
 * 두었더니 여섯 벌이 되었고, 이미 서로 갈려 있었습니다.
 */
function journalPosts(locale: string) {
  const dir = `src/content/posts/${locale}`;
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
    .filter(isPublishedJournal);
}

/**
 * 우리가 하지 않기로 한 것, 그리고 읽을거리 카드.
 *
 * ── 왜 검사가 필요한가 ──────────────────────────────────────
 * 이 섹션의 값어치는 **약속을 공개했다는 것** 에 있습니다. 그런데 약속은
 * 지키기 불편해지면 조용히 사라지는 종류의 글입니다. 사라졌는지 화면을
 * 봐서는 알기 어렵고, 다른 검사는 전부 통과합니다.
 */

const LIMITS = ko.home.limits;

test.describe('하지 않기로 한 것', () => {
  test('FAQ 다음, 브랜드 브릿지 앞에 있다', async ({ page }) => {
    /*
     * 자리가 뜻을 만듭니다. FAQ 는 **묻는 것** 에 답하고 이 섹션은 **묻지
     * 않은 것** 을 먼저 말합니다. 붙어 있어야 대비가 섭니다.
     */
    await page.goto('/ko/');
    const order = await page
      .locator('[data-section]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-section')));
    const faq = order.indexOf('home_faq');
    const limits = order.indexOf('limits');
    const bridge = order.indexOf('brand_bridge');
    expect(limits, '섹션이 없습니다').toBeGreaterThan(-1);
    expect(limits, 'FAQ 앞에 있습니다').toBeGreaterThan(faq);
    expect(limits, '브랜드 브릿지 뒤에 있습니다').toBeLessThan(bridge);
  });

  test('네 가지 약속이 전부 있다', async ({ page }) => {
    await page.goto('/ko/');
    const section = page.locator('[data-section="limits"]');
    await expect(section.locator('.limits li')).toHaveCount(LIMITS.items.length);
    for (const item of LIMITS.items) {
      await expect(section, `«${item.claim.slice(0, 16)}…» 이 사라졌습니다`).toContainText(
        item.claim,
      );
      // 이유가 빠지면 약속이 구호가 됩니다.
      await expect(section).toContainText(item.why);
    }
  });

  test('브랜드 페이지에 같은 목록을 두지 않았다', async ({ page }) => {
    /*
     * 지시서가 "홈에만 둘 것" 이라고 못 박았습니다. 두 곳에 있으면 두 곳 다
     * 약해집니다 — `/brand` 의 "어떻게 만드는가" 는 **하는 것** 을 말하는
     * 자리입니다.
     */
    await page.goto('/ko/brand');
    await expect(page.locator('[data-section="limits"]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(LIMITS.heading);
  });

  test('근거 없는 숫자를 예시로도 인쇄하지 않는다', async ({ page }) => {
    /*
     * ⚠️ 여기가 지시서 원문과 갈리는 자리입니다.
     *
     * 원문은 이 항목의 예시로 "92%, 240분 같은 숫자는" 이라고 적었습니다.
     * 뜻은 분명하지만 그러면 그 숫자가 홈 화면에 **실제로 인쇄됩니다.**
     *
     * 이 사이트는 답변엔진이 읽는 것을 전제로 만들어졌습니다. 조각을 떼어
     * 인용하는 쪽에서 "92%" 는 부정 예시라는 맥락 없이 나갈 수 있고, 그건
     * 이 항목이 막으려던 바로 그 일입니다.
     */
    await page.goto('/ko/');
    const text = await page.locator('[data-section="limits"]').innerText();
    expect(text, '근거 없는 수치가 예시로 인쇄됐습니다').not.toMatch(/\d+\s*%/);
    expect(text, '근거 없는 지속 시간이 예시로 인쇄됐습니다').not.toMatch(/\d+\s*분/);
  });

  for (const lang of LOCALES) {
    test(`${lang} 에서도 네 줄이 그 언어로 나온다`, async ({ page }) => {
      await page.goto(`/${lang}/`);
      const rows = page.locator('[data-section="limits"] .limits li');
      await expect(rows).toHaveCount(LIMITS.items.length);
      if (lang !== 'ko') {
        // 번역을 빠뜨리면 한국어가 그대로 남습니다.
        await expect(page.locator('[data-section="limits"]')).not.toContainText(
          LIMITS.items[0].claim,
        );
      }
    });
  }
});

test.describe('읽을거리 카드', () => {
  test('내보낸 글이 없으면 섹션도 없다', async ({ page }) => {
    /*
     * "곧 올라옵니다" 상자를 홈에 두지 않습니다 — 그건 다시 올 이유가
     * 아니라 다시 오지 않을 이유가 됩니다. 초안은 페이지 자체가 만들어지지
     * 않으므로, 카드만 걸리면 없는 곳으로 가는 링크가 됩니다.
     */
    const journal = journalPosts('ko');

    await page.goto('/ko/');
    const section = page.locator('[data-section="journal"]');

    if (journal.length === 0) {
      await expect(section, '글이 없는데 섹션이 나왔습니다').toHaveCount(0);
      return;
    }

    await expect(section, '내보낸 글이 있는데 섹션이 없습니다').toHaveCount(1);
    // 최대 세 편. 넷째부터는 목록 페이지의 몫입니다.
    const cards = section.locator('.postList__item');
    await expect(cards).toHaveCount(Math.min(3, journal.length));
    await expect(section.locator('a[href="/ko/journal/"]')).toHaveCount(1);
  });
});
