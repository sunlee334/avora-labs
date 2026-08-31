import { test, expect } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import en from '../../src/i18n/en.json' with { type: 'json' };
import zh from '../../src/i18n/zh.json' with { type: 'json' };
import th from '../../src/i18n/th.json' with { type: 'json' };
import vi from '../../src/i18n/vi.json' with { type: 'json' };
import { BUSINESS } from '../../src/config/site';

/**
 * 처리방침의 법정 기재사항.
 *
 * 「개인정보 보호법」 제30조 1항은 처리방침에 담을 항목을 정해 두었습니다.
 * 빠져도 화면은 멀쩡해 보이고 아무 검사도 걸리지 않습니다 — 실제로 일곱
 * 항목이 오래 비어 있었습니다.
 *
 * 여기서 지키는 것은 **문구의 품질이 아니라 존재** 입니다. 문구는 사람이
 * 검토할 일이고, 절이 통째로 사라지는 것은 기계가 잡을 수 있습니다.
 */

/* 동적 import 대신 다섯을 그대로 들고 옵니다 — Playwright 로더가 JSON 을
   까다롭게 받고, 타입도 이쪽이 정확합니다. */
const DICTS = { ko, en, zh, th, vi };
const LANGS = Object.keys(DICTS) as Array<keyof typeof DICTS>;

/** 법이 요구하는 절과, 그 절이 i18n 에서 갖는 키. */
const REQUIRED = [
  { key: 'rights', law: '정보주체의 권리·의무 및 행사방법 (7호)' },
  { key: 'entrust', law: '처리 위탁 · 국외 이전 (6호·10호)' },
  { key: 'destroy', law: '파기 절차 및 방법 (5호)' },
  { key: 'safety', law: '안전성 확보 조치 (8호)' },
  { key: 'officer', law: '개인정보 보호책임자 (5호)' },
  { key: 'remedy', law: '권익침해 구제 방법 (11호)' },
  { key: 'changes', law: '처리방침의 변경 (9호)' },
] as const;

test.describe('처리방침 법정 기재사항', () => {
  for (const { key, law } of REQUIRED) {
    test(`${law} 이 5개 언어에 다 있다`, async ({ request }) => {
      for (const lang of LANGS) {
        const html = await (await request.get(`/${lang}/legal/privacy/`)).text();
        /*
         * 한국어 제목을 다른 언어에서 찾을 수는 없으므로, 해당 언어의
         * 번역 파일에서 제목을 읽어 그것이 화면에 있는지 봅니다.
         */
        const heading = DICTS[lang].legal.privacy[key]?.heading;
        expect(heading, `${lang}.json 에 legal.privacy.${key} 가 없습니다`).toBeTruthy();
        expect(html, `/${lang}/legal/privacy 에 «${heading}» 절이 없습니다`).toContain(heading);
      }
    });
  }

  test('국외 이전에 받는 곳·나라·기간이 모두 적혀 있다', async ({ request }) => {
    /*
     * 국외 이전은 "맡긴다" 만으로는 부족합니다. 법이 이전받는 자, 이전되는
     * 국가, 이용 기간을 각각 알리도록 합니다.
     */
    const html = await (await request.get('/ko/legal/privacy/')).text();
    for (const row of ko.legal.privacy.entrust.rows) {
      expect(html, `«${row.company}» 가 없습니다`).toContain(row.company);
      expect(html, `«${row.country}» 가 없습니다`).toContain(row.country);
      expect(html, `«${row.retention}» 가 없습니다`).toContain(row.retention);
    }
  });

  test('측정 도구를 붙였으면 위탁에도 적혀 있다', async ({ request }) => {
    /*
     * Google Analytics 를 붙인 순간 데이터가 Google LLC(미국)로 나갑니다.
     * 그러면 위탁과 국외 이전이 선택이 아니라 필수입니다. 도구를 끄면 이
     * 검사도 함께 통과합니다 — 하지 않는 위탁을 적는 것도 틀린 고지입니다.
     */
    const html = await (await request.get('/ko/legal/privacy/')).text();
    const usesGa = html.includes('Google Analytics') || html.includes('gtag');
    const listsGoogle = ko.legal.privacy.entrust.rows.some((r) => r.company.includes('Google'));
    expect(
      !usesGa || listsGoogle,
      'Google Analytics 를 쓰면서 위탁 표에 Google 이 없습니다',
    ).toBe(true);
  });

  test('보호책임자 연락처가 사업자 설정과 같다', async ({ request }) => {
    // 문구에 박아 두면 연락처가 바뀔 때 5개 언어를 다 고쳐야 합니다.
    const html = await (await request.get('/ko/legal/privacy/')).text();
    expect(html).toContain(BUSINESS.representative);
    expect(html).toContain(BUSINESS.email);
  });

  test('구제 기관 연락처를 지어내지 않는다', async ({ request }) => {
    /*
     * 법정 기관 번호는 사실입니다. 틀리면 도움이 필요한 사람이 엉뚱한 곳에
     * 겁니다. 실제 번호를 박아 두고 바뀌면 여기서 걸리게 합니다.
     */
    const html = await (await request.get('/ko/legal/privacy/')).text();
    for (const known of ['1833-6972', 'kopico.go.kr', '118', 'privacy.kisa.or.kr']) {
      expect(html, `«${known}» 이 없습니다`).toContain(known);
    }
  });

  test('모바일에서 위탁 표가 가로로 밀지 않는다', async ({ page }) => {
    // 네 열짜리 표입니다. 좁은 화면에서는 쌓여야 합니다.
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/ko/legal/privacy/');
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over, '320px 에서 가로 넘침').toBeLessThanOrEqual(0);
  });
});
