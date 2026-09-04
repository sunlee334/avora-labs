import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { FOUNDER_STORY } from '../../src/config/company';
import { LOCALES } from '../../src/config/site';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import en from '../../src/i18n/en.json' with { type: 'json' };
import zh from '../../src/i18n/zh.json' with { type: 'json' };
import th from '../../src/i18n/th.json' with { type: 'json' };
import vi from '../../src/i18n/vi.json' with { type: 'json' };

/*
 * 언어별 사전. 다섯이 **구조는 같지만 타입은 다릅니다** — 리터럴 문자열
 * 타입이 값마다 달라서, `Record<string, typeof ko>` 로 단언하면 tsc 가
 * "겹치지 않는 타입" 이라며 거부합니다.
 *
 * 여기서 필요한 것은 머리말 문자열 하나뿐이라, 사전 전체의 타입을 맞추는
 * 대신 **그 값만 꺼내는 함수** 를 둡니다.
 */
const DICTS: Record<string, { brand: Record<string, unknown> }> = { ko, en, zh, th, vi };

const kickerOf = (dict: { brand: Record<string, unknown> }, key: string) =>
  (dict.brand[key] as { kicker: string }).kicker.toUpperCase();

/**
 * 브랜드 페이지.
 *
 * ── 무엇을 지키는가 ────────────────────────────────────────
 * 이 페이지는 **서사** 입니다. 사실을 나열하는 곳이 아니라 브랜드가 왜
 * 존재하는지 말하는 곳이라, 다른 화면과 다른 방식으로 망가집니다 —
 * 문장이 빠져도 화면은 멀쩡해 보이고, 홈과 같은 말을 해도 티가 안 납니다.
 */

/** 여덟 자리. 순서가 곧 이야기의 순서입니다. */
/*
 * 브랜드 페이지의 자리 순서.
 *
 * 여덟이었다가 **사실을 담은 세 섹션이 사이에 들어와** 열하나가 됐습니다.
 * 기존 여덟은 하나도 지우지 않았습니다 — 지시서가 "글이 좋다. 사이에 넣는다"
 * 고 못 박았고, 새 자리는 각각 맥락이 있는 곳에 붙습니다:
 *
 *   만든 사람      The Question 뒤   — 왜 이 질문을 던졌는지 물으면 사람이 나온다
 *   표기          The Name 뒤       — 이름을 말한 직후가 혼동을 푸는 자리다
 *   어떻게 만드는가  Brand Codes 뒤    — 코드를 말한 다음이 방법을 말할 자리다
 */
/*
 * ⚠️ 문구를 여기 베껴 적으면 **언어마다 다른 값** 을 하나로 못 박게 됩니다.
 * 처음에 한국어 값을 적었다가 영어판에서 깨졌습니다 — 라틴 머리말은 다섯
 * 언어가 같지만(`ORIGIN`), 새로 넣은 셋은 번역되기 때문입니다.
 *
 * 자리 순서는 **키** 로 못 박고 문구는 그 언어의 사전에서 가져옵니다.
 */
/*
 * ⚠️ `maker` 는 **조건부** 입니다.
 *
 * 그 자리에는 창업 배경이 들어가는데, 아직 확정되지 않았습니다. 예전에는
 * 자리만 만들어 놓고 "확정되면 채웁니다" 라는 내부 메모를 화면에 그리고
 * 있었습니다. 지금은 `FOUNDER_STORY` 가 비면 섹션 자체가 없습니다.
 *
 * 그래서 이 목록도 같은 조건을 따릅니다. 값이 들어오면 자리가 돌아오고,
 * 이 검사는 그때 그 자리를 다시 요구합니다.
 */
const ALL_KEYS = ['origin', 'question', 'maker', 'island', 'naming',
                  'elements', 'how', 'audience',
                  'philosophy', 'company', 'message'] as const;

const orderKeysFor = (locale: (typeof LOCALES)[number]) =>
  ALL_KEYS.filter((key) => key !== 'maker' || Boolean(FOUNDER_STORY[locale]));

const orderFor = (dict: { brand: Record<string, unknown> }, locale: (typeof LOCALES)[number]) =>
  orderKeysFor(locale).map((key) => kickerOf(dict, key));

async function bands(page: import('@playwright/test').Page) {
  return page.locator('section').evaluateAll((nodes) => {
    const ground = getComputedStyle(document.body).backgroundColor;
    return nodes.map((el) => {
      const own = getComputedStyle(el).backgroundColor;
      return own === 'rgba(0, 0, 0, 0)' ? ground : own;
    });
  });
}

test.describe('브랜드 페이지', () => {
  test('여덟 자리가 5개 언어에 있다', async ({ page }) => {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/brand/`);
      // 머리말은 대문자로 그려집니다(.kicker 의 text-transform).
      const kickers = await page
        .locator('.kicker')
        .evaluateAll((els) => els.map((e) => e.textContent?.trim().toUpperCase() ?? ''));
      expect(kickers, `${locale} 브랜드 페이지 구성이 다릅니다`).toEqual(orderFor(DICTS[locale], locale));
    }
  });

  test('같은 배경이 셋 이어지지 않는다', async ({ page }) => {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/brand/`);
      const found = await bands(page);
      let run = 1;
      for (let i = 1; i < found.length; i++) {
        run = found[i] === found[i - 1] ? run + 1 : 1;
        expect(run, `${locale} 브랜드 페이지 배경이 ${run}연속입니다`).toBeLessThan(3);
      }
    }
  });

  test('브랜드 코드 넷에 아이콘을 붙이지 않는다', async ({ page }) => {
    /*
     * 해·바람·물방울·돌 아이콘은 어느 브랜드에나 있어서, 붙이는 순간 이 넷이
     * 남의 것과 구분되지 않습니다(기획안 5장 · 00-공통규칙 2-3).
     * 번호도 매기지 않습니다 — 이 넷은 순서가 없습니다.
     */
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/brand/`);
      const codes = page.locator('.codes');
      await expect(codes.locator('> div'), `${locale} 코드가 넷이 아닙니다`).toHaveCount(4);
      await expect(codes.locator('img, svg'), `${locale} 코드에 아이콘이 붙었습니다`).toHaveCount(0);
      const terms = await codes.locator('dt').evaluateAll((e) => e.map((x) => x.textContent?.trim()));
      expect(terms, `${locale} 코드 이름이 다릅니다`).toEqual(['LIGHT', 'WIND', 'WATER', 'STONE']);
      for (const dd of await codes.locator('dd').all()) {
        expect((await dd.innerText()).length, `${locale} 코드 설명이 비었습니다`).toBeGreaterThan(10);
      }
    }
  });

  test('풍경을 옮겨 오지 않는다는 문장이 남아 있다', async ({ page }) => {
    /*
     * 그리스풍 장식·블루 타일·지중해 일러스트를 쓰지 않는 이유가 이 문단입니다.
     * 화면에 적혀 있어야 나중에 누가 관광지 이미지를 넣자고 할 때 근거가 됩니다.
     */
    for (const locale of LOCALES) {
      const dict = JSON.parse(readFileSync(`src/i18n/${locale}.json`, 'utf8'));
      await page.goto(`/${locale}/brand/`);
      const text = await page.locator('body').innerText();
      expect(text, `${locale} 에 "풍경을 옮기지 않는다" 문단이 없습니다`)
        .toContain(dict.brand.island.note);
    }
  });

  test('브랜드 메시지 셋은 어느 언어에서나 같은 표기다', async ({ page }) => {
    /*
     * 영문 셋은 번역하는 문장이 아니라 브랜드의 **표기** 입니다. 언어마다
     * 달라지면 같은 브랜드가 다섯 개가 됩니다. 뜻은 아래 한 줄이 옮깁니다.
     */
    const seen = new Set<string>();
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/brand/`);
      const en = await page.locator('.messages strong').evaluateAll((e) =>
        e.map((x) => x.textContent?.trim()).join(' | '),
      );
      expect(en, `${locale} 메시지가 셋이 아닙니다`).toContain('MOVE FREELY. CARE GENTLY.');
      seen.add(en);
      /*
       * 뜻풀이 칸에 표기를 그대로 복사해 두는 것을 막습니다. 영어판에서도
       * 뜻풀이는 대문자 표기가 아니라 읽는 문장이어야 합니다.
       */
      const pairs = await page.locator('.messages li').evaluateAll((items) =>
        items.map((li) => ({
          en: li.querySelector('strong')?.textContent?.trim() ?? '',
          gloss: li.querySelector('span')?.textContent?.trim() ?? '',
        })),
      );
      for (const { en: mark, gloss } of pairs) {
        expect(gloss.length, `${locale} 뜻풀이가 비었습니다`).toBeGreaterThan(0);
        expect(gloss, `${locale} 뜻풀이가 표기를 그대로 옮겼습니다`).not.toBe(mark);
      }
    }
    expect(seen.size, `표기가 언어마다 다릅니다: ${[...seen].join(' / ')}`).toBe(1);
  });

  test('회사 이야기가 홈과 같은 문장을 되풀이하지 않는다', async ({ page }) => {
    /*
     * 홈에도 AVORA LABS 소개가 있습니다. 두 곳이 같은 말을 하면 한쪽을 읽은
     * 사람은 다른 쪽을 읽을 이유가 없어집니다. 홈은 두 문장, 여기는 긴 판입니다.
     */
    const dict = JSON.parse(readFileSync('src/i18n/ko.json', 'utf8'));
    const homeLead: string = dict.home.company.lead;
    await page.goto('/ko/brand/');
    const company = await page.locator('section', { hasText: 'AVORA LABS' }).last().innerText();
    expect(company, '브랜드 페이지가 홈의 소개 문장을 그대로 옮겨 왔습니다')
      .not.toContain(homeLead);
    expect(company.length, '회사 이야기가 너무 짧습니다').toBeGreaterThan(200);
  });
});
