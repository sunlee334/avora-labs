import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MIN_FILL_MS, HONEYPOT_FIELD } from '../../worker/spam';

/**
 * 봇 방어.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────
 * 12월에 **명단 800명** 을 기준으로 다음 판단을 하기로 했습니다. 봇이 100건을
 * 넣으면 그 판단이 틀어집니다. 속도 제한은 같은 아이피에서 쏟아지는 것을
 * 막지만, 느리게 흩어 넣는 것은 잡지 못합니다.
 *
 * ── 이 파일이 지키는 두 가지 ────────────────────────────────
 * 1. 봇을 잡는가
 * 2. **사람을 막지 않는가** ← 이쪽이 더 중요합니다. 방어가 과하면 명단을
 *    잃는데, 잃었다는 사실이 어디에도 남지 않습니다.
 */

const ENDPOINTS = ['/api/launch-notify', '/api/panel'] as const;

function panelBody(extra: Record<string, unknown> = {}) {
  return {
    name: '테스트', email: `spam-${Date.now()}-${Math.random()}@example.com`,
    activity: 'running', frequency: 'weekly_2_3', region: 'seoul',
    locale: 'ko', consent: true, ...extra,
  };
}
function notifyBody(extra: Record<string, unknown> = {}) {
  return {
    email: `spam-${Date.now()}-${Math.random()}@example.com`,
    locale: 'ko', source: 'test', ...extra,
  };
}
const bodyFor = (path: string, extra?: Record<string, unknown>) =>
  path === '/api/panel' ? panelBody(extra) : notifyBody(extra);

test.describe('봇을 잡는다', () => {
  for (const path of ENDPOINTS) {
    test(`${path} — 덫 칸이 차 있으면 저장하지 않는다`, async ({ request }) => {
      /*
       * **성공한 척하고 버립니다.** 400 을 돌려주면 봇 운영자가 무엇에
       * 걸렸는지 알아내고 우회합니다.
       */
      const email = `trap-${Date.now()}@example.com`;
      const res = await request.post(path, {
        data: bodyFor(path, { email, [HONEYPOT_FIELD]: 'http://spam.example' }),
      });
      expect(res.status(), '봇에게 실패를 알려 주고 있습니다').toBe(201);
    });

    test(`${path} — 너무 빨리 내면 저장하지 않는다`, async ({ request }) => {
      const res = await request.post(path, {
        data: bodyFor(path, { elapsedMs: 300 }),
      });
      expect(res.status()).toBe(201);
    });
  }
});

test.describe('사람을 막지 않는다', () => {
  for (const path of ENDPOINTS) {
    test(`${path} — 덫이 비어 있으면 통과한다`, async ({ request }) => {
      const res = await request.post(path, { data: bodyFor(path, { [HONEYPOT_FIELD]: '' }) });
      expect(res.status()).toBe(201);
    });

    test(`${path} — 시각이 없으면 통과한다`, async ({ request }) => {
      /*
       * 스크립트가 막힌 브라우저, 오래된 기기, 자동완성으로 한 번에 채운 사람.
       * 값을 못 읽는 상황에서 사람을 막는 것보다 봇 몇을 놓치는 편이 낫습니다.
       */
      const res = await request.post(path, { data: bodyFor(path) });
      expect(res.status()).toBe(201);
    });

    test(`${path} — 값이 이상해도 사람을 막지 않는다`, async ({ request }) => {
      /*
       * 음수·문자열·거대한 값. 브라우저가 이상한 값을 보내는 상황에서
       * 사람을 막는 것보다 봇 몇을 놓치는 편이 낫습니다.
       *
       * 예전에는 화면이 뜬 **시각** 을 보내 서버 시계와 뺐습니다. 그러면
       * 시계가 앞선 기기의 정상 제출이 조용히 버려졌습니다. 지금은 브라우저가
       * 직접 잰 경과 시간이라 두 시계를 비교할 일이 없습니다.
       */
      for (const bad of [-1, 'abc', null, Number.MAX_SAFE_INTEGER]) {
        const res = await request.post(path, { data: bodyFor(path, { elapsedMs: bad }) });
        expect(res.status(), `elapsedMs=${bad}`).toBe(201);
      }
    });

    test(`${path} — 충분히 시간이 지났으면 통과한다`, async ({ request }) => {
      const res = await request.post(path, {
        data: bodyFor(path, { elapsedMs: MIN_FILL_MS + 1000 }),
      });
      expect(res.status()).toBe(201);
    });
  }
});

test.describe('덫이 사람 눈에 띄지 않는다', () => {
  test('화면 밖에 있고 탭으로 닿지 않는다', async ({ page }) => {
    await page.goto('/ko/panel/');
    const trap = page.locator(`input[name="${HONEYPOT_FIELD}"]`).first();
    await expect(trap).toHaveCount(1);
    await expect(trap).toHaveAttribute('tabindex', '-1');

    const seen = await trap.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { onScreen: b.left > -1000, hidden: el.closest('[aria-hidden="true"]') !== null };
    });
    expect(seen.onScreen, '덫이 화면 안에 있습니다').toBe(false);
    expect(seen.hidden, '스크린리더에 읽힙니다').toBe(true);
  });

  test('홈의 폼 둘이 같은 id 를 쓰지 않는다', async ({ page }) => {
    // id 가 겹치면 <label for> 가 첫 번째만 가리킵니다. 화면에도 검사에도
    // 드러나지 않는 종류의 오류입니다.
    await page.goto('/ko/');
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll('.honeypot input')].map((el) => el.id),
    );
    expect(new Set(ids).size, `중복 id: ${ids.join(', ')}`).toBe(ids.length);
  });
});

test.describe('속도 제한이 새 경로도 덮는다', () => {
  test('/api/panel 이 목록에 있다', () => {
    /*
     * 공개 쓰기가 하나 늘 때 이 목록에 한 줄을 빠뜨리면, 그 길만 문턱 없이
     * 열립니다. 실제로 /api/panel 을 만들면서 한 번 빠뜨렸습니다.
     */
    const src = readFileSync(fileURLToPath(new URL('../../worker/index.ts', import.meta.url)), 'utf8');
    const block = src.slice(src.indexOf('const WRITE_ROUTES'), src.indexOf('};', src.indexOf('const WRITE_ROUTES')));
    for (const path of ['/api/orders', '/api/reviews', '/api/inquiries', '/api/launch-notify', '/api/panel']) {
      expect(block, `${path} 가 속도 제한 목록에 없습니다`).toContain(path);
    }
  });
});
