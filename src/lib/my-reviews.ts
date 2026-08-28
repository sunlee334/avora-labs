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
  status: 'visible' | 'hidden';
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
  return li;
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

  void (async () => {
    try {
      const res = await fetch('/api/account/reviews');
      if (!res.ok) {
        // 로그인이 풀렸거나 기능이 꺼진 경우입니다. 오류 문구로 화면을
        // 채우지 않고 빈 상태로 둡니다 — 이 섹션은 부가적인 자리입니다.
        await drain(res);
        render(root, { reviews: [], pending: [] }, copy, writeHref);
        return;
      }
      const data = (await res.json()) as { reviews?: MyReview[]; pending?: PendingOrder[] };
      render(root, { reviews: data.reviews ?? [], pending: data.pending ?? [] }, copy, writeHref);
    } catch {
      if (state) {
        state.textContent = copy.error;
        state.hidden = false;
      }
    }
  })();
}
