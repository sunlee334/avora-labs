/**
 * e2e 용 로컬 D1 을 **확실히** 준비합니다.
 *
 * ── 왜 스크립트가 됐나 ─────────────────────────────────────
 * 전에는 webServer 명령이 이랬습니다.
 *
 *   npm run build && npx wrangler d1 migrations apply avora-orders --local && npx wrangler dev …
 *
 * 이 줄은 마이그레이션이 **성공했다고 말하고 아무것도 안 했을 때** 를 걸러내지
 * 못합니다. 그러면 서버는 정상적으로 뜨고, 테스트가 한참 돌다가 이렇게
 * 무너집니다.
 *
 *   [worker] 처리 중 예외 /api/orders  D1_ERROR: no such table: orders
 *   [worker] 처리 중 예외 /ko/         D1_ERROR: no such table: orders
 *   page.goto: Could not connect to 127.0.0.1: Connection refused
 *
 * 2026년 9월 한 세션에서 **네 번** 났습니다(전부 다른 커밋, 전부 재실행으로
 * 통과). 배포마다 재실행을 한 번씩 끼워야 하는 상태였습니다.
 *
 * ── 무엇을 바꿨나 ──────────────────────────────────────────
 * 적용한 뒤 **표가 실제로 있는지 물어봅니다.** 없으면 한 번 더 걸고, 그래도
 * 없으면 거기서 멈춥니다. 서버가 뜨기 전에 큰 소리로 죽는 편이, 30분 뒤
 * 엉뚱한 검사가 깨지는 것보다 낫습니다.
 *
 * 재시도가 고치지 못하는 원인이라면 이 스크립트가 그 사실을 알려 줍니다 —
 * "마이그레이션은 돌았는데 표가 없다" 는 지금까지 아무도 못 보던 상태입니다.
 */
import { execFileSync } from 'node:child_process';

/*
 * ⚠️ **stdout 이 아니라 stderr 입니다.**
 *
 * Playwright 는 webServer 의 stdout 을 기본으로 버리고 stderr 만 `[WebServer]`
 * 로 전달합니다. 처음에 stdout 으로 적었더니 CI 로그에 한 줄도 남지 않았고,
 * 그러면 **재시도가 걸린 날에도 아무도 모릅니다** — 조용한 실패를 조용한
 * 재시도로 바꾼 것뿐입니다.
 */
const log = (message) => process.stderr.write(`[e2e-db] ${message}\n`);

const DB = 'avora-orders';
/** 이 표가 없으면 주문·후기·계정이 전부 무너집니다. 준비됐다는 것의 기준입니다. */
const REQUIRED = ['orders', 'reviews', 'launch_notify'];

const wrangler = (args) =>
  execFileSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** 로컬 D1 에 실제로 있는 표 이름. */
function tables() {
  const out = wrangler([
    'd1',
    'execute',
    DB,
    '--local',
    '--json',
    '--command',
    "SELECT name FROM sqlite_master WHERE type='table'",
  ]);
  // `--json` 앞에 배너가 섞여 나오므로 첫 `[` 부터 읽습니다.
  const parsed = JSON.parse(out.slice(out.indexOf('[')));
  return new Set(parsed.flatMap((r) => (r.results ?? []).map((t) => t.name)));
}

function missing() {
  try {
    const found = tables();
    return REQUIRED.filter((t) => !found.has(t));
  } catch (err) {
    // 질의 자체가 실패하면 DB 가 없는 것으로 봅니다 — 첫 실행이 그렇습니다.
    return [...REQUIRED];
  }
}

for (let attempt = 1; attempt <= 2; attempt += 1) {
  log(`마이그레이션 적용 (${attempt}/2)`);
  wrangler(['d1', 'migrations', 'apply', DB, '--local']);

  const gone = missing();
  if (gone.length === 0) {
    log(`표 확인 완료 — ${REQUIRED.join(', ')}${attempt > 1 ? ' (재시도로 복구)' : ''}`);
    process.exit(0);
  }
  log(`⚠️ 적용 뒤에도 없는 표: ${gone.join(', ')}`);
}

process.stderr.write(
  '\n[e2e-db] 마이그레이션이 성공했다고 했는데 표가 없습니다.\n' +
    '         두 번 걸어도 같습니다 — 재시도로 넘길 문제가 아닙니다.\n' +
    '         `.wrangler/state` 를 지우고 다시 시도해 보세요.\n\n',
);
process.exit(1);
