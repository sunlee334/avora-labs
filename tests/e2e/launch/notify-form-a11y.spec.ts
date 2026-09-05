import { test, expect } from '@playwright/test';

/**
 * 알림 신청 폼 — 무엇을 적는 칸인지, 무엇이 잘못됐는지 화면에 남는가.
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 * 이 폼만 라벨을 숨기고 있었습니다.
 *
 *   <span class="field__label--visually-hidden">이메일</span>
 *   <input placeholder="…" aria-label="이메일">
 *
 * 눈으로 보는 사람에게 남는 것은 플레이스홀더뿐인데, 플레이스홀더는 **입력을
 * 시작하는 순간 사라집니다.** 5개 언어를 운영하므로 문제가 하나 더 있습니다 —
 * 번역이 길어지면 플레이스홀더가 잘리는데, 잘렸다는 사실이 화면에 드러나지
 * 않습니다.
 *
 * 이 저장소는 그 규칙을 이미 알고 있었습니다. `Field.astro` 의 첫 주석이
 * 정확히 이 이야기이고, 다른 폼은 전부 그 컴포넌트를 씁니다. **이 폼만
 * 예외였습니다** — 규칙을 몰라서가 아니라 한 자리가 빠져 있었던 것이라,
 * 문서가 아니라 검사로 막습니다.
 *
 * ── 오류도 마찬가지였습니다 ────────────────────────────────
 * 오류 문구가 `--color-text`(본문색)였습니다. 도움말과 같은 색이라, 무엇이
 * 잘못됐다는 신호가 **글의 내용에만** 있었습니다. 화면을 훑는 사람에게는
 * 아무 표시도 없는 것과 같습니다.
 *
 * 색만으로 말하지는 않습니다 — 문구와 `aria-invalid` 가 먼저이고 색은 그
 * 위에 얹는 두 번째 신호입니다. 그래서 셋을 다 봅니다.
 */

/** 홈에는 이 폼이 여럿입니다(첫 화면·스토리 끝·하단 시트). */
const FORM = '[data-launch-notify]';

const channels = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

function luminance(color: string): number {
  const [r, g, b] = channels(color).map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test.describe('알림 폼 접근성', () => {
  test('이메일 라벨이 화면에 보이고 입력칸에 연결된다', async ({ page }) => {
    await page.goto('/ko/');

    const rows = await page.locator(FORM).evaluateAll((forms) =>
      forms.map((form) => {
        const input = form.querySelector<HTMLInputElement>('input[name="email"]')!;
        const label = form.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`);
        const box = label?.getBoundingClientRect();
        return {
          source: (form as HTMLElement).dataset.source,
          inputId: input.id,
          hasLabel: Boolean(label),
          labelText: label?.textContent?.trim() ?? '',
          /* 실제로 자리를 차지하는가 — `clip-path` 로 숨긴 라벨은 1×1 입니다. */
          width: Math.round(box?.width ?? 0),
          height: Math.round(box?.height ?? 0),
          /*
           * 하단 시트의 폼은 닫힌 `<dialog>` 안에 있어 지금은 레이아웃이
           * 없습니다 — 라벨이 숨겨진 것이 아니라 **폼 전체가** 그렇습니다.
           * 크기로는 그 둘을 구분할 수 없으므로 폼 자신의 상자를 함께 잽니다.
           */
          laidOut: form.getBoundingClientRect().height > 0,
          ariaLabel: input.getAttribute('aria-label'),
        };
      }),
    );

    expect(rows.length, '홈에 알림 폼이 없습니다').toBeGreaterThan(0);
    /*
     * 크기까지 재는 것은 지금 화면에 놓인 폼뿐입니다. 그 대상이 하나도 없으면
     * 이 검사는 구조만 보고 통과하게 되므로, 최소 하나는 있어야 합니다.
     */
    expect(
      rows.filter((r) => r.laidOut).length,
      '화면에 놓인 알림 폼이 없습니다 — 크기를 잰 대상이 하나도 없습니다',
    ).toBeGreaterThan(0);

    for (const r of rows) {
      expect(r.inputId, `${r.source} 의 입력칸에 id 가 없습니다`).not.toBe('');
      expect(r.hasLabel, `${r.source} 에 <label for> 가 없습니다`).toBe(true);
      expect(r.labelText, `${r.source} 의 라벨이 비었습니다`).not.toBe('');
      if (r.laidOut) {
        expect(
          r.width * r.height,
          `${r.source} 의 라벨이 ${r.width}×${r.height} 입니다 — 화면에서 숨겨져 있습니다`,
        ).toBeGreaterThan(200);
      }
      /*
       * `aria-label` 이 남아 있으면 그쪽이 이깁니다. 보이는 라벨을 고쳐도
       * 읽는 기계에는 반영되지 않는 어긋남이 생기고, 그 어긋남은 화면에
       * 드러나지 않습니다.
       */
      expect(r.ariaLabel, `${r.source} 의 aria-label 이 보이는 라벨을 덮습니다`).toBeNull();
    }
  });

  test('폼이 여럿이어도 id 가 겹치지 않고 설명이 제 짝을 가리킨다', async ({ page }) => {
    await page.goto('/ko/');

    const rows = await page.locator(FORM).evaluateAll((forms) =>
      forms.map((form) => {
        const input = form.querySelector<HTMLInputElement>('input[name="email"]')!;
        const described = input.getAttribute('aria-describedby') ?? '';
        const target = described ? document.getElementById(described) : null;
        return {
          source: (form as HTMLElement).dataset.source,
          inputId: input.id,
          described,
          /* 가리키는 요소가 **이 폼 안에** 있어야 합니다. */
          insideOwnForm: Boolean(target && form.contains(target)),
        };
      }),
    );

    expect(rows.length).toBeGreaterThan(0);
    const ids = rows.map((r) => r.inputId);
    expect(new Set(ids).size, `입력칸 id 가 겹칩니다: ${ids.join(', ')}`).toBe(ids.length);

    for (const r of rows) {
      expect(r.described, `${r.source} 에 aria-describedby 가 없습니다`).not.toBe('');
      expect(
        r.insideOwnForm,
        `${r.source} 의 aria-describedby(${r.described})가 다른 폼의 문구를 가리킵니다`,
      ).toBe(true);
    }
  });

  test('빈 채로 제출하면 그 칸이 잘못됐다고 말하고 커서를 되돌린다', async ({ page }) => {
    await page.goto('/ko/');

    const form = page.locator(FORM).first();
    const input = form.locator('input[name="email"]');
    await form.locator('[data-notify-submit]').click();

    // 1. 문구 — 무엇이 잘못됐는지 글로 남습니다.
    const state = form.locator('[data-notify-state]');
    await expect(state, '오류 문구가 뜨지 않았습니다').toBeVisible();
    await expect(state).toHaveAttribute('data-tone', 'bad');

    // 2. 속성 — 스크린리더가 "이 칸이 잘못됐다" 로 읽습니다.
    await expect(input, 'aria-invalid 가 붙지 않았습니다').toHaveAttribute('aria-invalid', 'true');

    // 3. 커서 — 고칠 자리로 되돌려 놓습니다.
    await expect(input, '포커스가 입력칸으로 돌아오지 않았습니다').toBeFocused();
  });

  test('고치기 시작하면 잘못됐다는 표시를 거둔다', async ({ page }) => {
    /*
     * 표시를 다음 제출까지 들고 있으면, 이미 고친 사람에게 계속 잘못됐다고
     * 말하는 셈입니다.
     */
    await page.goto('/ko/');

    const form = page.locator(FORM).first();
    const input = form.locator('input[name="email"]');
    await form.locator('[data-notify-submit]').click();
    await expect(input).toHaveAttribute('aria-invalid', 'true');

    await input.fill('a');
    await expect(input, '고치는 중인데 아직 잘못됐다고 표시합니다').not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test('오류 문구가 본문색이 아니고, 실제 배경에서 읽힌다', async ({ page }) => {
    /*
     * ⚠️ 대비를 **실제 렌더된 색** 으로 잽니다.
     *
     * 오류색(`--color-error` = #A33F13)은 기본 배경에서 5.97:1 이지만 어두운
     * 면(#252B31) 위에서는 2.24:1 로 무너집니다. 지금은 알림 폼이 밝은 면에만
     * 있어서 안전한데, **그 사실이 코드 어디에도 적혀 있지 않습니다.**
     * 누군가 이 폼을 어두운 밴드로 옮기면 조용히 읽히지 않게 됩니다.
     *
     * 팔레트 값이 아니라 그 자리의 색을 재면, 옮기는 순간 여기서 걸립니다.
     */
    await page.goto('/ko/');

    const form = page.locator(FORM).first();
    await form.locator('[data-notify-submit]').click();
    const state = form.locator('[data-notify-state]');
    await expect(state).toBeVisible();

    const colors = await state.evaluate((el) => {
      /* 문구 자체는 배경이 투명합니다. 뒤에 실제로 깔린 면을 찾아 올라갑니다. */
      let node: HTMLElement | null = el as HTMLElement;
      let bg = 'rgba(0, 0, 0, 0)';
      while (node) {
        const value = getComputedStyle(node).backgroundColor;
        if (value && !/rgba\(0, 0, 0, 0\)|transparent/.test(value)) {
          bg = value;
          break;
        }
        node = node.parentElement;
      }
      return {
        error: getComputedStyle(el).color,
        body: getComputedStyle(document.body).color,
        bg,
      };
    });

    expect(
      colors.error,
      '오류 문구가 본문색입니다 — 색으로는 오류인지 설명인지 알 수 없습니다',
    ).not.toBe(colors.body);

    const ratio = contrast(colors.error, colors.bg);
    expect(
      ratio,
      `오류 문구 ${colors.error} 가 배경 ${colors.bg} 에서 ${ratio.toFixed(2)}:1 입니다`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});
