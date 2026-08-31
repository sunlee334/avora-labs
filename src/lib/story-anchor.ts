/**
 * 밖에 공유된 `#story` 링크를 `/brand` 로 넘깁니다.
 *
 * 브랜드 서사가 홈에서 `/brand` 로 옮겨 갔습니다. 그런데 그 전에 공유된
 * `/{언어}/#story` 링크가 어딘가에 남아 있습니다 — 인스타그램 프로필, 단톡방,
 * 북마크. 그 링크로 들어오면 홈이 뜨고 아무 데도 가지 않습니다. 브라우저는
 * 없는 조각을 만나면 조용히 맨 위에 머뭅니다.
 *
 * **왜 서버 리다이렉트가 아닌가:** 조각(`#story`)은 서버로 가지 않습니다.
 * 브라우저가 갖고 있다가 페이지를 받은 뒤에 씁니다. 그래서 이 판단은
 * 화면에서만 할 수 있습니다.
 *
 * 자바스크립트가 없으면 홈에 그대로 머뭅니다. 홈에는 브랜드 브릿지와
 * `/brand` 링크가 있으므로 길이 끊기지는 않습니다.
 */
export function mountStoryAnchor(): void {
  if (location.hash !== '#story') return;

  const link = document.querySelector<HTMLAnchorElement>('[data-brand-link]');
  if (!link) return;

  /*
   * `replace` 입니다. `assign` 을 쓰면 뒤로 가기가 다시 `#story` 로 돌아오고,
   * 그때 이 코드가 또 넘겨 손님이 뒤로 가기를 빠져나갈 수 없습니다.
   */
  location.replace(link.href);
}
