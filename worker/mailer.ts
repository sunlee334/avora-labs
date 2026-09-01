/**
 * 확인 메일 발송 — Resend.
 *
 * 문구는 `src/lib/email.ts` 가 만듭니다. 여기 있는 것은 **보내는 일** 뿐입니다.
 *
 * ── 왜 SDK 를 쓰지 않는가 ───────────────────────────────────
 * `worker/sentry.ts` 와 같은 이유입니다. 필요한 것이 "메일 한 통을 POST" 하나
 * 뿐인데, 이 워커는 모든 요청의 앞단이라 번들이 커지면 콜드 스타트가 그만큼
 * 늘어납니다. Resend 의 발송 API 는 필드 다섯 개짜리 JSON 한 번입니다.
 *
 * ── 왜 두 겹으로 잠그는가 ───────────────────────────────────
 * `RESEND_API_KEY` 가 있어야 하고, **요청이 운영 호스트로 들어와야** 합니다.
 * 검사는 `wrangler dev` 로 도는데 그것이 운영과 같은 설정 파일을 읽습니다.
 * 키 하나만 보고 갈랐다가 누군가 `.dev.vars` 에 키를 넣으면, E2E 1,900건이
 * 돌 때마다 **실재하지 않는 주소로 수백 통** 이 나갑니다. 반송률이 오르면
 * 도메인 평판이 깎이고, 그때부터는 진짜 손님의 메일이 스팸함으로 갑니다.
 * 호스트는 요청이 들고 오는 값이라 설정을 잊거나 잘못 넣을 수가 없습니다.
 *
 * ── 실패해도 신청은 성공입니다 ──────────────────────────────
 * 손님은 이미 화면에서 "신청되었습니다" 를 봤고, 명단에도 올랐습니다. 메일이
 * 안 나갔다고 그것을 되돌릴 이유가 없습니다. 그래서 `waitUntil` 로 응답 뒤에
 * 붙이고, 실패는 Sentry 로만 남깁니다.
 */
import { launchNotifyEmail, panelApplyEmail } from '../src/lib/email.ts';
import { BUSINESS } from '../src/config/site.ts';
import { EMAIL_DICT } from './generated/email-dict';
import { PRODUCTION_HOST, reportError, type SentryEnv } from './sentry';

const ENDPOINT = 'https://api.resend.com/emails';

/**
 * 사전에 없는 언어로 왔을 때 쓸 언어.
 *
 * `locale` 은 손님이 보내는 값이고 저장할 때 8자로 자르기만 합니다. 목록에
 * 없는 값이 들어와도 메일은 나가야 하므로 `src/config/site.ts` 의
 * `DEFAULT_LOCALE` 과 같은 판단을 따릅니다 — 언어를 모르면 영어입니다.
 */
const FALLBACK: keyof typeof EMAIL_DICT = 'en';

export interface MailerEnv extends SentryEnv {
  /** Resend API 키. `wrangler secret put RESEND_API_KEY` 로만 넣습니다. */
  RESEND_API_KEY?: string;
  /** 보내는 주소. Resend 에서 도메인 인증(SPF·DKIM)을 마친 주소여야 합니다. */
  MAIL_FROM?: string;
}

/** 발송이 켜져 있는가. 둘 중 하나라도 없으면 조용히 건너뜁니다. */
export function mailerConfigured(env: MailerEnv): boolean {
  return Boolean(env.RESEND_API_KEY) && Boolean(env.MAIL_FROM);
}

type Ctx = { waitUntil(p: Promise<unknown>): void };

/**
 * 한 통 보냅니다. **이 함수는 절대 throw 하지 않고, 기다리지도 않습니다.**
 *
 * `Idempotency-Key` 를 붙입니다. 응답을 받기 전에 연결이 끊겨 같은 요청이 다시
 * 들어오는 경우 Resend 가 24시간 안에서 같은 키를 한 번만 처리합니다.
 */
function send(
  env: MailerEnv,
  ctx: Ctx | undefined,
  request: Request,
  mail: { subject: string; text: string },
  to: string,
  idempotencyKey: string,
): void {
  if (!mailerConfigured(env)) return;
  if (new URL(request.url).hostname !== PRODUCTION_HOST) return;

  const task = fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [to],
      subject: mail.subject,
      text: mail.text,
      /*
       * 회신 주소를 반드시 답니다. 검증단 확인 메일이 본문에서 "이 메일에
       * 회신해 주세요" 라고 안내하는데, 이것이 없으면 그 회신이 Resend 의
       * 발송 전용 주소로 가 아무도 읽지 않습니다. 문구가 거짓말이 됩니다.
       */
      reply_to: BUSINESS.email,
    }),
  }).then(
    async (response) => {
      if (response.ok) return;
      // 본문을 읽어 남깁니다 — Resend 는 거절 이유를 평문으로 알려줍니다.
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend ${response.status}: ${detail.slice(0, 300)}`);
    },
  ).catch((cause: unknown) => {
    /*
     * `form` 태그를 쓰지 않습니다. 그 태그에는 "명단이 쌓이지 않고 있다" 는
     * 뜻의 급한 알림이 걸려 있습니다. 메일 발송 실패는 명단은 멀쩡한데
     * 확인만 못 간 상태라, 같은 알림으로 묶으면 급한 쪽이 묻힙니다.
     */
    /*
     * ctx 를 그대로 넘깁니다. `undefined` 를 넘기면 reportError 가 시작한
     * fetch 가 아무 곳에도 매달리지 않고, 바깥 waitUntil 이 먼저 끝나는
     * 순간 **보고가 통째로 취소됩니다** — 메일이 실패했다는 사실 자체를
     * 잃어버립니다. 아직 살아 있는 컨텍스트에는 일을 더 얹을 수 있습니다.
     */
    reportError(env, ctx, cause, request, { tags: { mail: 'confirmation' } });
  });

  if (ctx) ctx.waitUntil(task);
}

/** 사전을 고릅니다. 목록에 없는 언어는 영어로 받습니다. */
function dictFor(locale: string) {
  return EMAIL_DICT[locale as keyof typeof EMAIL_DICT] ?? EMAIL_DICT[FALLBACK];
}

/** 출시 알림 신청 확인. */
export function sendNotifyConfirmation(
  env: MailerEnv,
  ctx: Ctx | undefined,
  request: Request,
  { to, locale, unsubscribeUrl }: { to: string; locale: string; unsubscribeUrl: string },
): void {
  send(env, ctx, request, launchNotifyEmail(dictFor(locale), to, unsubscribeUrl), to, `notify:${to}`);
}

/** 검증단 지원 확인. */
export function sendPanelConfirmation(
  env: MailerEnv,
  ctx: Ctx | undefined,
  request: Request,
  { to, locale }: { to: string; locale: string },
): void {
  send(env, ctx, request, panelApplyEmail(dictFor(locale), to), to, `panel:${to}`);
}
