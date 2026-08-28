/**
 * 내비게이션 항목의 **유일한 정의**.
 *
 * 헤더(`Nav.astro`)·모바일 시트(`MenuSheet.astro`)·푸터(`Footer.astro`) 셋이
 * 같은 목록을 각자 하드코딩하고 있었습니다. 메뉴 하나를 고치려면 세 파일을
 * 고쳐야 했고, 실제로 어긋나 있었습니다 — 헤더의 홈 링크는 `/{lang}/#story`,
 * 시트와 푸터는 `/{lang}/`.
 *
 * ── 철칙: 이 파일의 import 문은 `import type` 하나뿐입니다 ──
 * 값 import 가 하나라도 들어가면 Playwright 스펙에서 **모듈 로드 자체가
 * 실패** 합니다. 확인된 두 경로:
 *
 *   src/config/runtime.ts  →  payment-config.json 을 `with { type: 'json' }`
 *                             없이 import (Vite 전용)
 *   src/i18n/index.ts      →  ko.json 등에 대해 같은 문제
 *
 *     TypeError: Module ".../payment-config.json" needs an import attribute
 *                of "type: json"
 *
 * 테스트가 이 파일을 직접 읽어 세 화면의 렌더 결과와 대조하는 것이 "정의가
 * 한 곳에 있다" 의 증명 방식이므로, 그 import 하나가 증명을 통째로 무너뜨립니다.
 * 게이트가 필요한 것은 전부 `nav-gates.ts` 에 있습니다.
 */
import type { Dict } from '../i18n';

/**
 * 라벨은 키 문자열이 아니라 사전 접근 함수입니다.
 *
 * `'nav.brand'` 같은 문자열이면 오타가 런타임 `undefined` 로 나타나 화면에서만
 * 드러납니다. `(t) => t.nav.brand` 는 없는 키가 **`tsc` 오류** 가 되어
 * `check:types`(prebuild)가 잡습니다.
 */
type Label = (t: Dict) => string;

/** 실제로 갈 수 있는 한 곳. */
export interface NavLeaf {
  id: string;
  label: Label;
  /**
   * `''` 은 홈. `localePath(locale, path)` 로 주소가 됩니다.
   *
   * 프래그먼트를 포함할 수 있습니다 — `localePath` 는 선행 `/` 만 벗기므로
   * `localePath('ko', '#story') === '/ko/#story'` 입니다.
   */
  path: string;
  /**
   * `aria-current` 판정용. `Base.astro` 가 내려주는 `path` prop 과 비교합니다.
   *
   * **`path` 와 분리돼 있는 것이 브랜드 항목의 전제입니다** — `path` 는
   * `'#story'` 지만 `match` 는 `''` 이라, 판정은 프래그먼트가 없던 때와 글자
   * 단위로 같은 결과를 냅니다.
   */
  match?: string;
  /**
   * 평면 목록(푸터)에서 쓸 라벨. 없으면 `label` 을 씁니다.
   *
   * 드롭다운·시트 안에서는 부모가 문맥을 주지만 푸터에는 부모가 없습니다.
   * `support` 그룹의 `faq` 잎이 유일한 사용처입니다:
   *
   *   드롭다운·시트  자주 묻는 질문   (부모 "고객센터" 아래)
   *   푸터          고객센터        (그 주소의 `<title>`·`<h1>` 과 일치)
   *
   * 새 사전 키를 만들지 않습니다 — 기존 `nav.support` 를 재사용합니다.
   */
  flatLabel?: Label;
}

/** 최상위 묶음. `children` 은 최소 1개 — 빈 서랍을 만들지 않습니다. */
export interface NavGroup {
  id: string;
  label: Label;
  children: readonly [NavLeaf, ...NavLeaf[]];
}

/** 런타임 플래그로 노출이 갈리는 항목. */
export interface UtilityItem extends NavLeaf {
  /** 생략하면 항상 노출 */
  gate?: 'checkout' | 'accounts';
  /** 배지 마크업이 붙는 항목. 헤더 렌더러만 봅니다 */
  badge?: 'cart';
}

/**
 * 게이트 판정에 필요한 사실 전부.
 * `runtime.ts` 를 이 파일에서 읽지 않는 이유가 이 타입입니다.
 */
export interface NavFlags {
  checkout: boolean;
  accounts: boolean;
}

/**
 * 한 항목 규칙의 **유일한** 판정 결과.
 *
 * 화살표·아코디언 마크업은 `kind: 'group'` 가지 안에만 존재할 수 있습니다 —
 * 컴포넌트가 `children.length` 를 다시 세는 길이 타입으로 막혀 있습니다.
 */
export type ResolvedTop =
  | { kind: 'link'; id: string; label: Label; path: string; match: string }
  | { kind: 'group'; id: string; label: Label; children: readonly NavLeaf[] };

// ── 내부 ────────────────────────────────────────────────────
// NAV 와 resolveTop 을 함께 내보내면 컴포넌트가 TOP 을 우회해 NAV 를 직접
// 순회할 수 있고, 그러면 "한 항목 규칙의 유일한 판정 지점" 이 깨집니다.
// 밖으로는 TOP 만 나갑니다.

const NAV: readonly NavGroup[] = [
  {
    id: 'product',
    label: (t) => t.nav.product,
    children: [{ id: 'product', label: (t) => t.nav.product, path: 'product' }],
  },
  {
    id: 'brand',
    label: (t) => t.nav.brand,
    children: [
      // 주소는 /{lang}/#story, aria-current 판정은 '' — 위 match 주석 참조.
      { id: 'story', label: (t) => t.nav.story, path: '#story', match: '' },
    ],
  },
  {
    id: 'support',
    label: (t) => t.nav.support,
    children: [
      {
        id: 'faq',
        label: (t) => t.nav.faq,
        flatLabel: (t) => t.nav.support,
        path: 'support',
      },
      { id: 'posts', label: (t) => t.support.posts.heading, path: 'support/posts' },
      { id: 'reviews', label: (t) => t.nav.reviews, path: 'reviews' },
    ],
  },
];

const UTILITY: readonly UtilityItem[] = [
  // 자사 결제가 꺼져 있으면 조회할 주문이 존재할 수 없습니다 — 폼이 항상
  // "찾을 수 없음" 을 돌려주는데, 그것은 404 보다 나쁩니다.
  {
    id: 'order-lookup',
    label: (t) => t.order.lookup.heading,
    path: 'order/lookup',
    gate: 'checkout',
  },
  { id: 'account', label: (t) => t.nav.account, path: 'account', gate: 'accounts' },
  { id: 'cart', label: (t) => t.nav.cart, path: 'cart', gate: 'checkout', badge: 'cart' },
];

function resolveTop(item: NavGroup): ResolvedTop {
  if (item.children.length === 1) {
    const only = item.children[0];
    return {
      kind: 'link',
      id: item.id,
      // 접힌 항목의 라벨은 **부모의 것** 입니다. 자식 라벨을 올리면 최상위가
      // "브랜드" 가 아니라 "브랜드 스토리" 로 바뀝니다.
      label: item.label,
      path: only.path,
      match: only.match ?? only.path,
    };
  }
  return { kind: 'group', id: item.id, label: item.label, children: item.children };
}

// ── 공개 표면 ───────────────────────────────────────────────

/** 최상위 3개. 세 화면이 전부 이것만 순회합니다. */
export const TOP: readonly ResolvedTop[] = NAV.map(resolveTop);

/** 모든 잎을 평평하게 — 푸터·시트·테스트가 씁니다. */
export function allLeaves(): readonly NavLeaf[] {
  return NAV.flatMap((group) => group.children);
}

/**
 * 게이트를 적용한 유틸리티 (장바구니 **포함**).
 * 헤더가 장바구니를 갈라 쓰기 위해 포함시킵니다.
 */
export function visibleUtility(flags: NavFlags): readonly UtilityItem[] {
  return UTILITY.filter((item) => (item.gate ? flags[item.gate] : true));
}

/**
 * "메뉴 목적지" 의 정의 — 푸터·시트·헤더·테스트가 **모두 이것을 읽습니다.**
 *
 * 장바구니는 탐색 목적지가 아니라 거래 단축키라 빠집니다. 그래서 세 화면의
 * 수집 결과가 정확히 같아지고, "푸터 ⊇ 헤더+시트" 가 등호로 성립합니다.
 *
 * 반환값이 `NavLeaf` 라 `flatLabel` 이 함께 따라옵니다. **평면 목록으로
 * 렌더하는 쪽(푸터)이 `flatLabel ?? label` 을 고릅니다** — 어느 라벨이 맞는지는
 * "부모가 있는가" 라는 표현 층의 사실이고, 정의 층이 그것을 알면 안 됩니다.
 */
export function menuDestinations(flags: NavFlags): readonly NavLeaf[] {
  return [...allLeaves(), ...visibleUtility(flags).filter((item) => item.badge !== 'cart')];
}
