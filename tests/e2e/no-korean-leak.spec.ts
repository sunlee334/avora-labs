import { test, expect } from '@playwright/test';
import { INDEXED_LOCALES, BUSINESS } from '../../src/config/site';
import payment from '../../src/config/payment-config.json' with { type: 'json' };
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import en from '../../src/i18n/en.json' with { type: 'json' };

/**
 * 한국어가 다른 언어 화면으로 새지 않는가.
 *
 * ── 어디서 샜는가 ──────────────────────────────────────────
 * `payment-config.json` 에 국가명과 결제수단 이름이 **한 벌뿐**이었습니다.
 * 그래서 문장 틀은 `en.json` 에 영어로 멀쩡히 있는데 **채워지는 값만**
 * 한국어로 나갔습니다 — 영어판 약관의 "신용·체크카드", 고객센터의
 * "Right now you can order only in 대한민국."
 *
 * `en.json` 을 아무리 고쳐도 바뀌지 않는 자리였고, 그래서 눈에 띄지 않았습니다.
 *
 * ── 브랜드명은 예외입니다 ──────────────────────────────────
 * 네이버페이·카카오페이·토스페이는 그 이름이 곧 식별자입니다. `site.ts` 의
 * `KEEP_ORIGINAL` 이 정한 기준 — 브랜드 자산이면 원문, 설명하는 말이면 번역 —
 * 을 그대로 적용합니다. 이 검사도 그 기준으로 판정합니다.
 */

/** 한글 음절. 자모나 문장부호가 아니라 실제 글자만 봅니다. */
const HANGUL = /[가-힣]/;

/** 브랜드 자산이라 어느 언어에서도 원문으로 남는 것들. */
const KEEP_ORIGINAL = Object.values(payment.countries)
  .flatMap((c) => ('methods' in c ? (c.methods as { code: string; label: string }[]) : []))
  .filter((m) => !(m.code in ko.paymentMethods))
  .map((m) => m.label);

test.describe('영어판에 한국어가 섞이지 않는다', () => {
  test('약관의 결제수단이 영어로 나온다', async ({ request }) => {
    const html = await (await request.get('/en/legal/terms')).text();

    // 일반명사는 번역된 이름으로.
    expect(html, '카드가 아직 한국어입니다').toContain(en.paymentMethods.card);
    expect(html, '한국어 결제수단 이름이 남아 있습니다').not.toContain(ko.paymentMethods.card);
    expect(html).not.toContain(ko.paymentMethods.transfer);

    // 브랜드명은 그대로. 번역해 버리면 손님이 알아보지 못합니다.
    const brandOnPage = KEEP_ORIGINAL.filter((label) => html.includes(label));
    expect(brandOnPage.length, '브랜드명이 사라졌습니다').toBeGreaterThan(0);
  });

  test('약관의 판매국 표가 영어로 나온다', async ({ request }) => {
    const html = await (await request.get('/en/legal/terms')).text();
    expect(html).toContain(en.countries.KR);
    expect(html, '표에 한국어 국가명이 남아 있습니다').not.toContain(ko.countries.KR);
  });

  test('고객센터 문장 안의 국가명이 영어다', async ({ request }) => {
    /*
     * 표와 달리 이쪽은 **영어 문장 한가운데**에 들어갑니다. 표에서는
     * 자국어 표기도 하나의 선택일 수 있지만, 문장 안에서는 아닙니다.
     */
    const html = await (await request.get('/en/support')).text();
    expect(html).toContain(en.countries.KR);
    expect(html).not.toContain(ko.countries.KR);
  });
});

test.describe('색인 대상 화면 전수', () => {
  test('영어판 본문에 한국어 통문장이 없다', async ({ request }) => {
    /*
     * 개별 자리를 하나씩 못 박는 대신 **본문 전체**를 봅니다. 다음에 어느
     * 설정값이 이름을 한 벌만 갖더라도 같은 그물에 걸립니다.
     *
     * 두 가지는 통과시킵니다:
     *   · 법정 등록명(대표자·상호·주소) — 원문이 맞습니다
     *   · 한 글자짜리 조각 — 상표나 코드에 섞인 경우
     */
    expect(INDEXED_LOCALES, 'en 이 색인 대상이 아닙니다').toContain('en');

    /*
     * 법정 표시는 원문이 맞습니다 — 전자상거래법이 요구하는 항목이고,
     * 등기 상호·대표자 성명·주소는 번역 대상이 아닙니다. 값을 여기 베껴
     * 적지 않고 설정에서 읽습니다.
     */
    const legalNames = [
      BUSINESS.legalName,
      BUSINESS.representative,
      BUSINESS.address,
    ].filter(Boolean);

    const paths = ['/en/', '/en/product', '/en/brand', '/en/support', '/en/legal/terms'];
    const leaks: string[] = [];

    for (const path of paths) {
      const html = await (await request.get(path)).text();
      const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
      const text = main.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');

      for (const sentence of text.split(/[.!?]\s|\n/)) {
        const hangul = sentence.match(new RegExp(HANGUL, 'g')) ?? [];
        if (hangul.length < 2) continue; // 한 글자짜리 조각은 넘어갑니다
        if (legalNames.some((n) => sentence.includes(n))) continue; // 법정 표시
        if (KEEP_ORIGINAL.some((n) => sentence.includes(n))) continue; // 브랜드명
        leaks.push(`${path} — ${sentence.trim().slice(0, 80)}`);
      }
    }

    expect(leaks, `영어판에 한국어가 남아 있습니다:\n  ${leaks.join('\n  ')}`).toEqual([]);
  });
});
