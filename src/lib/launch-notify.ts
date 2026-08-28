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

export function mountLaunchNotify(): void {
  const form = document.querySelector<HTMLFormElement>('[data-launch-notify]');
  if (!form) return;

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
        }),
      });
      await drain(res);

      if (res.ok) {
        // 이미 신청된 주소여도 서버는 201 을 줍니다. 화면에서 구분하면 그
        // 주소가 명단에 있는지를 아무에게나 알려 주는 것이 됩니다.
        say(copy.done, 'ok');
        form.querySelector('.notify__row')?.setAttribute('hidden', '');
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
