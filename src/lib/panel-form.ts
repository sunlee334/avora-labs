/**
 * 검증단 지원 폼.
 *
 * ── 왜 알림 폼과 다른 파일인가 ──────────────────────────────
 * 알림 폼은 칸이 하나입니다. 이쪽은 다섯이고, **어느 칸이 잘못됐는지 각각
 * 알려 줘야** 합니다. 하나로 합치면 두 폼의 분기가 얽혀 어느 쪽도 읽기
 * 어려워집니다.
 */

declare global {
  interface Window {
    gtag?: (command: string, action: string, params?: Record<string, unknown>) => void;
  }
}

/** 서버가 돌려주는 필드 이름 → 화면의 입력 요소 id */
const FIELD_IDS: Record<string, string> = {
  name: 'name',
  email: 'email',
  activity: 'activity',
  frequency: 'frequency',
  region: 'region',
};

function copyFrom(form: HTMLFormElement) {
  // 문구는 화면이 이미 갖고 있습니다. 여기 다시 적으면 5개 언어가 어긋납니다.
  const state = form.querySelector<HTMLElement>('[data-panel-state]')!;
  return { state };
}

/* 화면이 뜬 시각. worker/spam.ts 의 2초 문턱에 쓰입니다. */
const shownAt = Date.now();

/**
 * 지금까지 걸린 시간.
 *
 * 폼의 `data-elapsed-offset`(밀리초)을 더합니다. **검사가 문턱을 넘기려고
 * 쓰는 통로입니다** — 검사는 폼을 1초 만에 채우므로 그대로 두면 봇으로
 * 판정되어 지원서가 버려지는데, 화면에는 "접수되었습니다" 가 떠서 아무도
 * 눈치채지 못합니다. 실제로 그 상태로 통과하던 검사가 있었습니다.
 *
 * 운영 화면에는 이 속성이 없으므로 0 입니다.
 */
function elapsed(form: HTMLFormElement): number {
  return Date.now() - shownAt + Number(form.dataset.elapsedOffset ?? 0);
}

export function mountPanelForm(): void {
  const form = document.querySelector<HTMLFormElement>('[data-panel-form]');
  if (!form) return;

  const el = form;
  const { state } = copyFrom(el);
  const submit = el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const copy = JSON.parse(el.dataset.copy ?? '{}') as Record<string, string>;

  /** 칸 아래 오류를 켜고 끕니다. 색만이 아니라 글로 말합니다. */
  function markField(this: void, name: string, message: string | null) {
    const id = FIELD_IDS[name];
    if (!id) return;
    const input = el.querySelector<HTMLElement>(`[name="${name}"]`);
    const box = document.getElementById(`${id}-error`);
    if (box) {
      box.textContent = message ?? '';
      box.hidden = !message;
    }
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function clearAll() {
    for (const name of Object.keys(FIELD_IDS)) markField(name, null);
    state.hidden = true;
  }

  function say(message: string, kind: 'ok' | 'bad') {
    state.textContent = message;
    state.dataset.kind = kind;
    state.hidden = false;
  }

  el.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAll();

    const data = new FormData(el);
    const payload = {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      activity: data.get('activity'),
      frequency: data.get('frequency'),
      region: data.get('region'),
      consent: data.get('consent') === 'on',
      marketing: data.get('marketing') === 'on',
      night: data.get('night') === 'on',
      locale: el.dataset.locale,
      // 봇 판별용 — 화면에 없는 칸과 화면이 뜬 시각(worker/spam.ts).
      website: String(data.get('website') ?? ''),
      elapsedMs: elapsed(el),
    };

    /*
     * 브라우저 기본 검증은 껐습니다(novalidate). 언어마다 다른 브라우저 문구
     * 대신 우리 문구를 우리 자리에 보여주기 위해서입니다. 대신 여기서 빈 칸을
     * 먼저 잡아, 서버에 다녀오지 않고도 어디가 문제인지 알려 줍니다.
     */
    const missing = (['name', 'email', 'activity', 'frequency', 'region'] as const).filter(
      (k) => !payload[k],
    );
    if (missing.length || !payload.consent) {
      for (const k of missing) markField(k, copy.required ?? '');
      /*
       * 무엇이 문제인지에 맞는 말을 합니다.
       *
       * 동의만 빠졌을 때 "비어 있거나 형식이 맞지 않는 칸이 있습니다" 라고
       * 하면 지원자는 없는 빈 칸을 찾아 헤맵니다. 실제로 그랬습니다.
       */
      say(missing.length ? (copy.invalid ?? '') : (copy.consentRequired ?? ''), 'bad');
      el.querySelector<HTMLElement>(`[name="${missing[0] ?? 'consent'}"]`)?.focus();
      return;
    }

    // 로딩은 라벨 교체로 알립니다 — 스크린리더는 도는 그림을 읽지 못합니다.
    const label = submit.textContent;
    /*
     * 제출 중에는 버튼을 잠급니다.
     *
     * 느린 회선에서 두 번 누르면 같은 지원서가 두 요청으로 동시에 들어갑니다.
     * 저장 쪽은 ON CONFLICT 로 안전하지만, 두 번째 응답이 첫 번째의 성공
     * 화면을 오류 문구로 덮어 쓸 수 있습니다. 저장소의 다른 폼들도 같은
     * 방식입니다(inquiry.ts · launch-notify.ts · my-reviews.ts).
     */
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    submit.textContent = submit.dataset.loadingLabel ?? label;

    try {
      const res = await fetch('/api/panel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        /*
         * 전환은 **응답을 받은 뒤** 입니다. 클릭 시점에 심으면 형식 오류와
         * 네트워크 실패까지 지원으로 잡힙니다. 이름·이메일·지역 상세는 보내지
         * 않습니다 — GA4 약관 위반이고, 지역은 시·도까지만으로 충분합니다.
         */
        window.gtag?.('event', 'panel_apply', {
          activity: payload.activity,
          frequency: payload.frequency,
          region: payload.region,
          lang: payload.locale,
        });
        /*
         * 순서가 중요합니다.
         *
         * 폼을 먼저 감추면 위 내용이 1,000px 넘게 사라지면서 확인 문구가
         * 뷰포트 **위로** 밀려납니다. 스크롤 위치는 그대로라 지원자가 실제로
         * 보는 것은 푸터입니다 — 접수됐는지 알 수 없습니다. 두 엔진 모두에서
         * 실측된 문제입니다.
         *
         * 게다가 포커스가 있던 제출 버튼이 사라지면 포커스가 <body> 로
         * 떨어져 키보드·스크린리더 사용자는 맥락을 통째로 잃습니다.
         */
        el.querySelectorAll<HTMLElement>('.field, fieldset, .agree, button[type="submit"]')
          .forEach((node) => node.setAttribute('hidden', ''));
        say(copy.done ?? '', 'ok');
        state.setAttribute('tabindex', '-1');
        state.focus();
        state.scrollIntoView({ block: 'center' });
        return;
      }

      const body = (await res.json().catch(() => ({}))) as { error?: string; fields?: string[] };
      if (body.error === 'INVALID_FIELDS' && Array.isArray(body.fields)) {
        for (const name of body.fields) markField(name, copy.required ?? '');
        say(copy.invalid ?? '', 'bad');
        return;
      }
      say(copy.error ?? '', 'bad');
    } catch {
      say(copy.error ?? '', 'bad');
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
      submit.textContent = label ?? '';
    }
  });
}
