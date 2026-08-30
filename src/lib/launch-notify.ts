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
 * 홈은 첫 화면과 스토리 끝, 두 자리에 같은 폼을 둡니다. querySelector 로
 * 하나만 잡으면 두 번째 폼은 **눌러도 아무 일이 없는 폼** 이 됩니다 —
 * 화면에는 멀쩡히 보이므로 아무도 알아채지 못합니다.
 */
declare global {
  interface Window {
    /** Google Analytics 4 가 심는 전역. 계측이 꺼진 환경에서는 없습니다. */
    gtag?: (command: string, action: string, params?: Record<string, unknown>) => void;
  }
}


export function mountLaunchNotify(): void {
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
        say(res.status === 400 ? copy.invalid : copy.error, 'bad');
      }
    } catch {
      say(copy.error, 'bad');
    } finally {
      submit.disabled = false;
      submit.textContent = label ?? copy.submit;
    }
  });
}
