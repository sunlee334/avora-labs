/**
 * 출시 알림 신청 — 브라우저 쪽 동작.
 *
 * 마크업은 `src/components/LaunchNotify.astro`, 저장은
 * `worker/launch-notify.ts` 입니다.
 */

interface Copy {
  sending: string;
  done: string;
  invalid: string;
  error: string;
  /** 두 번 연속 실패했을 때 덧붙이는 안내. 연락처가 이미 채워져 옵니다. */
  fallback: string;
  /** 지금까지 몇 명이 기다리는지. `{n}` 자리에 숫자가 들어갑니다. */
  waiting: string;
  submit: string;
}

/**
 * 안 쓸 응답 본문도 닫습니다.
 *
 * `src/lib/inquiry.ts` 의 drain 과 같은 이유입니다 — 읽지 않은 본문은 연결을
 * 붙잡고 있고, Playwright 의 networkidle 이 영원히 오지 않습니다.
 */
async function drain(res: Response): Promise<void> {
  try {
    await res.arrayBuffer();
  } catch {
    /* 이미 소비됐거나 연결이 끊겼거나 */
  }
}

/**
 * 화면에 폼이 여러 개일 수 있습니다.
 *
 * 홈은 첫 화면과 검증단 섹션, 두 자리에 같은 폼을 둡니다. querySelector 로
 * 하나만 잡으면 두 번째 폼은 **눌러도 아무 일이 없는 폼** 이 됩니다 —
 * 화면에는 멀쩡히 보이므로 아무도 알아채지 못합니다.
 */
declare global {
  interface Window {
    /** Google Analytics 4 가 심는 전역. 계측이 꺼진 환경에서는 없습니다. */
    gtag?: (command: string, action: string, params?: Record<string, unknown>) => void;
  }
}


/*
 * 이 스크립트가 실행된 시각.
 *
 * 모듈이 한 번만 평가되므로 폼 여럿이 같은 값을 공유합니다 — 화면이 뜬
 * 시각이라는 뜻이고, 그게 우리가 재려는 것입니다.
 */
const shownAt = Date.now();

/**
 * 지금까지 몇 명이 기다리는가.
 *
 * 서버가 임계값 미만이면 `null` 을 줍니다. 그때는 아무것도 그리지 않습니다 —
 * 숫자가 적을 때 보여주면 "아무도 관심이 없다" 로 읽힙니다.
 *
 * 실패하면 조용히 넘어갑니다. 이 줄이 없다고 신청을 못 하는 것은 아니고,
 * 오류 문구를 띄우면 폼이 고장 난 것처럼 보입니다.
 */
async function showWaiting(): Promise<void> {
  const slots = document.querySelectorAll<HTMLElement>('[data-notify-count]');
  if (slots.length === 0) return;

  let count: number | null = null;
  try {
    const res = await fetch('/api/launch-notify/count');
    if (!res.ok) return;
    ({ count } = (await res.json()) as { count: number | null });
  } catch {
    return;
  }
  if (count == null) return;

  for (const slot of slots) {
    const form = slot.closest<HTMLFormElement>('[data-launch-notify]');
    const copy = JSON.parse(form?.dataset.copy ?? '{}') as Partial<Copy>;
    if (!copy.waiting) continue;
    // 자릿수가 큰 숫자는 언어권 관습대로 끊어 읽는 편이 낫습니다.
    slot.textContent = copy.waiting.replace('{n}', count.toLocaleString(form?.dataset.locale));
    slot.hidden = false;
  }
}

export function mountLaunchNotify(): void {
  // 첫 화면을 그리는 데 필요한 값이 아니므로 기다리지 않습니다.
  void showWaiting();

  for (const form of document.querySelectorAll<HTMLFormElement>('[data-launch-notify]')) {
    mountOne(form);
  }
}

function mountOne(form: HTMLFormElement): void {

  const copy = JSON.parse(form.dataset.copy ?? '{}') as Copy;
  const input = form.querySelector<HTMLInputElement>('input[name="email"]');
  const submit = form.querySelector<HTMLButtonElement>('[data-notify-submit]');
  const state = form.querySelector<HTMLElement>('[data-notify-state]');
  if (!input || !submit || !state) return;

  function say(message: string, tone: 'ok' | 'bad'): void {
    state!.textContent = message;
    state!.dataset.tone = tone;
    state!.hidden = false;
  }

  /*
   * 연속 실패를 셉니다.
   *
   * 한 번 실패는 흔합니다 — 지하철에서 신호가 끊기는 것 같은 일입니다. 그때
   * 바로 "메일로 보내세요" 를 띄우면 사이트가 고장 난 것처럼 보입니다.
   * **두 번째부터** 사람이 개입할 길을 함께 보여줍니다.
   */
  let failures = 0;

  function fail(message: string) {
    failures += 1;
    const extra = failures >= 2 && copy.fallback ? ` ${copy.fallback}` : '';
    say(message + extra, 'bad');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    // 브라우저 기본 검증은 novalidate 로 껐습니다. 언어마다 다른 브라우저
    // 문구 대신 우리 문구를 우리 자리에 보여주기 위해서입니다.
    if (!input.checkValidity() || input.value.trim() === '') {
      say(copy.invalid, 'bad');
      input.focus();
      return;
    }

    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = copy.sending;
    state.hidden = true;

    try {
      const res = await fetch('/api/launch-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: input.value.trim(),
          /*
           * 화면이 뜬 시각. 제출까지 2초가 안 걸렸으면 워커가 봇으로 봅니다.
           * 값을 못 읽는 상황에서는 통과시키므로, 여기서 실패해도 사람을
           * 막지 않습니다(worker/spam.ts).
           */
          elapsedMs: Date.now() - shownAt,
          // 야간 수신은 별도 동의입니다(정보통신망법 제50조 3항).
          night: form.querySelector<HTMLInputElement>('input[name="night"]')?.checked === true,
          website: (form.querySelector<HTMLInputElement>('input[name="website"]')?.value ?? ''),
          locale: form.dataset.locale,
          source: form.dataset.source,
          // 선택 항목입니다. 아무것도 안 고르면 빈 배열이 가고, 서버는
          // 그것을 null 로 저장합니다 — 신청 자체는 그대로 성사됩니다.
          activities: [...form.querySelectorAll<HTMLInputElement>(
            'input[name="activities"]:checked',
          )].map((el) => el.value),
        }),
      });
      await drain(res);

      if (res.ok) {
        /*
         * 전환 기록은 **응답을 받은 뒤** 입니다.
         *
         * 클릭 시점에 심으면 형식 오류와 네트워크 실패까지 전환으로 잡힙니다.
         * 12월에 명단 800명을 기준으로 판단을 다시 하기로 했는데, 그 수치가
         * 부풀면 판단이 틀어집니다.
         *
         * 이메일은 보내지 않습니다 — GA4 약관 위반이고, 애초에 알 필요가
         * 없는 값입니다. 어느 자리에서 몇 명이 신청했는지만 남깁니다.
         */
        window.gtag?.('event', 'notify_signup', {
          form_location: form.dataset.source,
          lang: form.dataset.locale,
        });

        // 이미 신청된 주소여도 서버는 201 을 줍니다. 화면에서 구분하면 그
        // 주소가 명단에 있는지를 아무에게나 알려 주는 것이 됩니다.
        say(copy.done, 'ok');
        form.querySelector('.notify__row')?.setAttribute('hidden', '');
        // 입력칸을 감췄으면 활동 선택도 함께 감춥니다 — 한쪽만 남으면
        // 아직 뭔가 더 해야 하는 화면처럼 보입니다.
        form.querySelector('.notify__acts')?.setAttribute('hidden', '');
      } else {
        fail(res.status === 400 ? copy.invalid : copy.error);
      }
    } catch {
      fail(copy.error);
    } finally {
      submit.disabled = false;
      submit.textContent = label ?? copy.submit;
    }
  });
}
