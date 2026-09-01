import * as Sentry from '@sentry/astro';

/**
 * 브라우저에서 터진 것을 Sentry 로 보냅니다.
 *
 * ── 무엇을 켜고 무엇을 껐는가 ───────────────────────────────
 * **에러만 켰습니다.** 세션 리플레이와 트레이싱은 껐습니다.
 *
 *   리플레이  화면과 입력을 녹화해 되돌려 봅니다. 도움이 되지만 번들이 50KB
 *             넘게 늘고, 무엇보다 **손님의 화면을 수집** 하는 것이라 지금
 *             공개된 개인정보처리방침에 그 항목이 없습니다. 방침을 고치기
 *             전에 켜면 안 됩니다.
 *   트레이싱  요청마다 성능 구간을 재서 보냅니다. 여기는 정적 사이트라
 *             얻을 것이 적고, 이벤트 수가 무료 한도를 빨리 씁니다.
 *
 * 둘 다 나중에 켤 수 있습니다. 지금 필요한 것은 "무엇이 깨졌는지 안다" 이고,
 * 그건 에러만으로 됩니다.
 *
 * ── 왜 운영에서만 보내는가 ──────────────────────────────────
 * E2E 검사가 806 건이고 한 건이 화면을 여러 번 엽니다. 개발과 검사에서
 * 켜 두면 무료 한도가 하루도 못 갑니다. 진짜 장애가 났을 때 정작 이벤트가
 * 안 들어오는 상태가 됩니다.
 */
const DSN = 'https://4cad7b354a2d66d13cacd6c496489185@o4512008388935680.ingest.us.sentry.io/4512008410562560';

const isProduction =
  typeof location !== 'undefined' && location.hostname === 'avoralabs.co';

Sentry.init({
  dsn: isProduction ? DSN : '',
  enabled: isProduction,
  environment: 'production',

  // 켜지 않은 것들. 위 주석 참조.
  integrations: [],
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  /*
   * 개인정보는 보내지 않습니다.
   *
   * 기본값이 이미 IP 와 쿠키를 빼지만, 이 사이트는 폼에 이메일 주소를 받고
   * 주소를 쿼리에 싣는 경로가 있습니다(해지 링크의 `?t=`). 기본값에 기대지
   * 않고 명시합니다.
   */
  sendDefaultPii: false,

  beforeSend(event) {
    /*
     * 주소에서 쿼리를 지웁니다.
     *
     * `?t=` 에 해지 토큰이, 리다이렉트 파라미터에 돌아갈 경로가 실립니다.
     * 어디서 터졌는지는 경로만으로 알 수 있고, 나머지는 남길 이유가 없습니다.
     */
    if (event.request?.url) {
      try {
        const u = new URL(event.request.url);
        event.request.url = u.origin + u.pathname;
      } catch {
        // 주소를 못 읽으면 통째로 버립니다 — 반쯤 지운 것을 남기지 않습니다.
        delete event.request.url;
      }
    }
    if (event.request) delete event.request.query_string;
    return event;
  },

  /*
   * 우리 코드가 아닌 것.
   *
   * 브라우저 확장과 광고 차단기가 던지는 예외가 실제 장애를 덮습니다. 이
   * 목록이 없으면 알림 대부분이 우리가 고칠 수 없는 것으로 채워집니다.
   */
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    /^Non-Error promise rejection captured/,
  ],
  denyUrls: [/extensions\//i, /^chrome:\/\//i, /^chrome-extension:\/\//i, /^moz-extension:\/\//i],
});
