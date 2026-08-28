import { defineConfig, devices } from '@playwright/test';

/**
 * 이 사이트는 설정에 따라 두 모드로 동작합니다.
 *
 *   launch   (1차) 구매 버튼이 외부몰로 이동. 장바구니·체크아웃 라우트 비활성
 *   commerce (2차) 자사 결제. 장바구니·체크아웃·주문조회 동작
 *
 * 한 모드만 테스트하면 나머지 모드는 아무도 확인하지 않은 채 배포됩니다.
 * 그래서 E2E_MODE 로 빌드와 대상 테스트를 함께 바꾸고, CI 는 둘 다 돌립니다.
 *
 *   npm run test:e2e          commerce 모드
 *   npm run test:e2e:launch   launch 모드
 */
const MODE = (process.env.E2E_MODE ?? 'commerce') as 'commerce' | 'launch';
const PORT = 8787;

const buildEnv =
  MODE === 'commerce'
    ? 'PUBLIC_CHECKOUT_MODE=internal PUBLIC_PRODUCT_PRICE=32000 PUBLIC_ACCOUNTS=on'
    : 'PUBLIC_CHECKOUT_MODE=external';

/** commerce 모드 관리 API 테스트가 쓰는 열쇠. 로컬·CI 안에서만 존재합니다. */
export const ADMIN_DEV_TOKEN = 'e2e-admin-token';

/**
 * 새 주문 알림을 받아 두는 테스트용 서버.
 *
 * 알림이 "나갔다" 를 확인하려면 받는 쪽이 있어야 하는데, 테스트에서 Slack 을
 * 부를 수는 없습니다. Worker 안에 테스트 전용 수신 엔드포인트를 만드는 방법도
 * 있지만, 그러면 그 엔드포인트가 운영에도 함께 배포됩니다.
 */
export const CAPTURE_PORT = 8799;
export const CAPTURE_URL = `http://127.0.0.1:${CAPTURE_PORT}`;

/**
 * commerce 모드에서는 테스트용 결제 어댑터를 켭니다.
 * .dev.vars 는 gitignore 대상이라 CI 에는 없으므로 여기서 명시적으로 넘깁니다.
 * launch 모드에서는 넘기지 않아 "PG 미설정" 경로가 그대로 확인됩니다.
 */
/**
 * 운영 설정을 로컬에서만 되돌리는 값.
 *
 * wrangler.jsonc 에 Cloudflare Access 설정(ACCESS_TEAM_DOMAIN·ACCESS_POLICY_AUD)이
 * 들어 있고 `wrangler dev` 는 그 파일을 그대로 읽습니다. 그런데 Access 는
 * 요청이 Worker 에 닿기 전에 Cloudflare 가 처리하는 것이라 로컬에서는 재현할
 * 수 없습니다.
 *
 * worker/admin.ts 는 **Access 가 설정돼 있으면 개발용 토큰을 아예 읽지 않습니다.**
 * 운영에 개발용 토큰이 섞여 들어와도 통로가 열리지 않게 하려는 의도적인
 * 순서입니다. 그래서 로컬에서는 두 값을 빈 문자열로 덮어 그 문을 되돌립니다.
 *
 * 이 덮어쓰기는 여기에만 있습니다. 운영 배포에는 존재하지 않으며,
 * tests/e2e/commerce/admin.spec.ts 가 wrangler.jsonc 에 두 값이 실제로
 * 들어 있는지 따로 확인합니다.
 */
const accessOff = '--var ACCESS_TEAM_DOMAIN: --var ACCESS_POLICY_AUD:';

/**
 * 로컬 `.dev.vars` 에 들어 있는 실제 로그인 키를 테스트에서 비웁니다.
 *
 * `wrangler dev` 는 .dev.vars 를 읽습니다. 그대로 두면 개발자 기계에 구글
 * 키가 있느냐에 따라 켜지는 제공자 수가 달라지고, **같은 코드가 사람마다
 * 다르게 동작합니다.** 테스트는 mock 하나만 켜진 상태를 봅니다.
 */
const realProvidersOff = '--var GOOGLE_CLIENT_ID: --var GOOGLE_CLIENT_SECRET: --var KAKAO_REST_API_KEY:';

const workerVars =
  MODE === 'commerce'
    // Worker 도 가격을 알아야 합니다 — 이제 서버가 금액을 직접 계산하므로,
    // 프런트의 PUBLIC_PRODUCT_PRICE 와 같은 값을 Worker 에도 넘깁니다.
    // ADMIN_DEV_TOKEN: Cloudflare Access 는 요청이 우리에게 닿기 전에 Cloudflare 가
    // 붙이는 것이라 wrangler dev 로는 재현할 수 없습니다. 관리 API 를 테스트하려면
    // 다른 문이 필요합니다. 운영에서는 절대 설정하지 않으며, 배포 전 점검이
    // wrangler.jsonc 에서 이 이름을 발견하면 배포를 멈춥니다.
    ? `${accessOff} ${realProvidersOff} --var PAYMENT_PROVIDER:mock --var PRODUCT_PRICE:32000` +
      ` --var ADMIN_DEV_TOKEN:${ADMIN_DEV_TOKEN}` +
      ` --var NOTIFY_WEBHOOK_URL:${CAPTURE_URL}/hook --var AUTH_PROVIDER:mock,mock2`
    : `${accessOff} ${realProvidersOff}`;

/** 해당 모드에서만 의미 있는 테스트는 폴더로 갈라 두었습니다. */
const testIgnore =
  MODE === 'commerce' ? ['**/launch/**'] : ['**/commerce/**'];

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI 는 테스트를 샤드로 쪼개 여러 러너에 나눠 돌립니다. 각 샤드는 blob 을
  // 남기고, 실패했을 때만 `merge-reports` 가 하나의 HTML 로 합칩니다.
  //
  // fileName 을 직접 짓는 이유: 기본 이름은 샤드 번호에서만 나오므로
  // commerce 1/3 과 launch 1/2 가 똑같이 `report-1.zip` 이 됩니다. 합칠 때
  // 한 쪽이 다른 쪽을 덮어써 절반이 조용히 사라집니다.
  reporter: process.env.CI
    ? [['github'], ['blob', { fileName: `${MODE}-${process.env.E2E_SHARD ?? '1'}.zip` }]]
    : 'list',

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },

  projects: [
    {
      // 모바일이 기준입니다 — 요구사항 7번의 최우선 원칙.
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],

  webServer: [
    {
      // 매번 해당 모드로 새로 빌드합니다 — 이전 모드의 dist 로 도는 사고를 막습니다.
      // D1 마이그레이션도 함께 돌립니다. CI 는 .wrangler 상태가 비어 있어
      // 이걸 빼면 로컬에서만 통과하는 테스트가 됩니다.
      command: [
        buildEnv,
        'npm run build &&',
        'npx wrangler d1 migrations apply avora-orders --local &&',
        `npx wrangler dev --port ${PORT} --local ${workerVars}`,
      ].join(' '),
      url: `http://127.0.0.1:${PORT}/ko/`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `node tests/support/webhook-capture.mjs`,
      url: `${CAPTURE_URL}/received`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { WEBHOOK_CAPTURE_PORT: String(CAPTURE_PORT) },
    },
  ],
});
