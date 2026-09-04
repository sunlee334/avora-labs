/**
 * e2e 용 wrangler dev 를 **되살리고, 되살아나는 동안 요청을 붙잡습니다.**
 *
 * ── 무엇이 일어나는가 ──────────────────────────────────────
 * wrangler dev 가 검사 도중 죽습니다. CI 에서는 workerd 가 크래시하고
 *
 *   ✘ [ERROR] kj::…async-io-unix.c++:186: disconnected: ::write(fd, …): Broken pipe
 *   [wrangler:warn] The Workers runtime crashed unexpectedly and is being
 *                   restarted (crash #1).
 *
 * 로컬에서는 wrangler 자체가 코드 1 로 끝나기도 합니다. 어느 쪽이든 포트가
 * 사라지고, 남은 검사가 전부 이렇게 끝납니다.
 *
 *   connect ECONNREFUSED 127.0.0.1:8787   (한 실행에서 78건)
 *
 * ── 왜 되살리는 것만으로는 부족한가 ────────────────────────
 * 되살려도 다시 뜨는 데 십수 초가 걸립니다. 그 사이 들이닥친 검사는 1초 만에
 * ECONNREFUSED 로 깨지고, `retries: 2` 는 곧바로 재시도하므로 같은 창에
 * 갇힙니다. 실제로 한 번의 재기동이 7건을 데려갔습니다.
 *
 * ── 그래서 앞에 선다 ───────────────────────────────────────
 * 감시자가 검사가 아는 포트를 잡고, wrangler 는 그 옆 포트에 둡니다. 백엔드가
 * 없는 동안 들어온 요청은 **거절하지 않고 기다립니다.** 검사 눈에는 잠깐
 * 느린 요청일 뿐, 재기동은 보이지 않습니다.
 *
 * 몸통을 먼저 다 받아 두는 이유: 다시 시도하려면 보낼 것이 남아 있어야
 * 합니다. 업스트림으로 흘려보낸 뒤에 실패하면 그 몸통은 이미 없습니다.
 *
 * 되살린 사실은 **stderr 에 남깁니다.** Playwright 는 webServer 의 stdout 을
 * 버리므로, 조용히 복구하면 크래시가 잦아져도 아무도 모릅니다.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';

const MAX_RESTARTS = 5;
/** 첫 기동은 빌드 직후라 느립니다. 이 시간 동안은 응답이 없어도 기다립니다. */
const BOOT_GRACE_MS = 90_000;
const PROBE_EVERY_MS = 2_000;
const PROBE_TIMEOUT_MS = 3_000;
/** 부하가 걸리면 한두 번은 놓칠 수 있습니다. 연속 실패만 죽음으로 봅니다. */
const DEAD_AFTER_MISSES = 5;
/** 붙잡아 두는 한계. Playwright 의 검사 제한시간보다 짧아야 합니다. */
const HOLD_MAX_MS = 25_000;
const HOLD_RETRY_MS = 250;

const args = process.argv.slice(2);
const portAt = args.indexOf('--port') + 1;
const port = Number(args[portAt]);
if (!portAt || !Number.isFinite(port)) {
  process.stderr.write('[e2e-server] --port 를 찾지 못했습니다.\n');
  process.exit(1);
}
/** 검사는 `port` 로 옵니다. wrangler 는 그 옆에 둡니다. */
const upstreamPort = port + 1;
args[portAt] = String(upstreamPort);

const log = (message) => process.stderr.write(`[e2e-server] ${message}\n`);

let child = null;
let stopping = false;
let restarts = 0;
let misses = 0;
let bootedAt = 0;
/*
 * 응답이 끊겨 내가 죽인 것인가.
 *
 * 이 표시가 없으면 한 번의 크래시가 재시작 예산을 세 개 먹습니다 — 탐침이
 * 되살리며 SIGKILL 을 보내고, 그 종료를 `exit` 이 다시 죽음으로 세고, 그
 * 과정이 한 번 더 반복됩니다. 실제로 (1/5) (2/5) (3/5) 가 연달아 찍혔습니다.
 */
let replacing = false;

function spawnWrangler() {
  bootedAt = Date.now();
  misses = 0;
  child = spawn('npx', ['wrangler', ...args], { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    if (replacing) {
      replacing = false;
      return; // 내가 죽인 것입니다. 이미 세었습니다.
    }
    revive(signal ? `신호 ${signal}` : `코드 ${code} 로 종료`);
  });
}

function revive(reason) {
  if (stopping) return;
  if (restarts >= MAX_RESTARTS) {
    log(`${reason}. ${MAX_RESTARTS}번 되살렸습니다 — 여기서 멈춥니다.`);
    stopping = true;
    child?.kill('SIGKILL');
    process.exit(1);
  }
  restarts += 1;
  misses = 0; // 다시 뜨기까지 1초, 그 사이 탐침이 또 세지 않도록.
  log(`⚠️ ${reason}. 다시 띄웁니다 (${restarts}/${MAX_RESTARTS}).`);
  try {
    replacing = true;
    child?.kill('SIGKILL');
  } catch {}
  setTimeout(spawnWrangler, 1_000);
}

/** 몸통을 다 받습니다 — 다시 시도하려면 보낼 것이 남아 있어야 합니다. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendOnce(req, body) {
  return new Promise((resolve, reject) => {
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: upstreamPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      resolve,
    );
    upstream.on('error', reject);
    upstream.end(body);
  });
}

const proxy = http.createServer(async (req, res) => {
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400).end();
    return;
  }

  const until = Date.now() + HOLD_MAX_MS;
  for (;;) {
    try {
      const upstream = await sendOnce(req, body);
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
      return;
    } catch (error) {
      // 백엔드가 없는 동안입니다. 거절하지 않고 기다립니다.
      if (Date.now() >= until) {
        log(`⛔ ${req.method} ${req.url} — ${HOLD_MAX_MS / 1000}초를 기다려도 백엔드가 없습니다 (${error.code ?? error.message}).`);
        res.writeHead(502).end();
        return;
      }
      await new Promise((r) => setTimeout(r, HOLD_RETRY_MS));
    }
  }
});

async function probe() {
  if (stopping) return;
  if (Date.now() - bootedAt < BOOT_GRACE_MS) return;

  try {
    const res = await fetch(`http://127.0.0.1:${upstreamPort}/ko/`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // 몸통을 읽어 소켓을 정리합니다 — 안 읽으면 연결이 남습니다.
    await res.arrayBuffer();
    misses = 0;
  } catch {
    misses += 1;
    if (misses >= DEAD_AFTER_MISSES) {
      revive(`${(DEAD_AFTER_MISSES * PROBE_EVERY_MS) / 1000}초째 응답이 없습니다`);
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
    process.exit(0);
  });
}

proxy.listen(port, '127.0.0.1', () => {
  log(`${port} 에서 받아 ${upstreamPort} 로 넘깁니다.`);
  spawnWrangler();
  setInterval(probe, PROBE_EVERY_MS);
});
