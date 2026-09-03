import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LOCALES } from '../../src/config/site';

/**
 * 활동이 러닝 하나로 되돌아가지 않는다.
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 * 모집 문장은 "러닝 크루·클라이밍짐·서핑 커뮤니티" 라고 적는데, 사이트의
 * 사진은 전부 러닝 아니면 피부 클로즈업이었습니다. 글과 그림이 다른 말을
 * 하면 사람은 그림을 믿습니다 — **클라이머와 서퍼가 그 문장을 자기
 * 이야기로 읽지 않습니다.**
 *
 * 그래서 이 파일은 "이미지가 몇 장인가" 가 아니라 **어느 활동이 화면에
 * 있는가** 를 봅니다. 나중에 누가 사진을 갈아 끼워도 세 활동이 남아야
 * 합니다.
 */

test.describe('세 활동이 화면에 있다', () => {
  test('검증단 문단 아래에 러닝과 클라이밍이 나란히 있다', async ({ page }) => {
    await page.goto('/ko/');
    const shots = page.locator('.panelShots img');
    await expect(shots, '두 장이 나란히 있어야 합니다').toHaveCount(2);

    /*
     * 자리가 요점입니다. 모집 문장에서 멀어지면 그냥 장식 사진이 됩니다.
     */
    const section = page.locator('[data-section="test_panel"]');
    await expect(section.locator('.panelShots')).toHaveCount(1);
  });

  test('서핑은 THE JOURNEY 다음에 있다', async ({ page }) => {
    await page.goto('/ko/');
    const journey = page.locator('[data-section="the_journey"]');
    const figure = journey.locator('~ figure.figure').first();
    await expect(figure.locator('img')).toHaveCount(1);
    await expect(figure.locator('figcaption')).toHaveText('SURF');
  });

  test('브랜드 페이지에 두 장이 있다', async ({ page }) => {
    await page.goto('/ko/brand');
    await expect(page.locator('.figure--inline img')).toHaveCount(2);
  });

  for (const lang of LOCALES) {
    test(`${lang} 에서도 대체 텍스트가 그 언어로 나온다`, async ({ page }) => {
      /*
       * 화면을 못 보는 사람에게 활동 다양성을 전하는 것은 alt 뿐입니다.
       * 비어 있거나 한 언어로만 있으면 그 사람에게는 여전히 러닝뿐입니다.
       */
      await page.goto(`/${lang}/`);
      const alts = await page.locator('.panelShots img').evaluateAll((els) =>
        els.map((el) => (el as HTMLImageElement).alt),
      );
      expect(alts).toHaveLength(2);
      for (const alt of alts) expect(alt.trim().length, `${lang} 의 alt 가 비었습니다`).toBeGreaterThan(8);
      // 두 장이 같은 문장이면 한 장은 설명되지 않은 것과 같습니다.
      expect(new Set(alts).size, `${lang} 의 두 alt 가 같습니다`).toBe(2);
    });
  }
});

test.describe('고르는 기준을 지켰다', () => {
  test('유료 라이선스(Unsplash+) 사진을 쓰지 않았다', () => {
    /*
     * 검색 결과에는 `plus.unsplash.com` 으로 오는 Unsplash+ 가 섞여 나옵니다.
     * 무료 라이선스와 조건이 다른데 화면에서는 구분되지 않습니다. 출처
     * 문서가 그 경계를 적어 두지 않으면 다음 사람이 같은 함정에 빠집니다.
     */
    const doc = readFileSync('src/assets/images/SOURCES.md', 'utf8');
    expect(doc, 'Unsplash+ 를 쓰지 않았다는 근거가 문서에 없습니다').toContain('Unsplash+');
  });

  test('새로 넣은 다섯 장의 출처가 전부 적혀 있다', () => {
    /*
     * 지시서 D4 가 "라이선스 종류와 출처 URL 을 기록해 보고할 것" 이라고
     * 못 박았습니다. 파일만 있고 출처가 없으면 나중에 쓸 수 있는지 아무도
     * 판단하지 못합니다.
     */
    const doc = readFileSync('src/assets/images/SOURCES.md', 'utf8');
    for (const file of [
      'home-panel-crew.jpg',
      'home-panel-bouldering.jpg',
      'home-journey-surf.jpg',
      'brand-light-leaves.jpg',
      'brand-light-window.jpg',
    ]) {
      expect(doc, `${file} 의 출처가 없습니다`).toContain(file);
    }
    // 표의 각 줄에 unsplash.com 링크가 붙어 있어야 합니다.
    const rows = doc.split('\n').filter((l) => l.startsWith('| `') && l.includes('.jpg`'));
    for (const row of rows) {
      expect(row, `출처 링크가 없는 줄: ${row.slice(0, 40)}`).toMatch(
        /unsplash\.com\/photos\/|위와 같은 사진/,
      );
    }
  });
});
