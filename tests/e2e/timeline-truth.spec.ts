import { test, expect } from '@playwright/test';
import { TIMELINE_DATES, stepStates } from '../../src/config/timeline';
import ko from '../../src/i18n/ko.json' with { type: 'json' };

/**
 * 홈 타임라인이 오늘에 대해 참말을 하는가.
 *
 * 전에는 진행 상태가 i18n 의 고정 문자열이었습니다. 첫 항목이 `진행중` 으로
 * 박혀 있어서, 검증단 모집이 시작하지도 않은 2026년 9월에 화면이 모집 중이라고
 * 말했습니다. `llms.txt` 는 정확하게 "Recruiting opens in October 2026" 이라고
 * 적어 두었으니, **우리가 기계에게 두 가지 사실을 동시에 주고 있었습니다.**
 * 답변엔진은 화면을 먼저 읽습니다.
 *
 * 그래서 이 파일은 문구가 아니라 **규칙** 을 봅니다 — 날짜와 오늘의 관계가
 * 화면의 배지와 맞는가.
 */

const STATES = ko.home.timeline.states;

test.describe('진행 상태를 손으로 적지 않는다', () => {
  test('오늘 기준으로 계산한 것과 화면이 같다', async ({ page }) => {
    await page.goto('/ko/');

    const rows = await page.locator('.timeline li').evaluateAll((els) =>
      els.map((el) => ({
        datetime: el.querySelector('time')?.getAttribute('datetime') ?? null,
        state: el.querySelector('.timeline__state')?.textContent?.trim() ?? null,
        now: el.classList.contains('timeline__now'),
      })),
    );

    expect(rows.length, '타임라인 항목 수가 날짜 수와 다릅니다').toBe(TIMELINE_DATES.length);

    const expected = stepStates(new Date());
    rows.forEach((row, i) => {
      expect(row.datetime, `${i}번째 항목의 datetime`).toBe(TIMELINE_DATES[i]);

      // 지나간 단계에는 배지가 없습니다 — 없는 문구를 지어내지 않기 위해서입니다.
      const want = expected[i] === 'past' ? null : STATES[expected[i] as 'active' | 'planned'];
      expect(row.state, `${TIMELINE_DATES[i]} 의 상태 배지`).toBe(want);

      // 강조도 같은 판정을 따라야 합니다. 전에는 `i === 0` 이라 첫 줄에 고정이었습니다.
      expect(row.now, `${TIMELINE_DATES[i]} 의 강조`).toBe(expected[i] === 'active');
    });
  });

  test('아직 오지 않은 일을 진행중이라고 하지 않는다', async ({ page }) => {
    /*
     * 위 검사는 계산식과 화면이 같은지만 봅니다. 계산식 자체가 틀리면 둘 다
     * 같이 틀립니다. 여기서는 **바깥의 사실** 로 확인합니다 — 아직 오지 않은
     * 날짜의 항목이 진행중이면 안 됩니다.
     */
    await page.goto('/ko/');

    const today = new Date().toISOString().slice(0, 10);
    const rows = await page.locator('.timeline li').evaluateAll((els) =>
      els.map((el) => ({
        datetime: el.querySelector('time')!.getAttribute('datetime')!,
        state: el.querySelector('.timeline__state')?.textContent?.trim() ?? null,
      })),
    );

    for (const row of rows) {
      if (row.datetime > today.slice(0, row.datetime.length)) {
        expect(row.state, `${row.datetime} 는 아직 오지 않았습니다`).toBe(STATES.planned);
      }
    }
  });

  test('llms.txt 와 화면이 같은 달을 말한다', async ({ page, request }) => {
    /*
     * 이 결함의 본질은 "화면과 llms.txt 가 서로 다른 말을 한다" 였습니다.
     * 둘 다 우리가 기계에게 주는 사실이므로 갈라지면 안 됩니다.
     */
    const llms = await (await request.get('/llms.txt')).text();
    expect(llms, 'llms.txt 가 모집 시작 시점을 적지 않습니다').toContain('October 2026');

    await page.goto('/ko/');
    const first = page.locator('.timeline li').first();
    await expect(first.locator('time')).toHaveAttribute('datetime', '2026-10');
  });

  test('계산식이 경계에서 갈린다', () => {
    /*
     * 화면 없이 규칙만 봅니다. 브라우저를 띄우지 않으므로 미래·과거를 마음대로
     * 놓고 확인할 수 있습니다 — 시간이 지나도 이 단언은 그대로입니다.
     */
    const at = (iso: string) => stepStates(new Date(`${iso}T00:00:00Z`));

    // 모집 전날: 아직 아무것도 시작하지 않았습니다.
    expect(at('2026-09-30')).toEqual(['planned', 'planned', 'planned', 'planned', 'planned']);
    // 모집 첫날: 첫 단계만 진행중.
    expect(at('2026-10-01')[0]).toBe('active');
    // 평가가 시작하면 모집은 지나간 것이 됩니다.
    expect(at('2026-11-05').slice(0, 2)).toEqual(['past', 'active']);

    /*
     * ⚠️ 여기가 한때 어긋나던 자리입니다.
     *
     * 표시값과 비교값을 같은 `'2027'` 하나로 쓰던 때, 문자열 앞자리 비교에서
     * `'2027'` 이 `'2027-02'` **앞** 에 섰습니다. 그래서 2027년 1월에 집계와
     * 출시가 **동시에 진행중** 이 되고, 그 사이의 펀딩은 영영 진행중이 되지
     * 못했습니다. 원래 이 검사는 네 날짜만 찍어 보고 그 구간을 지나쳤습니다.
     */
    expect(at('2027-01-15')).toEqual(['past', 'past', 'active', 'planned', 'planned']);
    // 펀딩이 열리면 그것이 진행중이고, 출시는 아직 예정입니다.
    expect(at('2027-02-15')).toEqual(['past', 'past', 'past', 'active', 'planned']);
    /*
     * 출시는 **점이 아니라 창** 입니다("2027 상반기"). 그 창이 닫힐 때까지
     * `예정` 으로 둡니다 — 아직 출시하지 않았다는 것이 사실이기 때문입니다.
     */
    expect(at('2027-05-01').at(-1)).toBe('planned');
    expect(at('2027-07-15').at(-1)).toBe('active');

    // 어느 날짜에도 진행중은 하나뿐이어야 합니다.
    for (const day of [
      '2026-10-01', '2026-11-05', '2026-12-20', '2027-01-15',
      '2027-02-15', '2027-05-01', '2027-07-15',
    ]) {
      const active = at(day).filter((s) => s === 'active').length;
      expect(active, `${day} 에 진행중이 ${active}개입니다`).toBe(1);
    }
  });
});
