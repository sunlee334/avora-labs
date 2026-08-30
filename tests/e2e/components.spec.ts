import { test, expect } from '@playwright/test';

/**
 * 버튼·입력 컴포넌트가 지키기로 한 것.
 *
 * 지시 문서 B1 과 2-3 의 제약을 화면에서 확인합니다. 문서에만 적어 두면
 * 다음 사람이 급할 때 알약형 버튼 하나를 다시 넣게 되고, 그것이 한 화면에서만
 * 어긋나면 아무도 눈치채지 못합니다.
 */

test.describe('알약형을 쓰지 않는다', () => {
  test('버튼과 칩의 모서리가 알약이 아니다', async ({ page }) => {
    /*
     * 기획안 5장의 "무광 매트 소프트터치, 유광 및 메탈릭 지양" 과 어긋나기
     * 때문입니다(지시 문서 2-3).
     *
     * **원형 아이콘 버튼과 숫자 배지는 대상이 아닙니다.** 문서가 금지한 것은
     * 알약형 *버튼* 이지 동그란 카운터가 아니고, 헤더의 원형 아이콘은 B3 의
     * 범위입니다. 그래서 여기서는 글자가 들어가는 가로로 긴 컨트롤만 봅니다.
     */
    await page.goto('/ko/');
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('a.cta, .btn, .notify__act')) {
        const box = el.getBoundingClientRect();
        if (box.width === 0) continue;
        const r = parseFloat(getComputedStyle(el).borderTopLeftRadius);
        // 알약은 높이의 절반 이상으로 둥급니다. 그보다 작으면 각진 모서리입니다.
        if (r >= box.height / 2) out.push(`${el.className} r=${r} h=${box.height}`);
      }
      return out;
    });
    expect(bad, `알약형이 남아 있습니다:\n  ${bad.join('\n  ')}`).toEqual([]);
  });
});

test.describe('버튼', () => {
  test('비활성 상태를 만들지 않는다', async ({ page }) => {
    /*
     * 이메일이 비었다고 버튼을 죽이면 사용자는 왜 안 눌리는지 모릅니다.
     * 항상 누를 수 있게 두고 누른 뒤 검증하는 편이 낫습니다(지시 문서 B1).
     */
    await page.goto('/ko/');
    const disabled = page.locator('main button[disabled], main .btn[disabled]');
    await expect(disabled, '처음부터 죽어 있는 버튼이 있습니다').toHaveCount(0);
  });

  test('모바일에서도 눌린 느낌이 있다', async ({ page }) => {
    /*
     * 모바일에는 호버가 없습니다. `:active` 를 정의하지 않으면 눌러도 아무
     * 반응이 없어 먹통처럼 느껴집니다.
     */
    const css = await (await page.request.get('/ko/')).text();
    const sheets = [...css.matchAll(/href="([^"]*\.css)"/g)].map((m) => m[1]);
    let all = '';
    for (const href of sheets) all += await (await page.request.get(href)).text();
    expect(all, '.btn 의 :active 가 없습니다').toMatch(/\.btn--primary:active/);
    expect(all, '.btn 의 로딩 상태가 없습니다').toMatch(/aria-busy/);
  });

  test('탭 영역이 44px 이상이다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('main a.cta, main .btn')) {
        const b = el.getBoundingClientRect();
        if (b.width && b.height < 44) out.push(`${el.className} h=${b.height}`);
      }
      return out;
    });
    expect(small, small.join('\n')).toEqual([]);
  });
});
