import { test, expect } from '@playwright/test';
import { FOUNDER_STORY, TEAM_SIZE } from '../../src/config/company';
import { LOCALES } from '../../src/config/site';
import product from '../../src/data/product.json' with { type: 'json' };
import ko from '../../src/i18n/ko.json' with { type: 'json' };

/**
 * 홈의 확정/미확정 대조표.
 *
 * ── 이 표가 존재하는 이유 ──────────────────────────────────
 * FIRST PRODUCT 섹션이 열다섯 단어였습니다. 제품이 2027년까지 없으니 채울
 * 것은 사양이 아니라 **무엇이 정해졌고 무엇이 아직 아닌가** 입니다. 정직성이
 * 시각적으로 드러나는 자리입니다.
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────
 * 가장 위험한 실패는 오른쪽 열이 값으로 채워지는 것입니다. 비어 있다는 사실이
 * 요점인데, 값이 들어가면 그 사실이 사라집니다. 그리고 그 값은 기능성 심사
 * 전의 단정이 되어 표시·광고 문제가 됩니다.
 */

test.describe('확정과 미확정이 나란히 보인다', () => {
  test('두 열이 다 있고 각각 항목을 갖는다', async ({ page }) => {
    await page.goto('/ko/');
    const cols = page.locator('.compare__col');
    await expect(cols, '대조표가 두 열이 아닙니다').toHaveCount(2);

    for (let i = 0; i < 2; i += 1) {
      await expect(cols.nth(i).locator('.compare__row').first()).toBeVisible();
    }
  });

  test('미확정 칸에 값이 아니라 기다리는 것이 적힌다', async ({ page }) => {
    /*
     * ⚠️ 이 검사가 이 파일의 핵심입니다.
     *
     * 오른쪽 열에 `SPF50+` 나 `50ml` 같은 **값** 이 들어가면 안 됩니다.
     * 들어가는 순간 "아직 정해지지 않았다" 는 말과 화면이 서로 반대가 되고,
     * 기능성 심사 전에 차단지수를 단정한 것이 됩니다.
     */
    await page.goto('/ko/');
    const waits = await page.locator('.compare__wait').allInnerTexts();
    expect(waits.length, '미확정 항목이 없습니다').toBeGreaterThan(0);

    for (const text of waits) {
      expect(text, `«${text}» 가 값처럼 보입니다`).not.toMatch(/SPF|PA\+|\d+\s*ml|\d+분/);
      expect(text.trim().length, '미확정 칸이 비어 있습니다').toBeGreaterThan(0);
    }
  });

  test('차단지수와 제형과 내수성이 미확정 쪽에 있다', async ({ page }) => {
    /*
     * `product.json` 의 `$pending` 이 셋 다 미확정으로 적어 두었습니다.
     * 기능성화장품은 식약처 심사·보고가 남아 있고, 처방 선정도 끝나지
     * 않았습니다. 브리프는 차단지수를 확정 열에 넣으라고 했지만, 저장소가
     * 아는 사실이 우선입니다.
     */
    await page.goto('/ko/');
    const right = page.locator('.compare__col').nth(1);
    const labels = ko.product.spec.labels;

    for (const label of [labels.protection, labels.texture, labels.waterResistant]) {
      await expect(right, `«${label}» 이 미확정 쪽에 없습니다`).toContainText(label);
    }
  });

  test('확정 쪽에는 실제로 확정된 값만 있다', async ({ page }) => {
    await page.goto('/ko/');
    const left = page.locator('.compare__col').nth(0);

    /*
     * 확정 열에는 값이 실제로 있어야 합니다 — 비어 있으면 대조가 성립하지
     * 않습니다.
     */
    await expect(left.locator('.compare__value').first()).not.toBeEmpty();
    // 차단지수는 확정이 아니므로 이 열에 있으면 안 됩니다.
    await expect(left, '차단지수가 확정 열에 있습니다').not.toContainText('SPF50+');
    /*
     * 용량도 마찬가지입니다. `$pending` 이 "용기 발주 후 확정" 이라고 적어
     * 두었고, 바로 옆 칸이 용기가 미확정이라고 말합니다 — 용기가 안 정해졌는데
     * 그 안에 담기는 양이 정해졌다고 하면 한 화면 안의 모순입니다.
     */
    await expect(left, '용량이 확정 열에 있습니다').not.toContainText(product.spec.volume);
  });
});

test.describe('두 화면이 같은 판정을 쓴다', () => {
  test('홈이 확정이라 한 것을 제품 페이지가 목표라 하지 않는다', async ({ page }) => {
    /*
     * 한때 홈이 "워터리 젤", 스펙표가 "로션·밀크" 라고 동시에 말했습니다.
     * 판정을 `src/lib/spec.ts` 한 곳으로 모은 이유입니다.
     *
     * 확인 방법: 홈에서 확정으로 적힌 항목 이름을 제품 페이지에서 찾아,
     * 그 줄에 `목표` 꼬리표가 붙어 있지 않아야 합니다.
     */
    await page.goto('/ko/');
    const settledKeys = await page.locator('.compare__col').nth(0).locator('dt').allInnerTexts();
    expect(settledKeys.length, '확정 항목이 없습니다').toBeGreaterThan(0);

    await page.goto('/ko/product');
    for (const key of settledKeys) {
      const row = page.locator('.spec__row').filter({ hasText: key.trim() }).first();
      if ((await row.count()) === 0) continue; // 대조표에만 있는 항목(용기)은 넘어갑니다
      await expect(
        row.locator('.spec__target'),
        `«${key}» 를 홈은 확정이라 하고 제품 페이지는 목표라 합니다`,
      ).toHaveCount(0);
    }
  });
});

test.describe('좁은 화면', () => {
  test('375px 에서 세로로 쌓이고 가로로 넘치지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/ko/');

    const compare = page.locator('.compare');
    const cols = compare.locator('.compare__col');
    const boxes = await cols.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(boxes[1], '375px 에서 두 열이 나란히 있습니다').toBeGreaterThan(boxes[0]);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, '가로로 넘칩니다').toBeLessThanOrEqual(0);
  });
});

test.describe('다섯 언어', () => {
  for (const lang of LOCALES) {
    test(`${lang} 에서 대조표가 비어 있지 않다`, async ({ page }) => {
      await page.goto(`/${lang}/`);
      await expect(page.locator('.compare__row')).not.toHaveCount(0);
      const empty = await page
        .locator('.compare__value, .compare__wait')
        .evaluateAll((els) => els.filter((el) => !el.textContent?.trim()).length);
      expect(empty, `${lang}: 빈 칸이 있습니다`).toBe(0);
    });
  }
});

test.describe('회사 소개가 없는 것을 있다고 하지 않는다', () => {
  /*
   * 창업 배경과 팀 규모는 담당자가 주어야 하는 것이고 아직 오지 않았습니다.
   *
   * ⚠️ **판단이 한 번 뒤집혔습니다.** 전에는 "자리를 만들되 값은 비워 두고
   * 기다린다고 적는" 방식이었습니다 — 자리가 있어야 한다는 사실을 잊지
   * 않으려는 장치였습니다. 그런데 그 문장이 **실제 사이트에 게시되고
   * 있었습니다.** 방문자에게 "담당자 원고를 기다리고 있습니다" 는 아무 뜻이
   * 없습니다.
   *
   * 이제 값이 있을 때만 그립니다. 자리를 기억하는 일은 코드 주석과
   * `config/company.ts` 가 합니다 — 화면이 할 일이 아닙니다.
   */
  test('값이 있는 블록만 이름표를 갖는다', async ({ page }) => {
    await page.goto('/ko/');
    const labels = (await page.locator('.blocks__label').allInnerTexts()).map((s) => s.trim());
    const b = ko.home.company.blocks;

    // 운영사(어원 한 줄)는 늘 값이 있습니다.
    expect(labels, '운영사 블록이 없습니다').toContain(b.company);
    // 사업 기획서 1-2 대로 운영사는 **맨 뒤** 입니다.
    expect(labels.at(-1), '운영사가 맨 앞에 있습니다').toBe(b.company);

    for (const [label, value] of [
      [b.founder, FOUNDER_STORY.ko],
      [b.scale, TEAM_SIZE.ko],
    ] as const) {
      if (value) expect(labels, `${label} 값이 있는데 블록이 없습니다`).toContain(label);
      else expect(labels, `${label} 값이 없는데 블록이 나왔습니다`).not.toContain(label);
    }
  });

  test('원고가 없는 블록은 아예 나오지 않는다', async ({ page }) => {
    /*
     * 전에는 "담당자 원고를 기다리고 있습니다" 를 적었습니다. 회색 상자보다는
     * 나았지만 **그 문장 자체가 게시되고 있었습니다** — 방문자에게는 내부
     * 메모입니다.
     *
     * 회사 섹션에 남는 것은 값이 있는 블록뿐입니다. 지금은 운영사 한 블록
     * (어원 한 줄)이고, 원고가 오면 만든 사람·규모가 앞에 붙습니다.
     */
    await page.goto('/ko/');
    const section = page.locator('[data-section="company"]');
    const text = await section.innerText();
    expect(text, '안내 문구가 게시되고 있습니다').not.toContain('기다리고 있습니다');
    expect(text, '안내 문구가 게시되고 있습니다').not.toContain('준비 중');

    // 빈 블록을 남기지 않습니다 — 라벨만 있고 내용이 없는 자리가 없어야 합니다.
    const empty = await section.locator('.blocks__item').evaluateAll((els) =>
      els.filter((el) => !el.querySelector('p')).length,
    );
    expect(empty, '내용 없는 블록이 남아 있습니다').toBe(0);
  });

  test('없는 사실을 지어내지 않았다', async ({ page }) => {
    /*
     * 지시서가 준 초안 문구가 화면에 나가면 안 됩니다 — 확인되기 전까지는.
     * 설립 연도와 팀 규모 둘 다입니다.
     */
    await page.goto('/ko/');
    const body = await page.locator('main').innerText();
    expect(body, '설립 연도가 확인 전에 나갔습니다').not.toMatch(/2026년\s*서울/);
    expect(body, '팀 규모가 확인 전에 나갔습니다').not.toContain('두 사람이 시작');
  });

  test('브랜드 이름 풀이는 나온다', async ({ page }) => {
    // 이것은 지시서가 문안까지 제공한 것이라 지어낸 것이 아닙니다.
    await page.goto('/ko/');
    await expect(page.locator('main')).toContainText('Vitality');
  });
});
