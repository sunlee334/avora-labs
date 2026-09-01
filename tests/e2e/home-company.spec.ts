import { test, expect } from '@playwright/test';
import { LOCALES, SOCIAL } from '../../src/config/site';
import { FOUNDER_PHOTO, FOUNDER_STORY } from '../../src/config/company';

/**
 * 홈의 회사 소개 — 지어내지 않았는가.
 *
 * ── 왜 이 검사가 있는가 ────────────────────────────────────
 * 이 섹션은 **담당자에게 받아야 하는 것** 을 담는 자리입니다. 창업 배경과
 * 대표자 사진이 아직 없고, 없는 동안 그럴듯한 문장이나 회색 상자로 채우면
 * 그건 채운 것이 아니라 거짓말한 것입니다.
 *
 * 그래서 지키는 것은 "무엇이 있는가" 가 아니라 **"설정이 비면 화면도 빈다"**
 * 입니다. 나중에 원고가 들어오면 같은 검사가 반대 방향으로 지킵니다.
 */

test.describe('회사 소개', () => {
  test('5개 언어에 회사 섹션이 있다', async ({ page }) => {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/`);
      const section = page.locator('[data-section="company"]');
      await expect(section, `${locale} 에 회사 섹션이 없습니다`).toHaveCount(1);
      const text = await section.innerText();
      expect(text, `${locale} 회사 섹션이 비었습니다`).toContain('AVORA LABS');
    }
  });

  test('인스타그램이 푸터 밖에도 있다', async ({ page }) => {
    /*
     * 푸터에만 두면 "살아 있는 회사" 라는 신호가 본문 어디에도 없습니다.
     * 링크가 두 곳에 있어야 하고, 둘 다 같은 계정을 가리켜야 합니다.
     */
    await page.goto('/ko/');
    const inSection = page.locator(`[data-section="company"] a[href="${SOCIAL.instagramUrl}"]`);
    await expect(inSection, '회사 섹션에 인스타그램 링크가 없습니다').toHaveCount(1);
    const inFooter = page.locator(`footer a[href="${SOCIAL.instagramUrl}"]`);
    await expect(inFooter, '푸터에서 인스타그램 링크가 사라졌습니다').toHaveCount(1);
  });

  test('설정이 비어 있으면 화면도 비어 있다', async ({ page }) => {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/`);
      const section = page.locator('[data-section="company"]');

      // 사진: 설정이 비면 이미지가 아예 없어야 합니다. 회색 상자도 금지입니다.
      const images = await section.locator('img').count();
      expect(images, `${locale} 사진 설정은 ${FOUNDER_PHOTO} 인데 img 가 ${images}개입니다`)
        .toBe(FOUNDER_PHOTO ? 1 : 0);

      // 창업 이야기: 설정에 없으면 그 문단이 없어야 합니다.
      const story = FOUNDER_STORY[locale];
      const paragraphs = await section.locator('p.body').count();
      expect(paragraphs, `${locale} 창업 이야기 문단 수가 설정과 어긋납니다`).toBe(story ? 2 : 1);
      if (story) {
        expect(await section.innerText(), `${locale} 설정한 이야기가 화면에 없습니다`).toContain(story);
      }
    }
  });

  test('사진이 없으면 한 열로 선다', async ({ page }) => {
    /* 빈 회색 사각형은 사진이 없는 것보다 더 허전해 보입니다. auto-fit 이
       자식 수를 보고 칸을 정하므로, 자식이 하나면 한 칸이어야 합니다. */
    test.skip(Boolean(FOUNDER_PHOTO), '사진이 들어오면 2열이 정상입니다');
    await page.goto('/ko/');
    /*
     * 트랙 개수가 아니라 **결과** 를 잽니다. auto-fit 은 빈 트랙을 0px 로
     * 접는데, 그러면 computed 값에는 트랙이 여럿으로 남습니다. 지키려는 것은
     * "글이 한 열을 가득 쓴다" 이지 트랙 개수가 아닙니다.
     */
    const { child, track } = await page
      .locator('[data-section="company"] .split')
      .evaluate((el) => ({
        child: (el.firstElementChild as HTMLElement).getBoundingClientRect().width,
        track: el.getBoundingClientRect().width,
      }));
    expect(child, `글이 ${Math.round(child)}px 로 ${Math.round(track)}px 를 못 채웁니다`)
      .toBeCloseTo(track, 0);
  });
});
