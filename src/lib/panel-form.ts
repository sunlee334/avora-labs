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
      locale: el.dataset.locale,
    };

    /*
     * 브라우저 기본 검증은 껐습니다(novalidate). 언어마다 다른 브라우저 문구
     * 대신 우리 문구를 우리 자리에 보여주기 위해서입니다. 대신 여기서 빈 칸을
     * 먼저 잡아, 서버에 다녀오지 않고도 어디가 문제인지 알려 줍니다.
     */
    const missing = (['name', 'email', 'activity', 'frequency', 'region'] as const).filter(
      (k) => !payload[k],
    );
    if (!payload.consent) {
      // 동의는 칸 아래가 아니라 그 줄에서 말해야 합니다.
      say(copy.consent ?? copy.invalid ?? '', 'bad');
    }
    if (missing.length || !payload.consent) {
      for (const k of missing) markField(k, copy.required ?? '');
      if (missing.length) say(copy.invalid ?? '', 'bad');
      el.querySelector<HTMLElement>(`[name="${missing[0] ?? 'consent'}"]`)?.focus();
      return;
    }

    // 로딩은 라벨 교체로 알립니다 — 스크린리더는 도는 그림을 읽지 못합니다.
    const label = submit.textContent;
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
        say(copy.done ?? '', 'ok');
        el.querySelectorAll<HTMLElement>('.field, fieldset, .agree, button[type="submit"]')
          .forEach((el) => el.setAttribute('hidden', ''));
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
      submit.removeAttribute('aria-busy');
      submit.textContent = label ?? '';
    }
  });
}
