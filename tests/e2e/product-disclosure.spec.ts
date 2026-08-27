import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { BUSINESS, LOCALES } from '../../src/config/site';
import product from '../../src/data/product.json' with { type: 'json' };

/**
 * 제품 정보 고시.
 *
 * 「전자상거래 등에서의 상품 등의 정보제공에 관한 고시」는 화장품에 대해
 * 아래 항목을 표시하도록 요구합니다. 판매를 시작하기 전에 전부 채워야 합니다.
 *
 * 이 파일이 지키는 세 가지:
 *   1. 요구 항목이 **하나도 빠지지 않는다** — 빠진 줄은 화면으로 드러나지
 *      않습니다. 표가 그럴듯해 보이면 없는 줄을 아무도 못 알아챕니다.
 *   2. 확정된 값은 **설정과 같다** — 설정에만 있고 화면에 없으면 소용없습니다.
 *   3. 확정되지 않은 값은 **지어내지 않는다** — 없는 성분표를 적는 것은
 *      비어 있는 것보다 나쁩니다.
 */

/** 고시가 요구하는 항목. 줄이려면 법이 바뀌어야 합니다. */
const REQUIRED = [
  'volume',
  'features',
  'expiry',
  'usage',
  'ingredients',
  'functionalReview',
  'cautions',
  'manufacturer',
  'seller',
  'countryOfOrigin',
  'customerService',
] as const;

test.describe('고시 항목이 빠짐없이 나온다', () => {
  test('요구 항목이 모두 표에 있다', async ({ page }) => {
    await page.goto('/ko/product');
    const rows = page.locator('[data-disclosure]');
    const keys = await rows.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-disclosure')),
    );

    const missing = REQUIRED.filter((key) => !keys.includes(key));
    expect(missing, `빠진 고시 항목: ${missing.join(', ')}`).toEqual([]);
  });

  test('모든 줄에 이름표와 내용이 있다', async ({ page }) => {
    await page.goto('/ko/product');
    const rows = page.locator('[data-disclosure]');
    const count = await rows.count();
    expect(count).toBe(REQUIRED.length);

    for (let i = 0; i < count; i++) {
      const cells = rows.nth(i).locator('td');
      await expect(cells.first(), `${i}번째 줄 이름표`).not.toBeEmpty();
      await expect(cells.last(), `${i}번째 줄 내용`).not.toBeEmpty();
    }
  });

  test('5개 언어 모두 같은 개수의 줄이 나온다', async ({ page }) => {
    for (const lang of LOCALES) {
      await page.goto(`/${lang}/product`);
      await expect(page.locator('[data-disclosure]'), lang).toHaveCount(REQUIRED.length);
    }
  });
});

test.describe('확정된 값은 설정과 같다', () => {
  test('소비자상담 전화가 사업자 설정과 같다', async ({ page }) => {
    // 고시가 요구하는 항목이라 다른 번호를 적으면 안 됩니다.
    await page.goto('/ko/product');
    const row = page.locator('[data-disclosure="customerService"]');
    if (BUSINESS.phone) await expect(row).toContainText(BUSINESS.phone);
  });

  test('사용방법이 위의 사용법 안내와 같은 내용이다', async ({ page }) => {
    // 같은 사실을 두 곳에 따로 적으면 한쪽만 낡습니다.
    await page.goto('/ko/product');
    const steps = await page.locator('.steps strong').allInnerTexts();
    const usage = await page.locator('[data-disclosure="usage"] td').last().innerText();
    for (const step of steps) {
      expect(usage, `"${step}" 가 사용방법 줄에 없습니다`).toContain(step.trim());
    }
  });

  test('설정에 값이 있으면 그 값이 화면에 나온다', async ({ page }) => {
    await page.goto('/ko/product');
    const d = product.disclosure as Record<string, string | null>;
    for (const [key, value] of Object.entries(d)) {
      if (key.startsWith('$') || !value) continue;
      const row = page.locator(`[data-disclosure="${key === 'sellerName' || key === 'sellerNumber' ? 'seller' : key}"]`);
      await expect(row, `${key} 가 화면에 없습니다`).toContainText(value);
    }
  });
});

test.describe('확정되지 않은 값을 지어내지 않는다', () => {
  test('설정이 비어 있으면 화면도 "확정 예정" 이다', async ({ page }) => {
    await page.goto('/ko/product');
    const d = product.disclosure as Record<string, string | null>;

    for (const [key, value] of Object.entries(d)) {
      if (key.startsWith('$') || value) continue;
      if (key === 'sellerName' || key === 'sellerNumber') continue; // 아래에서 따로 봅니다
      const row = page.locator(`[data-disclosure="${key}"] td`).last();
      await expect(row, `${key} 는 설정이 비었는데 값이 적혀 있습니다`).toContainText('확정 예정');
    }
  });

  test('책임판매업자는 상호와 등록번호가 함께 있을 때만 적는다', async ({ page }) => {
    // 등록번호 없이 상호만 적으면 고시가 요구하는 표시를 절반만 한 것이 됩니다.
    await page.goto('/ko/product');
    const row = page.locator('[data-disclosure="seller"] td').last();
    const d = product.disclosure as Record<string, string | null>;

    if (d.sellerName && d.sellerNumber) {
      await expect(row).toContainText(d.sellerNumber);
    } else {
      await expect(row).toContainText('확정 예정');
    }
  });

  test('아직 없는 값이 구조화 데이터로 새어 나가지 않는다', async ({ page }) => {
    // 화면에는 "확정 예정" 이라고 적으면서 스키마에는 다른 말을 넣으면 안 됩니다.
    await page.goto('/ko/product');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    for (const raw of blocks) {
      expect(raw, '빈 문자열 값이 구조화 데이터에 있습니다').not.toMatch(/:\s*""/);
      expect(raw, '"확정 예정" 이 구조화 데이터에 들어갔습니다').not.toContain('확정 예정');
    }
  });
});

test.describe('무엇이 남았는지 저장소가 기억한다', () => {
  test('비어 있는 고시 항목은 $pending 에 적혀 있다', () => {
    /*
     * 값이 null 인 채로 잊히는 것이 이 프로젝트에서 가장 위험한 실패입니다.
     * 화면에는 "확정 예정" 이라고 얌전히 나오기 때문에 아무도 못 알아챕니다.
     * 그래서 무엇이 왜 비었는지를 product.json 이 함께 들고 있게 합니다.
     */
    const raw = readFileSync(new URL('../../src/data/product.json', import.meta.url), 'utf-8');
    const pending = (JSON.parse(raw).$pending as string[]).join(' ');
    const d = product.disclosure as Record<string, string | null>;

    const forgotten = Object.entries(d)
      .filter(([key, value]) => !key.startsWith('$') && !value)
      .map(([key]) => key)
      .filter((key) => !pending.includes(key));

    expect(forgotten, `비었는데 $pending 에 설명이 없습니다: ${forgotten.join(', ')}`).toEqual([]);
  });
});
