/**
 * 섹션 도달률.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────
 * 홈의 섹션 순서를 기획안 위계대로 바꿨습니다(C2). 그런데 그 판단이 옳았는지
 * 확인할 방법이 없으면, 12월에 "The Choice 를 위로 올린 게 효과가 있었나" 에
 * 답할 수 없습니다.
 *
 * GA4 기본 스크롤 이벤트는 90% 지점만 잡습니다. 어느 섹션에서 떠났는지는
 * 알려 주지 않습니다.
 *
 * ── 한 세션에 한 번만 ───────────────────────────────────────
 * 스크롤을 오르내리면 같은 섹션이 여러 번 들어옵니다. 그대로 보내면 도달률이
 * 아니라 "스크롤을 얼마나 흔들었나" 가 됩니다.
 */

declare global {
  interface Window {
    gtag?: (command: string, action: string, params?: Record<string, unknown>) => void;
  }
}

export function mountSectionView(): void {
  /*
   * 계측이 꺼진 환경에서는 아무것도 하지 않습니다. 로컬·프리뷰·테스트가
   * 여기에 해당하고, 관찰자를 만들어 두면 그 비용만 남습니다.
   */
  if (typeof window.gtag !== 'function') return;

  const sections = document.querySelectorAll<HTMLElement>('[data-section]');
  if (sections.length === 0) return;

  const seen = new Set<string>();
  const lang = document.documentElement.lang;
  const path = location.pathname;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as HTMLElement).dataset.section;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        // 한 번 보낸 섹션은 더 볼 이유가 없습니다.
        io.unobserve(entry.target);
        window.gtag?.('event', 'section_view', { section_id: id, page_path: path, lang });
      }
    },
    /*
     * "봤다" 의 기준.
     *
     * 처음에는 "섹션의 25% 가 화면에 들어오면" 으로 잡았는데, 그 기준은
     * **섹션 길이에 따라 달라집니다.** 화면보다 네 배 넘게 긴 섹션은 25% 가
     * 한 번에 들어올 수 없어 영영 기록되지 않습니다. 지금은 검증단 섹션이
     * 화면의 2.1배라 걸리지 않지만, 내용이 늘면 조용히 멈춥니다.
     *
     * 그래서 길이가 아니라 **위치** 로 봅니다. 화면 가운데 절반 띠 안에
     * 섹션이 걸치면 읽고 있는 것으로 칩니다 — 섹션이 얼마나 길든 같은
     * 기준입니다.
     */
    { rootMargin: '-25% 0px -25% 0px', threshold: 0 },
  );

  for (const section of sections) io.observe(section);
}
