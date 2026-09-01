/*
 * 확장자를 붙입니다.
 *
 * 이 파일은 `scripts/email-preview.mjs` 가 Node 로 직접 부릅니다. Node 의 ESM
 * 해석기는 확장자를 생략한 경로를 찾지 못합니다(번들러만 해 주는 일입니다).
 * `scripts/check-slugs.mjs` 가 `reserved-paths.ts` 를 부를 때와 같은 사정입니다.
 */
import { BUSINESS, ORIGIN } from '../config/site.ts';

/**
 * 확인 메일 본문을 만듭니다.
 *
 * ── 이 메일은 광고가 아닙니다 ───────────────────────────────
 * 신청이라는 거래 관계에서 나오는 **정보성 메시지** 입니다. 그래서 `(광고)`
 * 표기를 넣지 않고 야간 전송 제한도 받지 않습니다.
 *
 * 대신 **광고성 내용을 한 줄이라도 섞으면 그 순간 광고성 메시지가 됩니다.**
 * 할인·프로모션·구매 유도 문구를 넣지 마세요. 넣으면 표기 의무와 야간 제한이
 * 함께 따라오고, 그 상태로 보내면 위반입니다.
 * (`tests/e2e/email-copy.spec.ts` 가 이것을 지킵니다.)
 *
 * ── 날짜를 문구에 적지 않는 이유 ────────────────────────────
 * 지시서 초안은 "2026년 12월 예정" 처럼 본문에 박아 두었습니다. 그러면 화면의
 * 타임라인과 메일이 각자 날짜를 갖게 되고, 일정이 밀렸을 때 한쪽만 고치면
 * 손님이 서로 다른 두 날짜를 봅니다.
 *
 * 여기서는 `home.timeline` 에서 가져다 끼웁니다. 고칠 곳이 한 곳입니다.
 *
 * ── 아직 보내지 않습니다 ────────────────────────────────────
 * 실제 발송은 F2-1(발송 서비스 선택 + SPF·DKIM·DMARC)이 정해져야 합니다.
 * 인증 없이 보내면 확인 메일 자체가 스팸함으로 갑니다. 지금 여기 있는 것은
 * **무엇을 보낼지** 이고, 그것은 지금 확정해 둘 수 있습니다.
 *
 * ── 사전을 import 하지 않고 인자로 받습니다 ─────────────────
 * 이 파일이 `src/i18n` 을 직접 부르면 5개 언어 JSON 325KB 가 함께 딸려옵니다.
 * 그러면 발송을 붙일 워커 번들이 그만큼 커지고, 미리보기 스크립트도 Astro 의
 * 번들러 없이는 돌지 않습니다. 필요한 것은 문구 몇 줄이므로 부르는 쪽이
 * 넘겨줍니다.
 */

/** 이 렌더러가 실제로 읽는 부분만. 사전 전체를 요구하지 않습니다. */
export interface EmailDict {
  email: {
    notify: { subject: string; body: string; unsubscribe: string };
    panel: { subject: string; body: string };
  };
  home: { timeline: { steps: readonly { when: string; what: string }[] } };
}

export interface RenderedEmail {
  subject: string;
  /** 본문. 평문입니다 — HTML 메일은 발송 서비스가 정해진 뒤에 만듭니다. */
  text: string;
}

/**
 * 알림 신청 확인.
 *
 * 소식 세 가지는 타임라인의 뒤쪽 셋입니다 — 집계 공개·펀딩·출시. 앞의 둘
 * (모집 시작·블라인드 평가)은 검증단이 겪는 일이지 신청자에게 보낼 소식이
 * 아닙니다.
 */
export function launchNotifyEmail(
  t: EmailDict,
  to: string,
  unsubscribeUrl: string,
): RenderedEmail {
  const e = t.email.notify;

  const list = t.home.timeline.steps
    .slice(-3)
    .map((s) => `  ${s.what} — ${s.when}`)
    .join('\n');

  return {
    subject: e.subject,
    text: [
      e.body.replace('{email}', to).replace('{list}', list),
      '',
      e.unsubscribe,
      unsubscribeUrl,
      '',
      signature(),
    ].join('\n'),
  };
}

/**
 * 검증단 지원 확인.
 *
 * 해지 링크가 없습니다. 이 메일은 광고성 수신 동의와 무관한 지원 접수
 * 확인이고, 답장으로 취소할 수 있다고 본문이 안내합니다. 해지 링크를 넣으면
 * "해지하면 지원도 취소되나" 라는 질문을 만듭니다.
 */
export function panelApplyEmail(t: EmailDict, to: string): RenderedEmail {
  const e = t.email.panel;

  return {
    subject: e.subject,
    text: [e.body.replace('{email}', to), '', signature()].join('\n'),
  };
}

/**
 * 서명.
 *
 * 상호와 연락처는 `site.ts` 한 곳에서 옵니다. 메일에 적어 두면 사업자 정보가
 * 바뀔 때 화면만 고치고 메일을 잊습니다.
 */
function signature(): string {
  return [BUSINESS.legalName, BUSINESS.email, ORIGIN].join('\n');
}
