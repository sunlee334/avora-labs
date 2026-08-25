/**
 * 테스트용 웹훅 수신 서버.
 *
 * 알림이 "나갔다" 를 확인하려면 받는 쪽이 있어야 합니다. Slack 을 부를 수는
 * 없으니 여기서 받아 두고, 테스트가 무엇이 왔는지 꺼내 봅니다.
 *
 * 이건 테스트 장치라 Worker 안에 들어가지 않습니다. 운영 코드에 "테스트일
 * 때만 도는 엔드포인트" 를 만들면, 그 엔드포인트가 운영에도 함께 배포됩니다.
 *
 *   POST   /hook        알림 수신 (Slack·Discord 웹훅 자리)
 *   POST   /hook/fail   항상 500 — 알림이 실패해도 주문이 멀쩡한지 보기 위한 것
 *   GET    /received    지금까지 받은 것 전부
 *   DELETE /received    비우기
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.WEBHOOK_CAPTURE_PORT ?? 8799);

/** @type {Array<{path: string, body: unknown, at: string}>} */
const received = [];

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (req.method === 'POST' && url.pathname.startsWith('/hook')) {
    const body = await readBody(req);
    received.push({ path: url.pathname, body, at: new Date().toISOString() });

    // 실패 경로: 알림이 실패해도 결제 완료가 흔들리지 않는지 확인하는 데 씁니다.
    if (url.pathname === '/hook/fail') return json(500, { error: 'nope' });
    return json(200, { ok: true });
  }

  if (url.pathname === '/received') {
    if (req.method === 'DELETE') {
      received.length = 0;
      return json(200, { ok: true });
    }
    return json(200, { received });
  }

  json(404, { error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`webhook capture ready on http://127.0.0.1:${PORT}`);
});
