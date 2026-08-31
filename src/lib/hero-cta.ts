/**
 * 첫 화면의 버튼 → 신청 폼.
 *
 * ── 이 파일이 없어도 동작합니다 ─────────────────────────────
 * 버튼은 `<a href="#notify">` 입니다. 자바스크립트가 없으면 브라우저가
 * 그 자리로 뛰고, 그것으로도 목적은 달성됩니다. 여기서 얹는 것은 둘뿐입니다.
 *
 *   1. 뛰지 않고 미끄러지게 — 어디로 갔는지 알 수 있습니다
 *   2. 이메일 칸에 초점 — 도착해서 한 번 더 누르지 않아도 됩니다
 *
 * 2번이 이 방식을 고른 이유입니다. 바텀시트로 폼을 올리면 버튼 한 번 +
 * 입력칸 한 번으로 탭이 둘이 되는데, 여기서는 버튼 한 번으로 끝납니다.
 */

/** 링크가 가리키는 곳. 마크업의 `href="#notify"` 와 같아야 합니다. */
const TARGET = 'notify';

export function mountHeroCta(): void {
  const link = document.querySelector<HTMLAnchorElement>('[data-hero-cta]');
  if (!link) return;

  const section = document.getElementById(TARGET);
  if (!section) return;

  link.addEventListener('click', (event) => {
    /*
     * 새 탭·다운로드 같은 보조 동작은 브라우저에 맡깁니다. 가운데 클릭으로
     * 새 탭에 열려는 사람의 의도를 가로채면 안 됩니다.
     */
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;

    event.preventDefault();

    /*
     * 칸은 **누를 때마다 다시 찾습니다.**
     *
     * 마운트 시점에 잡아 두면 신청을 마친 뒤 폼이 완료 상태로 바뀌었을 때
     * 이미 떨어져 나간 노드를 붙들고 있게 됩니다. 지금 성공 경로는 칸을
     * 감추기만 하므로 눈에 보이는 차이는 없지만, 완료 화면을 다시 그리는
     * 방식으로 바뀌면 그때 조용히 어긋납니다.
     *
     * `offsetParent` 검사도 같은 성격입니다 — 브라우저가 이미 감춰진 요소에
     * 초점을 주지 않으므로 없어도 동작은 같습니다. 여기서 하는 일은
     * "보이는 칸일 때만 초점을 요청한다" 를 코드로 적어 두는 것입니다.
     */
    const field = section.querySelector<HTMLInputElement>('input[type="email"]');
    const usable = field && field.offsetParent !== null && !field.disabled;

    /*
     * ── 초점을 **먼저**, 스크롤을 나중에 ─────────────────────
     *
     * 순서가 뒤바뀌면 iOS 에서 키보드가 올라오지 않습니다. WebKit 은 사용자
     * 제스처 핸들러 **안에서 동기적으로** 부른 focus() 에 대해서만 키보드를
     * 엽니다. 스크롤이 끝나기를 기다렸다가 부르면 그 턴을 벗어나므로,
     * 커서만 깜빡이고 키보드는 뜨지 않습니다 — 손님은 칸을 한 번 더 누르게
     * 되고, 그러면 바텀시트를 물린 이유(탭 한 번)가 그대로 사라집니다.
     *
     * `preventScroll` 이 필요한 이유: 초점을 주면 브라우저가 그 요소를 화면에
     * 넣으려고 즉시 스크롤합니다. 그러면 아래 부드러운 이동이 시작도 전에
     * 끝나 버립니다.
     */
    if (usable) field.focus({ preventScroll: true });

    /*
     * 움직임을 줄이기로 한 사람에게는 미끄러지지 않습니다. 이 설정을 켠
     * 이유가 전정기관 문제인 경우가 있어, 긴 스크롤 애니메이션이 실제로
     * 어지럼증을 일으킵니다.
     */
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });

    /*
     * 주소창에 `#notify` 를 남깁니다. 뒤로 가기로 첫 화면에 돌아올 수 있고,
     * 그 상태로 링크를 복사하면 폼으로 바로 가는 주소가 됩니다.
     *
     * `pushState` 라 브라우저 기본 점프가 다시 일어나지 않습니다.
     *
     * **이미 `#notify` 면 쌓지 않습니다.** 무조건 밀어 넣으면 세 번 누른
     * 사람은 뒤로 가기를 세 번 눌러야 원래 있던 화면으로 돌아갑니다 —
     * 같은 자리로 세 번 되돌아오는 사이 아무것도 바뀌지 않으니, 뒤로 가기가
     * 고장 난 것처럼 보입니다.
     */
    if (location.hash !== `#${TARGET}`) history.pushState(null, '', `#${TARGET}`);
  });

  /*
   * 뒤로 가기로 첫 화면에 돌아오면 초점도 함께 돌려놓습니다.
   *
   * 그러지 않으면 화면은 히어로인데 초점은 저 아래 이메일 칸에 남습니다.
   * 그 상태에서 Tab 을 누르면 보이지도 않는 곳에서 이어지고, 화면 낭독기는
   * 지금 보이는 것과 다른 자리를 읽습니다.
   */
  window.addEventListener('popstate', () => {
    if (location.hash === `#${TARGET}`) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && section.contains(active)) active.blur();
  });
}
