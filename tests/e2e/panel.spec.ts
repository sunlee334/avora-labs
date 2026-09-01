import { test, expect } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };

/**
 * 검증단 모집 페이지.
 *
 * 이 사이트에서 **날짜가 걸린 유일한 페이지**입니다. 2026년 10월 첫째 주에
 * 러닝 크루 담당자에게 DM 을 보낼 때 링크 하나로 지원이 완결되어야 합니다.
 *
 * 지시 문서 C1 의 완료 기준을 그대로 옮겼습니다.
 */

const LANGS = ['ko', 'en', 'zh', 'th', 'vi'] as const;

test.describe('페이지가 서 있다', () => {
  test('5개 언어에서 열린다', async ({ page }) => {
    for (const lang of LANGS) {
      const res = await page.goto(`/${lang}/panel/`);
      expect(res?.status(), lang).toBe(200);
      await expect(page.locator('h1'), lang).toBeVisible();
    }
  });

  test('한국어판만 색인된다', async ({ page }) => {
    /*
     * 모집은 국내 러닝 크루 대상입니다. 팔지도 않는 시장에서 유입을 받아 봐야
     * 전환되지 않고, 얇은 페이지가 사이트 품질 신호를 끌어내립니다.
     */
    await page.goto('/ko/panel/');
    await expect(page.locator('meta[name="robots"]'), '한국어판이 noindex 입니다').toHaveCount(0);

    for (const lang of ['en', 'zh', 'th', 'vi']) {
      await page.goto(`/${lang}/panel/`);
      await expect(page.locator('meta[name="robots"]'), lang).toHaveAttribute(
        'content',
        /noindex/,
      );
    }
  });
});

/**
 * 가는 길.
 *
 * 페이지는 배점표·커트라인까지 갖춘 채로 서 있었는데 **헤더에도 푸터에도
 * 링크가 없었습니다.** 홈 중간 섹션의 CTA 와 FAQ 한 줄이 전부였고, 둘 다 홈을
 * 한참 내려야 나옵니다. 제품·브랜드·고객센터로 들어온 사람에게 검증단은
 * 존재하지 않는 것과 같았습니다.
 *
 * 위의 `정의는 한 곳이다`(nav-desktop.spec.ts)는 정의 파일을 읽어 화면과
 * 대조하므로, 정의에서 검증단을 빼면 기대집합도 함께 줄어 통과합니다.
 * **여기서만 목적지를 이름으로 못 박습니다** — 이 화면으로 가는 길이 사라지면
 * 그 문서가 아니라 이 검사가 막습니다.
 */
test.describe('가는 길이 있다', () => {
  test('헤더에서 갈 수 있다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    await expect(
      page.locator('.nav__links a[href="/ko/panel/"]'),
      '헤더에 검증단 링크가 없습니다 — 10월 모집의 착지점에 진입로가 없습니다',
    ).toHaveCount(1);
  });

  test('푸터에서 갈 수 있다', async ({ page }) => {
    await page.goto('/ko/');
    await expect(
      page.locator('[data-footer-menu] a[href="/ko/panel/"]'),
      '푸터에 검증단 링크가 없습니다',
    ).toHaveCount(1);
  });

  test('좁은 화면 메뉴에서도 갈 수 있다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/ko/');
    await page.locator('[data-menu-open]').click();
    await expect(
      page.locator('.menu__sheet a[href="/ko/panel/"]'),
      '메뉴 시트에 검증단 링크가 없습니다',
    ).toHaveCount(1);
  });

  test('5개 언어 전부 같은 자리에 있다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const lang of LANGS) {
      await page.goto(`/${lang}/`);
      await expect(
        page.locator(`.nav__links a[href="/${lang}/panel/"]`),
        `${lang}: 헤더에 검증단 링크가 없습니다`,
      ).toHaveCount(1);
    }
  });
});

test.describe('배점표', () => {
  test('배점과 커트라인이 모두 보인다', async ({ page }) => {
    /*
     * 이 표가 이 브랜드에서 가장 인용되기 쉬운 자료입니다 — "눈 시림 30점,
     * 커트라인 미만은 총점과 무관하게 탈락" 은 구체적이고 검증 가능합니다.
     * 답변 엔진은 이미지에서 숫자를 꺼내지 못하므로 마크업이어야 합니다.
     */
    await page.goto('/ko/panel/');
    const table = page.locator('.criteriaTable');
    await expect(table).toBeVisible();

    const text = await table.innerText();
    for (const row of ko.panel.criteria.rows) {
      expect(text, `${row.item} 의 배점`).toContain(row.score);
      if (row.cut !== '—') expect(text, `${row.item} 의 커트라인`).toContain(row.cut);
    }
  });

  test('375px 에서 가로로 밀리지 않는다', async ({ page }) => {
    /*
     * 가로 스크롤 상자로 감싸면 오른쪽 두 열(배점·커트라인)이 화면 밖에
     * 남는데, 그 두 열이 이 표의 요점입니다.
     */
    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/ko/panel/');
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `${width}px 에서 가로 넘침`).toBeLessThanOrEqual(0);

      // 표 자체도 스크롤 상자가 아니어야 합니다.
      const inner = await page
        .locator('.criteriaTable')
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(inner, `${width}px 에서 표가 가로로 잘립니다`).toBeLessThanOrEqual(1);
    }
  });

  test('표 마크업을 유지한다', async ({ page }) => {
    // 스크린리더가 표로 읽고, 답변 엔진이 열 관계를 잡을 수 있어야 합니다.
    await page.goto('/ko/panel/');
    await expect(page.locator('.criteriaTable thead th')).toHaveCount(4);
    await expect(page.locator('.criteriaTable tbody tr')).toHaveCount(6);
    await expect(page.locator('.criteriaTable th[scope="row"]')).toHaveCount(6);
  });
});

test.describe('브랜드가 다른 지점', () => {
  test('탈락 공개 약속이 있다', async ({ page }) => {
    /*
     * **이 섹션을 빼면 안 됩니다.** 경쟁 브랜드도 러너 만족도 조사를 하고
     * 수치를 게시합니다. 만족도 조사에는 실패가 없습니다 — 떨어진 처방의
     * 점수까지 공개하는 것이 이 브랜드가 다른 지점입니다.
     */
    await page.goto('/ko/panel/');
    const text = await page.locator('main').innerText();
    expect(text).toContain(ko.panel.rejected.heading);
    expect(text, '탈락 점수 공개 약속').toMatch(/탈락한 처방의 점수/);
  });

  test('인원수를 적지 않는다', async ({ page }) => {
    // 목표 인원을 먼저 공개하면 12명이 모였을 때 그 숫자가 스스로 만든
    // 신뢰 문제가 됩니다(지시 문서 A3-2).
    for (const lang of LANGS) {
      await page.goto(`/${lang}/panel/`);
      const text = await page.locator('main').innerText();
      expect(text, lang).not.toMatch(/서른에서 쉰|thirty to fifty|三十到五十|สามสิบถึงห้าสิบ|ba mươi đến năm mươi/i);
    }
  });

  test('정하지 않은 보상을 지어내지 않는다', async ({ page }) => {
    await page.goto('/ko/panel/');
    const text = await page.locator('main').innerText();
    expect(text).toContain(ko.panel.pending.heading);
    expect(text, '아직 정하지 못했다는 사실').toMatch(/아직 정하지 못했습니다/);
  });
});

test.describe('지원 폼', () => {
  test('필수 항목이 비면 어느 칸인지 각각 알려 준다', async ({ page }) => {
    /*
     * "지원되지 않았습니다" 만 보여주면 지원자는 어느 칸을 고쳐야 할지
     * 모릅니다. 다섯 칸짜리 폼에서 그건 그냥 이탈입니다.
     */
    await page.goto('/ko/panel/');
    await page.locator('.panelForm button[type="submit"]').click();
    await expect(page.locator('.panelForm__state')).toBeVisible();
    // 이름·이메일·지역에는 칸 아래 자리가 있습니다(라디오는 묶음이라 상태로 알립니다).
    await expect(page.locator('.field__error:not([hidden])')).toHaveCount(3);
  });

  test('개인정보 동의 없이는 접수되지 않는다', async ({ request }) => {
    /*
     * 화면에서 required 로 막지만, 화면을 거치지 않고 들어오는 요청도
     * 있습니다. 이름과 지역을 받는 이상 동의 없이 저장하면 그 자체가 위반입니다.
     */
    const res = await request.post('/api/panel', {
      data: {
        name: '테스트', email: `no-consent-${Date.now()}@example.com`,
        activity: 'running', frequency: 'weekly_2_3', region: 'seoul', locale: 'ko',
        consent: false,
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('CONSENT_REQUIRED');
  });

  test('목록에 없는 값은 받지 않는다', async ({ request }) => {
    // 활동·빈도·지역은 우리가 정한 목록입니다. 임의 문자열을 그대로 담으면
    // 나중에 종목별로 추리는 것이 불가능해집니다.
    const res = await request.post('/api/panel', {
      data: {
        name: '테스트', email: `bad-${Date.now()}@example.com`,
        activity: '아무거나', frequency: 'weekly_2_3', region: 'seoul', locale: 'ko',
        consent: true,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_FIELDS');
    expect(body.fields).toContain('activity');
  });

  test('빠진 칸을 한 번에 알려 준다', async ({ request }) => {
    // 하나씩 알려 주면 다섯 번 제출해야 다섯 번째 오류를 알게 됩니다.
    const res = await request.post('/api/panel', { data: { consent: true, locale: 'ko' } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.fields).toEqual(
      expect.arrayContaining(['name', 'email', 'activity', 'frequency', 'region']),
    );
  });

  test('정상 지원이 접수된다', async ({ page }) => {
    await page.goto('/ko/panel/');
    /*
     * 검사는 폼을 1초 안에 채웁니다. 그대로 두면 봇 문턱(2초)에 걸려
     * 지원서가 **버려지는데** 화면에는 "접수되었습니다" 가 뜹니다 — 응답이
     * 201 로 같기 때문입니다(봇에게 단서를 주지 않으려는 설계).
     *
     * 실제로 이 검사가 그 상태로 통과하고 있었습니다. 실측 1,774ms.
     * 저장까지 확인하는 것은 commerce 쪽 spam-store.spec.ts 가 합니다.
     */
    await page.locator('[data-panel-form]').evaluate((el) => {
      (el as HTMLElement).dataset.elapsedOffset = '5000';
    });
    await page.fill('#name', '테스트러너');
    await page.fill('#email', `ok-${Date.now()}@example.com`);
    await page.check('input[name="activity"][value="running"]');
    await page.check('input[name="frequency"][value="weekly_2_3"]');
    await page.selectOption('#region', 'seoul');
    await page.check('input[name="consent"]');
    await page.locator('.panelForm button[type="submit"]').click();

    const state = page.locator('[data-panel-state]');
    await expect(state).toBeVisible();
    await expect(state).toHaveText(ko.panel.form.done);
    // 접수된 뒤에는 폼이 남아 있으면 안 됩니다 — 또 낼 수 있는 화면처럼 보입니다.
    await expect(page.locator('.panelForm button[type="submit"]')).toBeHidden();
  });

  test('키보드만으로 제출까지 간다', async ({ page }) => {
    /*
     * 손이 하나뿐인 상황이 타겟인 브랜드에서 키보드 경로가 막히면,
     * 보조기기 사용자에게는 지원 자체가 불가능합니다.
     */
    await page.goto('/ko/panel/');
    await page.locator('[data-panel-form]').evaluate((el) => {
      (el as HTMLElement).dataset.elapsedOffset = '5000';
    });
    await page.locator('#name').focus();
    await page.keyboard.type('키보드');
    await page.keyboard.press('Tab');
    await page.keyboard.type(`kbd-${Date.now()}@example.com`);

    // 라디오는 Tab 으로 묶음에 들어가 화살표로 고릅니다.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');

    await page.selectOption('#region', 'seoul');
    await page.check('input[name="consent"]');
    await page.locator('.panelForm button[type="submit"]').press('Enter');
    await expect(page.locator('[data-panel-state]')).toBeVisible();
  });

  test('입력창이 16px 이상이다', async ({ page }) => {
    // 미만이면 iOS 사파리가 포커스 때 페이지를 확대합니다.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/panel/');
    const sizes = await page.evaluate(() =>
      // 덫 칸(.honeypot)은 일부러 화면 밖에 있는 1px 입니다 — 사람이 쓰는 칸만 봅니다.
      [...document.querySelectorAll('.panelForm .field input, .panelForm select')]
        .map((el) => parseFloat(getComputedStyle(el).fontSize)),
    );
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
  });

  test('탭 영역이 44px 이상이다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/panel/');
    const small = await page.evaluate(() => {
      const out: string[] = [];
      // 덫 칸은 제외합니다 — 사람은 닿을 수 없는 칸입니다.
      for (const el of document.querySelectorAll<HTMLElement>('.panelForm .choice, .panelForm button, .panelForm select, .panelForm .field input')) {
        const b = el.getBoundingClientRect();
        if (b.width && b.height < 44) out.push(`${el.className || el.tagName} h=${b.height}`);
      }
      return out;
    });
    expect(small, small.join('\n')).toEqual([]);
  });
});
