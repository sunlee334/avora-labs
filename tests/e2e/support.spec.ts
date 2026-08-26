import { test, expect } from '@playwright/test';
import { BUSINESS, LOCALES } from '../../src/config/site';
import commerce from '../../src/config/commerce.json' with { type: 'json' };
import payment from '../../src/config/payment-config.json' with { type: 'json' };

/**
 * 고객센터.
 *
 * 이 페이지가 지켜야 하는 것은 "질문이 있다" 가 아니라 **답이 사실이다** 입니다.
 * 답을 설정에서 읽어 만들기 때문에, 설정과 화면이 어긋나면 여기서 걸립니다.
 *
 * 그리고 확정되지 않은 값이 구조화 데이터로 새어나가지 않아야 합니다.
 * 답변엔진에게 "아직 모릅니다" 를 사실처럼 먹이는 일이기 때문입니다.
 */

async function jsonLd(page: import('@playwright/test').Page): Promise<any[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((b) => JSON.parse(b));
}

test.describe('고객센터', () => {
  test('5개 언어 모두 열리고 제목이 있다', async ({ page }) => {
    for (const lang of LOCALES) {
      const res = await page.goto(`/${lang}/support`);
      expect(res?.status(), `${lang} 고객센터`).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).not.toBeEmpty();
    }
  });

  test('배송비 답이 설정 파일과 같은 정책을 말한다', async ({ page }) => {
    // 배송 안내 페이지와 같은 문구 키를 쓰므로 두 페이지가 어긋날 수 없습니다.
    await page.goto('/ko/support');
    const answer = await page.locator('#shipping-fee').innerText();

    if (commerce.shipping.policy === 'free') {
      expect(answer).toContain('무료');
    } else {
      // 금액 정책이면 숫자가 나와야 합니다 — 빈 문장이 나가면 안 됩니다.
      expect(answer).toMatch(/\d/);
    }
  });

  test('판매 국가 답이 결제 설정과 일치한다', async ({ page }) => {
    await page.goto('/ko/support');
    const answer = await page.locator('#countries').innerText();

    for (const c of Object.values(payment.countries)) {
      if (c.sellable) {
        expect(answer, `${c.name} 은 판매 국가인데 답에 없습니다`).toContain(c.name);
      } else {
        expect(answer, `${c.name} 은 판매하지 않는데 답에 있습니다`).not.toContain(c.name);
      }
    }
  });

  test('연락처가 사업자 설정과 같다', async ({ page }) => {
    await page.goto('/ko/support');
    const contact = page.locator('.support__contact');
    if (BUSINESS.email) await expect(contact).toContainText(BUSINESS.email);
    if (BUSINESS.phone) await expect(contact).toContainText(BUSINESS.phone);
  });

  test('공개되는 이메일이 개인 주소가 아니다', async ({ page }) => {
    // 5개 언어 푸터와 고객센터에 그대로 공개되는 주소입니다.
    // 개인 주소로 되돌아가면 스팸 수집 대상이 됩니다.
    expect(BUSINESS.email).not.toBe('sunlee334@gmail.com');
    await page.goto('/ko/support');
    expect(await page.content()).not.toContain('sunlee334@gmail.com');
  });
});

test.describe('답변엔진에 내보내는 것', () => {
  test('FAQPage 구조화 데이터가 있고 화면의 답과 같다', async ({ page }) => {
    await page.goto('/ko/support');
    const faq = (await jsonLd(page)).find((s) => s['@type'] === 'FAQPage');
    expect(faq, 'FAQPage 가 있어야 합니다').toBeTruthy();
    expect(faq.mainEntity.length).toBeGreaterThan(0);

    for (const entry of faq.mainEntity) {
      expect(entry.name, '질문이 비어 있습니다').toBeTruthy();
      expect(entry.acceptedAnswer.text, `"${entry.name}" 의 답이 비었습니다`).toBeTruthy();
      // 구조화 데이터에만 있고 화면에는 없는 답이 있으면 안 됩니다.
      await expect(page.locator('main')).toContainText(entry.name);
    }
  });

  test('확정되지 않은 값은 구조화 데이터에 넣지 않는다', async ({ page }) => {
    // 배송비는 아직 잠정값이라 화면에는 단서와 함께 내보내되 스키마에서는 뺍니다.
    await page.goto('/ko/support');
    const faq = (await jsonLd(page)).find((s) => s['@type'] === 'FAQPage');
    const questions = faq.mainEntity.map((e: any) => e.name);

    const feeQuestion = await page.locator('#shipping-fee h3').innerText();
    expect(await page.locator('#shipping-fee').isVisible()).toBe(true);
    expect(questions, '잠정값인 배송비가 구조화 데이터에 들어갔습니다').not.toContain(feeQuestion);
  });

  test('제품 페이지 FAQ 와 질문이 겹치지 않는다', async ({ page }) => {
    // 같은 질문이 두 페이지에 있으면 어느 쪽을 정본으로 볼지 알 수 없습니다.
    await page.goto('/ko/support');
    const support = (await jsonLd(page))
      .find((s) => s['@type'] === 'FAQPage')
      .mainEntity.map((e: any) => e.name);

    await page.goto('/ko/product');
    const product = (await jsonLd(page))
      .find((s) => s['@type'] === 'FAQPage')
      .mainEntity.map((e: any) => e.name);

    const overlap = support.filter((q: string) => product.includes(q));
    expect(overlap, `중복 질문: ${overlap.join(' / ')}`).toEqual([]);
  });

  test('답을 가리켜 인용할 수 있도록 질문마다 id 가 있다', async ({ page }) => {
    await page.goto('/ko/support');
    const ids = await page.locator('.faq > div').evaluateAll((els) =>
      els.map((el) => el.id),
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !id), 'id 없는 질문이 있습니다').toEqual([]);
    expect(new Set(ids).size, 'id 가 중복됩니다').toBe(ids.length);
  });
});

test.describe('찾아갈 수 있는가', () => {
  test('푸터에서 고객센터로 갈 수 있다', async ({ page }) => {
    // 헤더 링크는 900px 미만에서 숨겨집니다. 모바일에서 유일한 통로는 푸터입니다.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    const link = page.locator('footer a[href="/ko/support"]');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/ko\/support\/?$/);
  });

  test('사이트맵에 들어 있다', async ({ request }) => {
    // noindex 도 robots 차단도 아니므로 색인 대상입니다.
    const xml = await (await request.get('/sitemap-0.xml')).text();
    for (const lang of LOCALES) {
      expect(xml, `${lang} 고객센터가 사이트맵에 없습니다`).toContain(`/${lang}/support`);
    }
  });
});
