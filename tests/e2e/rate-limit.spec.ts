import { test, expect, request as playwrightRequest } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PORT } from '../../playwright.config';

/*
 * 공개 쓰기의 문턱.
 *
 * 다른 테스트는 playwright.config.ts 의 `extraHTTPHeaders` 로 문턱을 지나갑니다.
 * 여기서는 그 헤더를 **빼고** 두드려야 하므로, 설정을 물려받지 않는 요청
 * 컨텍스트를 직접 만듭니다.
 *
 * 본문은 일부러 잘못 보냅니다. 문턱은 라우팅보다 앞에 있어 핸들러가 거절할
 * 요청도 똑같이 셉니다 — 덕분에 DB 에 행 하나 남기지 않고 문턱만 두드릴 수
 * 있습니다. 진짜 문의를 쏟아부으면 관리 화면의 미답변 목록이 밀려서, 같은
 * 서버를 쓰는 다른 테스트가 애먼 이유로 깨집니다.
 *
 * 재시도를 견디도록 "앞 20건은 반드시 통과" 가 아니라 "30건 안에 429 가 있다"
 * 로 적었습니다. 문턱은 60초 창이라, 재시도가 같은 창 안에서 돌면 첫 건부터
 * 429 입니다 — 그래도 이 문장은 참입니다.
 */
const GARBAGE = { email: '', consent: false };

async function bareContext() {
  return playwrightRequest.newContext({
    baseURL: `http://127.0.0.1:${PORT}`,
    extraHTTPHeaders: {},
  });
}

test.describe('공개 쓰기 속도 제한', () => {
  test('출시 알림을 쏟아부으면 막힌다', async () => {
    const api = await bareContext();
    const codes: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      codes.push((await api.post('/api/launch-notify', { data: GARBAGE })).status());
    }
    await api.dispose();

    // 문턱이 없으면 429 가 0 건입니다 — 그게 이 검사의 반대 대조군입니다.
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    // 행은 하나도 만들지 않았습니다. 전부 거절이거나 문턱입니다.
    expect(codes.every((c) => c === 400 || c === 429)).toBe(true);
  });

  test('막힐 때 JSON 과 Retry-After 를 준다', async () => {
    const api = await bareContext();
    let blocked = null;
    for (let i = 0; i < 30 && !blocked; i += 1) {
      const res = await api.post('/api/reviews', { data: GARBAGE });
      if (res.status() === 429) blocked = res;
    }
    expect(blocked, '30건 안에 막히지 않았습니다').not.toBeNull();

    // 프런트는 res.json() 으로 읽습니다. HTML 이 오면 거기서 다시 터집니다.
    expect(blocked!.headers()['content-type']).toContain('application/json');
    expect(blocked!.headers()['retry-after']).toBe('60');
    expect(await blocked!.json()).toMatchObject({ error: 'RATE_LIMITED' });

    await api.dispose();
  });

  test('길마다 따로 센다', async () => {
    /*
     * 한 곳이 막혔다고 나머지 셋이 함께 닫히면, 장애 하나가 사이트 전체를
     * 멈춥니다. 여기서 직접 한 길을 막아 놓고 다른 길을 두드립니다 — 다른
     * 테스트가 먼저 돌았기를 기대하지 않습니다(fullyParallel 입니다).
     */
    const api = await bareContext();
    let blocked = false;
    for (let i = 0; i < 30 && !blocked; i += 1) {
      blocked = (await api.post('/api/launch-notify', { data: GARBAGE })).status() === 429;
    }
    expect(blocked, '먼저 한 길을 막지 못했습니다').toBe(true);

    const other = await api.post('/api/inquiries', { data: GARBAGE });
    await api.dispose();
    expect(other.status()).not.toBe(429);
  });

  test('우회 열쇠를 든 요청은 문턱을 지나간다', async ({ request }) => {
    // 이 `request` 는 설정의 우회 헤더를 물려받습니다. 위에서 같은 아이피가
    // 문턱을 다 썼더라도 통과해야 합니다.
    for (let i = 0; i < 25; i += 1) {
      expect((await request.post('/api/launch-notify', { data: GARBAGE })).status()).toBe(400);
    }
  });
});

/*
 * 이 파일이 지키는 전제.
 *
 * `test.use({ extraHTTPHeaders })` 는 최상위 `use` 를 병합하지 않고 **덮습니다.**
 * 그래서 자기 헤더를 얹는 describe 에서만 우회 열쇠가 사라지고, 그 안의
 * 테스트들이 429 로 죽습니다. 실제로 한 번 그렇게 15건이 무너졌습니다.
 * 원인이 이 파일과 아무 상관 없어 보이는 자리에서 터지므로, 여기서 미리 잡습니다.
 */
test.describe('우회 열쇠를 잃어버리는 자리가 없는가', () => {
  function specFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return specFiles(full);
      return entry.name.endsWith('.spec.ts') ? [full] : [];
    });
  }

  test('extraHTTPHeaders 를 덮는 곳은 모두 TEST_HEADERS 를 펼쳐 넣는다', () => {
    const offenders: string[] = [];

    for (const file of specFiles('tests/e2e')) {
      // 검사기 자신은 뺍니다 — 아래 구현이 이 이름을 문자열로 들고 있습니다.
      if (file.endsWith('rate-limit.spec.ts')) continue;

      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const code = line.trim();
          // 주석에서 이 이름을 말하는 줄은 설정이 아닙니다.
          if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) return;
          if (!code.includes('extraHTTPHeaders:')) return;
          // 문턱을 검사하려고 일부러 비우는 자리는 예외입니다.
          if (code.includes('extraHTTPHeaders: {}')) return;
          if (code.includes('TEST_HEADERS')) return;
          offenders.push(`${file}:${i + 1}`);
        });
    }

    expect(
      offenders,
      `이 자리들이 우회 열쇠를 잃습니다. { ...TEST_HEADERS, ... } 로 펼쳐 넣으세요:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
