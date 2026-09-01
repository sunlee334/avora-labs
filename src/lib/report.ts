import * as Sentry from '@sentry/astro';

/**
 * 화면에서 일어난 일 중 **우리가 이름을 붙여 두고 싶은 것** 을 보냅니다.
 *
 * 저절로 잡히는 것(터진 예외, 처리되지 않은 거절)은 SDK 가 알아서 보냅니다.
 * 여기 있는 것은 예외가 아닌 실패입니다 — 서버가 500 을 주거나, 요청이
 * 네트워크에서 끊기거나 하는 것들. 그런 것은 `catch` 안에서 조용히 처리되고
 * 끝나므로, 명시적으로 부르지 않으면 아무 데도 남지 않습니다.
 *
 * ── 왜 폼 실패를 따로 세는가 ────────────────────────────────
 * 지시서 H1-2 의 문장 그대로입니다 — "폼 제출 실패는 반드시 별도 이벤트로
 * 잡을 것. 일반 JS 에러에 묻히면 의미가 없다."
 *
 * 지금 이 사이트가 하는 일은 사실상 하나입니다: 출시 알림 명단을 모으는 것.
 * 그 폼이 조용히 실패하고 있으면 나머지가 다 멀쩡해도 소용이 없습니다.
 * 그래서 일반 예외와 섞이지 않게 태그를 답니다 — Sentry 에서 이 태그 하나로
 * 알림을 따로 걸 수 있습니다.
 */

type FormKind = 'launch-notify' | 'panel-apply' | 'inquiry';

export function reportFormFailure(
  form: FormKind,
  detail: { status?: number; source?: string; locale?: string },
): void {
  /*
   * 이메일 주소는 넘기지 않습니다.
   *
   * 실패한 신청을 나중에 되살리려면 주소가 있어야 하지 않냐는 생각이 들지만,
   * 그건 Sentry 가 할 일이 아닙니다. 여기 쌓이는 것은 "몇 번, 어디서, 어떤
   * 응답으로" 이고, 그것으로 고칠 수 있습니다.
   */
  Sentry.captureMessage(`form failed: ${form}`, {
    level: 'error',
    tags: {
      form,
      // 문자열로 둡니다 — Sentry 의 태그 값은 문자열이고, 숫자를 넣으면
      // 필터에서 `status:500` 이 안 걸립니다.
      status: String(detail.status ?? 'network'),
      ...(detail.source ? { source: detail.source } : {}),
      ...(detail.locale ? { locale: detail.locale } : {}),
    },
  });
}
