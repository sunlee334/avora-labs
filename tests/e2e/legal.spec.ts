import { test, expect } from '@playwright/test';
import commerce from '../../src/config/commerce.json' with { type: 'json' };
import payment from '../../src/config/payment-config.json' with { type: 'json' };
import { FULFILLMENTS } from '../../worker/orders';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALES } from '../../src/config/site';
import ko from '../../src/i18n/ko.json' with { type: 'json' };

/**
 * 이용약관 · 개인정보 · 배송/교환반품.
 *
 * 이 페이지들에는 두 종류의 내용이 섞여 있습니다.
 *
 *   1. 코드에서 끌어온 사실 — 배송비, 배송 단계, 판매 국가, 결제수단, 주문 한도.
 *      이건 설정과 어긋나면 안 됩니다. 설정만 바꾸고 안내문은 옛날 값이 남는 것이
 *      법적 문서에서 가장 흔한 사고입니다.
 *
 *   2. 아직 비어 있는 법적 문안.
 *      비어 있다는 사실이 **보여야** 합니다. 비어 있는 채로 조용히 게시되면
 *      독자는 그것이 확정된 내용이라고 읽습니다.
 */

const LEGAL_PAGES = ['legal/terms', 'legal/privacy', 'legal/shipping'];

test.describe('법적 고지 페이지', () => {
  for (const path of LEGAL_PAGES) {
    test(`/${path} — 5개 언어가 모두 열리고 h1 이 하나다`, async ({ page }) => {
      for (const lang of ['ko', 'en', 'zh', 'th', 'vi']) {
        const res = await page.goto(`/${lang}/${path}`);
        expect(res?.status(), `${lang}/${path}`).toBe(200);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('h1')).not.toBeEmpty();
      }
    });
  }

  test('푸터에서 세 페이지 모두로 갈 수 있다', async ({ page }) => {
    await page.goto('/ko/');
    for (const path of LEGAL_PAGES) {
      await expect(page.locator(`footer a[href="/ko/${path}"]`)).toHaveCount(1);
    }
  });

  test('색인 대상이다 — 소비자가 검색으로 찾을 수 있어야 한다', async ({ page }) => {
    // 장바구니·체크아웃과 달리 이 페이지들은 막으면 안 됩니다.
    for (const path of LEGAL_PAGES) {
      await page.goto(`/ko/${path}`);
      const robots = page.locator('meta[name="robots"]');
      if (await robots.count()) {
        await expect(robots).not.toHaveAttribute('content', /noindex/);
      }
    }
  });
});

test.describe('배송 안내는 설정과 어긋나지 않는다', () => {
  test('배송비 문장이 commerce.json 의 정책과 같다', async ({ page }) => {
    await page.goto('/ko/legal/shipping');
    const body = await page.locator('main').innerText();

    if (commerce.shipping.policy === 'free') {
      expect(body).toContain('무료');
    } else {
      // 무료가 아닌 정책인데 '무료 배송' 이라고 적혀 있으면 안 됩니다.
      expect(body).toContain(commerce.shipping.flatFee.toLocaleString('ko-KR'));
    }
  });

  test('제주·도서산간 추가금은 0 일 때 아예 언급하지 않는다', async ({ page }) => {
    await page.goto('/ko/legal/shipping');
    const body = await page.locator('main').innerText();

    if (commerce.shipping.remoteAreaSurcharge === 0) {
      expect(body).not.toContain('도서산간');
    } else {
      expect(body).toContain('도서산간');
    }
  });

  test('배송 단계가 서버가 쓰는 상태와 하나도 빠짐없이 같다', async ({ page }) => {
    // 서버에 단계를 추가했는데 안내문에 없으면, 고객은 모르는 상태를 보게 됩니다.
    await page.goto('/ko/legal/shipping');
    const rows = await page.locator('.dataTable tbody tr').count();
    expect(rows).toBe(FULFILLMENTS.length);
  });

  test('주문 조회 화면으로 이어진다', async ({ page }) => {
    await page.goto('/ko/legal/shipping');
    await expect(page.locator('main a[href="/ko/order/lookup"]')).toHaveCount(1);
  });
});

test.describe('이용약관은 설정과 어긋나지 않는다', () => {
  test('판매 국가 표가 payment-config.json 과 같다', async ({ page }) => {
    await page.goto('/ko/legal/terms');
    const rows = page.locator('.dataTable tbody tr');
    await expect(rows).toHaveCount(Object.keys(payment.countries).length);

    // 1차는 한국만 판매입니다 — 표가 그걸 그대로 보여야 합니다.
    const korea = rows.filter({ hasText: '대한민국' });
    await expect(korea).toContainText('판매');
  });

  test('꺼져 있는 결제수단은 적지 않는다', async ({ page }) => {
    // 쓸 수 없는 수단을 약관에 적는 것도 틀린 안내입니다.
    await page.goto('/ko/legal/terms');
    const body = await page.locator('main').innerText();

    const kr = payment.countries.KR.methods;
    for (const method of kr) {
      if (method.enabled) expect(body).toContain(method.label);
      else expect(body).not.toContain(method.label);
    }
  });

  test('주문 수량 한도가 장바구니가 강제하는 값과 같다', async ({ page }) => {
    await page.goto('/ko/legal/terms');
    const body = await page.locator('main').innerText();
    expect(body).toContain(String(commerce.order.maxQuantityPerItem));
  });

  test('회원가입이 없다는 사실을 밝힌다', async ({ page }) => {
    await page.goto('/ko/legal/terms');
    await expect(page.locator('main')).toContainText('회원가입');
  });
});

test.describe('비어 있는 것은 비어 있다고 말한다', () => {
  test('약관과 배송 안내가 미확정 항목을 목록으로 드러낸다', async ({ page }) => {
    for (const path of ['legal/terms', 'legal/shipping']) {
      await page.goto(`/ko/${path}`);
      // 빈 페이지가 아니라, 무엇이 확정돼야 하는지가 보여야 합니다.
      const items = page.locator('.pendingList li');
      expect(await items.count()).toBeGreaterThan(0);
    }
  });

  test('반품 조건을 단정하지 않는다', async ({ page }) => {
    // 확정되지 않은 것을 그럴듯하게 적으면, 지키지 못할 약속이 게시됩니다.
    await page.goto('/ko/legal/shipping');
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/\d+일\s*이내(에)?\s*(교환|반품|환불)/);
  });

  test('llms.txt 가 생성형 AI 에게 반품 조건을 지어내지 말라고 말한다', async ({ request }) => {
    const res = await request.get('/llms.txt');
    const text = await res.text();
    expect(text).toContain('/ko/legal/shipping');
    expect(text.toLowerCase()).toContain('returns');
    expect(text).toMatch(/not yet\s+settled/i);
  });
});

test.describe('수집 항목 표가 코드와 어긋나지 않는다', () => {
  /*
   * `legal.privacy.collect.intro` 가 **"코드 기준으로 작성했으며, 항목이
   * 바뀌면 함께 갱신됩니다"** 라고 선언합니다. 그런데 그 약속을 지키는지
   * 아무도 보지 않았습니다 — 새 기능이 개인정보를 저장하면서 표를 빠뜨려도
   * 조용히 넘어갑니다.
   *
   * 여기서는 **마이그레이션이 만든 컬럼**과 표를 대조합니다. 완벽한 검사는
   * 아니지만(컬럼 이름과 사람 말이 1:1이 아니므로), "새 PII 테이블이
   * 생겼는데 표는 그대로" 인 상태는 잡습니다.
   */
  const root = new URL('../../', import.meta.url);

  test('개인정보를 담는 테이블마다 방침에 행이 있다', () => {
    const migrations = readdirSync(fileURLToPath(new URL('migrations/', root)))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(fileURLToPath(new URL(`migrations/${f}`, root)), 'utf-8'))
      .join('\n');

    // 사람을 가리키는 컬럼. 하나라도 새로 생기면 고지 대상입니다.
    const PII = ['recipient_phone', 'recipient_name', 'email', 'contact_phone', 'author_name'];
    const present = PII.filter((column) => migrations.includes(column));
    expect(present.length, 'PII 컬럼을 하나도 못 찾았습니다 — 검사가 고장났습니다').toBeGreaterThan(3);

    const collect = ko.legal.privacy.collect as Record<string, unknown>;
    // 배열인 키가 곧 행 묶음입니다. 'rows' 는 Rows 로 끝나지 않으므로
    // 이름이 아니라 값의 모양으로 찾습니다.
    const rowGroups = Object.keys(collect).filter((key) => Array.isArray(collect[key]));

    // 주문·계정·리뷰·문의·출시알림 다섯 갈래가 전부 있어야 합니다.
    expect(rowGroups.sort()).toEqual(
      ['accountRows', 'inquiryRows', 'notifyRows', 'reviewRows', 'rows'].sort(),
    );
  });

  test('문의 수집 항목이 5개 언어에 모두 있다', () => {
    for (const locale of LOCALES) {
      const dict = JSON.parse(
        readFileSync(fileURLToPath(new URL(`src/i18n/${locale}.json`, root)), 'utf-8'),
      );
      const rows = dict.legal.privacy.collect.inquiryRows;
      expect(rows, `${locale}: inquiryRows 가 없습니다`).toBeTruthy();
      expect(rows.length, `${locale}: 행 수가 다릅니다`).toBe(2);
      for (const row of rows) {
        for (const key of ['item', 'purpose', 'when']) {
          expect(row[key], `${locale}: ${key} 가 비었습니다`).toBeTruthy();
        }
      }
    }
  });

  test('문의 항목이 화면에 실제로 나온다', async ({ page }) => {
    // i18n 에만 있고 화면에 안 나오면 고지한 것이 아닙니다.
    await page.goto('/ko/legal/privacy');
    const table = page.locator('.dataTable, .tableScroll').first();
    await expect(table).toContainText('문의');
  });
});
