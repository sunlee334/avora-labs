/**
 * 문의 섹션의 동작.
 *
 * 마이페이지와 주문조회가 같은 함수를 부릅니다. Astro 의 `<script>` 는
 * `src/` 모듈을 import 할 수 있어(`Nav.astro` 등이 이미 그렇게 씁니다)
 * 화면마다 복제하지 않아도 됩니다.
 *
 * ── DOM 은 textContent 로만 만듭니다 ────────────────────────
 * 문의 본문과 답변은 사람이 쓴 문자열입니다. innerHTML 로 넣으면
 * `<script>` 가 실행됩니다 — 관리 화면에서 수령인 이름을 그렇게 넣었다가
 * 고친 적이 있어(`worker/reviews-page.ts` 헤더 참조) 여기서는 처음부터
 * 문자열을 조립하지 않습니다.
 */

export interface InquiryView {
  id: string;
  subject: string;
  body: string;
  status: 'open' | 'answered';
  answer: { body: string; at: string | null } | null;
  createdAt: string;
}

export interface InquiryCopy {
  empty: string;
  loading: string;
  sending: string;
  submit: string;
  sent: string;
  answer: string;
  status: { open: string; answered: string };
  error: { tooShort: string; failed: string };
}

/** 주문 경로면 주문번호와 연락처를, 로그인 경로면 아무것도 넘기지 않습니다. */
export type InquiryCredentials = { orderId: string; phone: string } | null;

/**
 * 날짜는 숫자와 하이픈으로만 씁니다.
 *
 * `Intl.DateTimeFormat` 을 쓰면 중국어가 `2026年8月27日` 로 나오는데 그
 * 세 글자는 폰트 서브셋에 없어 그 부분만 다른 서체로 떨어집니다.
 */
function isoDate(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function el<T extends HTMLElement>(root: HTMLElement, selector: string): T | null {
  return root.querySelector<T>(selector);
}

/**
 * 실패한 응답의 본문을 읽어 버립니다.
 *
 * 상태 코드만 보고 빠져나가면 응답 스트림이 열린 채 남습니다. 화면 동작에는
 * 영향이 없지만 브라우저의 네트워크가 조용해지지 않아 `networkidle` 에
 * 도달하지 못하고, 그 상태를 기준으로 재는 도구(Lighthouse 등)의 측정값이
 * 실제보다 늘어납니다. 같은 401 을 본문만 읽고/안 읽고 비교해 확인했습니다.
 */
async function drain(res: Response): Promise<void> {
  try {
    await res.arrayBuffer();
  } catch {
    // 이미 닫혔으면 그것으로 된 것입니다.
  }
}

/** 목록을 그립니다. 요소는 전부 createElement + textContent 로 만듭니다. */
function render(root: HTMLElement, inquiries: InquiryView[], copy: InquiryCopy): void {
  const state = el(root, '[data-inquiry-state]');
  const list = el(root, '[data-inquiry-list]');
  if (!state || !list) return;

  if (inquiries.length === 0) {
    state.textContent = copy.empty;
    state.hidden = false;
    list.hidden = true;
    return;
  }

  const items = inquiries.map((inquiry) => {
    const li = document.createElement('li');
    li.className = 'inquiryList__item';

    const head = document.createElement('div');
    head.className = 'inquiryList__head';

    const subject = document.createElement('span');
    subject.className = 'inquiryList__subject';
    subject.textContent = inquiry.subject;

    const badge = document.createElement('span');
    badge.className = 'inquiryList__badge';
    badge.dataset.status = inquiry.status;
    badge.textContent = copy.status[inquiry.status];

    // append 대신 appendChild — 이 저장소는 Worker 타입도 함께 로드해서
    // append 가 FormData.append 로 해석됩니다.
    head.appendChild(subject);
    head.appendChild(badge);

    const when = document.createElement('time');
    when.className = 'inquiryList__date';
    when.dateTime = isoDate(inquiry.createdAt);
    when.textContent = isoDate(inquiry.createdAt);

    const body = document.createElement('p');
    body.className = 'inquiryList__body';
    body.textContent = inquiry.body;

    li.appendChild(head);
    li.appendChild(when);
    li.appendChild(body);

    if (inquiry.answer) {
      const answer = document.createElement('div');
      answer.className = 'inquiryList__answer';

      const label = document.createElement('p');
      label.className = 'inquiryList__answerLabel';
      label.textContent = copy.answer;

      const text = document.createElement('p');
      text.textContent = inquiry.answer.body;

      answer.appendChild(label);
      answer.appendChild(text);
      li.appendChild(answer);
    }

    return li;
  });

  list.replaceChildren(...items);
  list.hidden = false;
  state.hidden = true;
}

async function load(
  root: HTMLElement,
  credentials: InquiryCredentials,
  copy: InquiryCopy,
): Promise<void> {
  const state = el(root, '[data-inquiry-state]');
  if (state) {
    state.textContent = copy.loading;
    state.hidden = false;
  }

  try {
    const res = credentials
      ? await fetch('/api/inquiries/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        })
      : await fetch('/api/inquiries');

    if (!res.ok) {
      // 로그인이 풀렸거나 기능이 꺼진 경우입니다. 목록을 비우고 폼만 둡니다 —
      // 오류 문구로 화면을 채우면 남길 수 있다는 사실이 가려집니다.
      await drain(res);
      render(root, [], copy);
      return;
    }
    const data = (await res.json()) as { inquiries?: InquiryView[] };
    render(root, data.inquiries ?? [], copy);
  } catch {
    render(root, [], copy);
  }
}

/**
 * 문의 섹션을 살립니다.
 *
 * `credentials` 가 함수인 이유: 주문조회는 **조회에 성공한 뒤에야** 주문번호를
 * 압니다. 값을 미리 받으면 그 시점에 아직 없습니다.
 */
export function mountInquiry(
  root: HTMLElement,
  copy: InquiryCopy,
  credentials: () => InquiryCredentials,
): void {
  const form = el<HTMLFormElement>(root, '[data-inquiry-form]');
  const error = el(root, '[data-inquiry-error]');
  const submit = el<HTMLButtonElement>(root, '[data-inquiry-submit]');
  if (!form || !submit) return;

  const showError = (message: string | null) => {
    if (!error) return;
    error.textContent = message ?? '';
    error.hidden = !message;
  };

  void load(root, credentials(), copy);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError(null);

    const data = new FormData(form);
    const subject = String(data.get('subject') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();
    if (!subject || body.length < 10) {
      showError(copy.error.tooShort);
      return;
    }

    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = copy.sending;

    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body,
          locale: document.documentElement.lang.split('-')[0],
          ...(credentials() ?? {}),
        }),
      });

      if (!res.ok) {
        await drain(res);
        showError(copy.error.failed);
        return;
      }

      form.reset();
      // 방금 남긴 것이 목록 맨 위에 보여야 "받았다" 가 사실이 됩니다.
      await load(root, credentials(), copy);
    } catch {
      showError(copy.error.failed);
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });
}
