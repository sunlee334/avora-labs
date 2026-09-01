import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * axe 검사 한 번 — **설정이 있는 유일한 곳.**
 *
 * `a11y.spec.ts` 가 갖고 있던 것을 그대로 꺼냈습니다. 꺼낸 이유는 두 번째
 * 사용처가 생겼기 때문입니다 — 하단 고정 CTA 의 신청 시트는 `!CAN_ORDER`
 * 일 때만 존재해서 `tests/e2e/launch/` 안에서만 검사할 수 있는데,
 * `a11y.spec.ts` 는 두 모드에서 모두 도는 루트 파일입니다.
 *
 * 규칙 목록을 양쪽에 적으면 한쪽만 늘어납니다. 접근성 기준이 파일마다
 * 다른 것은 기준이 없는 것과 같습니다.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

export interface Violation {
  rule: string;
  impact: string | null | undefined;
  help: string;
  where: string[];
}

export async function scanA11y(
  page: Page,
  testInfo: { attach: Function },
): Promise<Violation[]> {
  const results = await new AxeBuilder({ page }).withTags([...WCAG]).analyze();

  if (results.violations.length > 0) {
    // 실패했을 때 무엇이 어디서 걸렸는지 바로 보이게 남깁니다.
    await testInfo.attach('axe-violations', {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });
  }

  return results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    where: v.nodes.map((n) => n.target.join(' ')).slice(0, 3),
  }));
}
