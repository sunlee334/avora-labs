/**
 * 내 후기 섹션의 동작.
 *
 * ── DOM 은 textContent 로만 만듭니다 ────────────────────────
 * 후기 본문은 사람이 쓴 문자열입니다. innerHTML 로 넣으면 `<script>` 가
 * 실행됩니다 — 이 저장소는 그 실수를 한 번 했고(`worker/reviews-page.ts`
 * 헤더 참조) 그 뒤로 문자열을 조립하지 않습니다.
 */

export interface MyReview {
  id: string;
  orderId: string;
  rating: number;
  body: string;
  sponsored: boolean;
  status: 'visible' | 'hidden' | 'removed';
  createdAt: string;
}

export interface PendingOrder {
  orderId: string;
  createdAt: string;
  items: Array<{ name?: string; qty?: number }>;
}

export interface MyReviewsCopy {
  loading: string;
  empty: string;
  pendingHeading: string;
  write: string;
  status: { visible: string; hidden: string };
  error: string;
  outOf: string;
  edit: string;
  remove: string;
  save: string;
  cancel: string;
  saving: string;
  confirmRemove: string;
  moderated: string;
  ratingLabel: string;
  bodyLabel: string;
}

/**
 * 날짜는 숫자와 하이픈으로만 씁니다.
 *
 * `Intl.DateTimeFormat` 을 쓰면 중국어가 `2026年8月27日` 로 나오는데 그
 * 세 글자는 폰트 서브셋에 없어 그 부분만 다른 서체로 떨어집니다.
 */
function isoDate(value: string): string {
  return value.slice(0, 10);
}

function el<T extends HTMLElement>(root: HTMLElement, selector: string): T | null {
  return root.querySelector<T>(selector);
}

/** 안 쓸 응답 본문도 닫습니다 — `src/lib/inquiry.ts` 의 drain 과 같은 이유입니다. */
async function drain(res: Response): Promise<void> {
  try {
    await res.arrayBuffer();
  } catch {
    // 이미 닫혔으면 그것으로 된 것입니다.
  }
}

/** 별점을 글자로. 스크린리더에는 숫자로 따로 읽힙니다. */
function stars(rating: number, copy: MyReviewsCopy): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'myReviews__stars';

  const visual = document.createElement('span');
  visual.setAttribute('aria-hidden', 'true');
  visual.textContent = '★'.repeat(rating) + '☆'.repeat(5 - rating);

  // "★★★★☆" 는 스크린리더에서 "검은 별 검은 별…" 로 읽힙니다.
  const spoken = document.createElement('span');
  spoken.className = 'sr-only';
  spoken.textContent = `${rating} / 5 ${copy.outOf}`;

  wrap.appendChild(visual);
  wrap.appendChild(spoken);
  return wrap;
}

function reviewItem(review: MyReview, copy: MyReviewsCopy): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'myReviews__item';

  const head = document.createElement('div');
  head.className = 'myReviews__head';
  head.appendChild(stars(review.rating, copy));

  const when = document.createElement('time');
  when.className = 'myReviews__date';
  when.dateTime = isoDate(review.createdAt);
  when.textContent = isoDate(review.createdAt);
  head.appendChild(when);

  // 숨겨진 후기는 본인에게 그 사실을 알립니다. 이유는 내보내지 않습니다 —
  // 운영자가 기록용으로 쓰는 문장이지 손님에게 보이라고 쓴 것이 아닙니다.
  if (review.status === 'hidden') {
    const badge = document.createElement('span');
    badge.className = 'myReviews__badge';
    badge.dataset.status = 'hidden';
    badge.textContent = copy.status.hidden;
    head.appendChild(badge);
  }

  const order = document.createElement('p');
  order.className = 'myReviews__order';
  order.textContent = review.orderId;

  const body = document.createElement('p');
  body.className = 'myReviews__body';
  body.textContent = review.body;

  li.appendChild(head);
  li.appendChild(order);
  li.appendChild(body);

  /*
   * 관리자가 내린 후기에는 고치기·삭제를 **아예 그리지 않습니다.**
   *
   * 눌러 봐야 409 로 거절당할 버튼을 보여주는 것은 없는 것만 못합니다.
   * 서버도 같은 판정을 하지만(`updateOwnReview` 의 status='visible' 조건),
   * 화면이 먼저 말해 주는 편이 낫습니다.
   */
  if (review.status === 'hidden') {
    const why = document.createElement('p');
    why.className = 'myReviews__locked';
    why.textContent = copy.moderated;
    li.appendChild(why);
    return li;
  }

  const acts = document.createElement('div');
  acts.className = 'myReviews__acts';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'linkButton';
  edit.dataset.edit = review.id;
  edit.textContent = copy.edit;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'linkButton myReviews__danger';
  remove.dataset.remove = review.id;
  remove.textContent = copy.remove;

  acts.appendChild(edit);
  acts.appendChild(remove);
  li.appendChild(acts);
  return li;
}

/**
 * 편집 폼.
 *
 * 별점도 바꿉니다 — 마음이 바뀐 것을 본문으로만 적게 하고 별점은 못 고치게
 * 하면, 목록의 평균이 그 사람의 지금 생각과 어긋난 채로 남습니다.
 *
 * 라디오를 씁니다. 별 다섯 개를 버튼으로 만들면 키보드 순회가 다섯 정거장이
 * 되고 현재 값이 무엇인지 읽히지 않습니다.
 */
function editForm(review: MyReview, copy: MyReviewsCopy): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'myReviews__form';
  form.dataset.editForm = review.id;

  const ratingSet = document.createElement('fieldset');
  ratingSet.className = 'myReviews__ratings';
  const legend = document.createElement('legend');
  legend.textContent = copy.ratingLabel;
  ratingSet.appendChild(legend);

  for (let n = 1; n <= 5; n++) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `rating-${review.id}`;
    input.value = String(n);
    input.checked = n === review.rating;
    const text = document.createElement('span');
    text.textContent = String(n);
    label.appendChild(input);
    label.appendChild(text);
    ratingSet.appendChild(label);
  }

  const field = document.createElement('div');
  field.className = 'field';
  const bodyLabel = document.createElement('label');
  bodyLabel.setAttribute('for', `body-${review.id}`);
  bodyLabel.textContent = copy.bodyLabel;
  const textarea = document.createElement('textarea');
  textarea.id = `body-${review.id}`;
  textarea.name = 'body';
  textarea.rows = 4;
  textarea.required = true;
  textarea.minLength = 10;
  textarea.maxLength = 2000;
  textarea.value = review.body;
  field.appendChild(bodyLabel);
  field.appendChild(textarea);

  const error = document.createElement('p');
  error.className = 'field__error';
  error.dataset.editError = '';
  error.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'formActions';
  const save = document.createElement('button');
  save.className = 'cta';
  save.type = 'submit';
  save.textContent = copy.save;
  const cancel = document.createElement('button');
  cancel.className = 'linkButton';
  cancel.type = 'button';
  cancel.dataset.cancelEdit = '';
  cancel.textContent = copy.cancel;
  actions.appendChild(save);
  actions.appendChild(cancel);

  form.appendChild(ratingSet);
  form.appendChild(field);
  form.appendChild(error);
  form.appendChild(actions);
  return form;
}

function pendingItem(order: PendingOrder, copy: MyReviewsCopy, writeHref: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'myReviews__item myReviews__item--pending';

  const text = document.createElement('div');

  const names = order.items
    .map((item) => item.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
  const title = document.createElement('p');
  title.className = 'myReviews__body';
  // 상품명이 없으면 주문번호만으로도 후기를 쓸 수 있습니다.
  title.textContent = names.join(', ') || order.orderId;
  text.appendChild(title);

  const meta = document.createElement('p');
  meta.className = 'myReviews__order';
  meta.textContent = `${isoDate(order.createdAt)} · ${order.orderId}`;
  text.appendChild(meta);

  // 링크입니다 — 버튼이 아니라. 다른 페이지로 가는 것이고, 새 탭·복사·
  // 뒤로가기가 전부 그대로 동작해야 합니다.
  const write = document.createElement('a');
  write.className = 'cta cta--ghost myReviews__write';
  write.href = writeHref;
  write.textContent = copy.write;

  li.appendChild(text);
  li.appendChild(write);
  return li;
}

function render(
  root: HTMLElement,
  data: { reviews: MyReview[]; pending: PendingOrder[] },
  copy: MyReviewsCopy,
  writeHref: string,
): void {
  const state = el(root, '[data-my-reviews-state]');
  const list = el(root, '[data-my-reviews-list]');
  const pendingBox = el(root, '[data-my-reviews-pending]');
  const pendingHeading = el(root, '[data-my-reviews-pending-heading]');
  const pendingList = el(root, '[data-my-reviews-pending-list]');
  if (!state || !list || !pendingBox || !pendingHeading || !pendingList) return;

  if (data.reviews.length === 0) {
    state.textContent = copy.empty;
    state.hidden = false;
    list.hidden = true;
  } else {
    list.replaceChildren(...data.reviews.map((review) => reviewItem(review, copy)));
    list.hidden = false;
    state.hidden = true;
  }

  if (data.pending.length === 0) {
    pendingBox.hidden = true;
  } else {
    pendingHeading.textContent = copy.pendingHeading;
    pendingList.replaceChildren(
      ...data.pending.map((order) => pendingItem(order, copy, writeHref)),
    );
    pendingBox.hidden = false;
  }
}

/** 내 후기 섹션을 살립니다. */
export function mountMyReviews(root: HTMLElement, copy: MyReviewsCopy, writeHref: string): void {
  const state = el(root, '[data-my-reviews-state]');
  // 편집 폼을 그리려면 원본이 필요합니다. 화면에서 다시 읽으면 사람이 쓴
  // 문자열을 파싱하는 셈이 됩니다.
  let current: MyReview[] = [];

  async function load(): Promise<void> {
    try {
      const res = await fetch('/api/account/reviews');
      if (!res.ok) {
        // 로그인이 풀렸거나 기능이 꺼진 경우입니다. 오류 문구로 화면을
        // 채우지 않고 빈 상태로 둡니다 — 이 섹션은 부가적인 자리입니다.
        await drain(res);
        current = [];
        render(root, { reviews: [], pending: [] }, copy, writeHref);
        return;
      }
      const data = (await res.json()) as { reviews?: MyReview[]; pending?: PendingOrder[] };
      current = data.reviews ?? [];
      render(root, { reviews: current, pending: data.pending ?? [] }, copy, writeHref);
    } catch {
      if (state) {
        state.textContent = copy.error;
        state.hidden = false;
      }
    }
  }

  /** 서버가 준 오류를 사람이 읽을 문장으로. 없으면 일반 문구입니다. */
  function messageFor(payload: { error?: string; message?: string }): string {
    if (payload.error === 'MODERATED') return copy.moderated;
    return payload.message ?? copy.error;
  }

  // 목록은 매번 다시 그려지므로 개별 요소에 붙이지 않고 위임합니다.
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const editId = target.dataset?.edit;
    if (editId) {
      const review = current.find((r) => r.id === editId);
      const item = target.closest('li');
      if (!review || !item) return;
      // 이미 열려 있으면 두 번 그리지 않습니다.
      if (item.querySelector('[data-edit-form]')) return;
      item.appendChild(editForm(review, copy));
      item.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      return;
    }

    if (target.dataset?.cancelEdit !== undefined) {
      target.closest('form')?.remove();
      return;
    }

    const removeId = target.dataset?.remove;
    if (removeId) {
      // 되돌릴 수 없는 것처럼 보이는 동작이라 한 번 묻습니다. 실제로는
      // 그 주문이 "다시 쓸 수 있는 목록" 으로 돌아갑니다.
      if (!window.confirm(copy.confirmRemove)) return;
      void (async () => {
        const button = target as HTMLButtonElement;
        button.disabled = true;
        try {
          const res = await fetch(`/api/account/reviews/${encodeURIComponent(removeId)}`, {
            method: 'DELETE',
          });
          if (!res.ok) {
            const payload = (await res.json().catch(() => ({}))) as { error?: string };
            window.alert(messageFor(payload));
            return;
          }
          await drain(res);
          await load();
        } catch {
          window.alert(copy.error);
        } finally {
          button.disabled = false;
        }
      })();
    }
  });

  root.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement | null;
    const id = form?.dataset.editForm;
    if (!form || !id) return;
    event.preventDefault();

    const error = form.querySelector<HTMLElement>('[data-edit-error]');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const data = new FormData(form);
    const body = String(data.get('body') ?? '').trim();
    const rating = Number(data.get(`rating-${id}`) ?? 0);

    const show = (message: string | null) => {
      if (!error) return;
      error.textContent = message ?? '';
      error.hidden = !message;
    };

    show(null);
    if (body.length < 10 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      show(copy.error);
      return;
    }

    void (async () => {
      const label = submit?.textContent ?? '';
      if (submit) {
        submit.disabled = true;
        submit.textContent = copy.saving;
      }
      try {
        const res = await fetch(`/api/account/reviews/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating, body }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          show(messageFor(payload));
          return;
        }
        await drain(res);
        await load();
      } catch {
        show(copy.error);
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = label;
        }
      }
    })();
  });

  void load();
}
