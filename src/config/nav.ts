/**
 * 내비게이션 항목의 **유일한 정의**.
 *
 * 헤더(`Nav.astro`)·모바일 시트(`MenuSheet.astro`)·푸터(`Footer.astro`) 셋이
 * 같은 목록을 각자 하드코딩하고 있었습니다. 메뉴 하나를 고치려면 세 파일을
 * 고쳐야 했고, 실제로 어긋나 있었습니다 — 헤더의 브랜드 링크는
 * `/{lang}/#story`, 시트와 푸터는 `/{lang}/`. (그 항목은 지금 `/brand`
 * 페이지입니다.)
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

/** 노출 여부를 가르는 빌드 사실. */
export type Gate = 'checkout' | 'accounts';

/** 실제로 갈 수 있는 한 곳. */
export interface NavLeaf {
  id: string;
  label: Label;
  /**
   * 생략하면 항상 노출.
   *
   * 최상위 묶음의 자식에도 붙습니다 — 리뷰가 그 경우입니다. 후기는 결제된
   * 주문에서만 나오므로 자사 결제가 꺼져 있으면 존재할 수 없고, 그러면
   * 내비 항목이 **영원히 빈 페이지로 가는 길** 이 됩니다.
   */
  gate?: Gate;
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
   * 생략하면 `path` 를 그대로 씁니다. 둘이 갈라지는 것은 **주소에 프래그먼트가
   * 붙을 때** 입니다 — 그때는 `path` 가 `'#어디'` 여도 판정은 어느 페이지에
   * 있는가로 해야 합니다.
   *
   * 지금 이 필드를 쓰는 항목은 없습니다. 브랜드 항목이 `'#story'` 였다가
   * 실제 페이지(`/brand`)가 되면서 마지막 사용처가 사라졌습니다. 프래그먼트
   * 링크를 다시 넣게 되면 그때 필요합니다.
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
  | {
      kind: 'group';
      id: string;
      label: Label;
      /**
       * 묶음 자체가 가는 곳.
       *
       * 묶음 제목이 `<button>` 이기만 하면 크롤러가 따라갈 수 없고, 가운데
       * 클릭·새 탭도 안 됩니다. 첫 자식의 주소를 묶음의 착지점으로 씁니다 —
       * "고객센터" 는 자주 묻는 질문(`/support`)이 그 자리입니다.
       */
      path: string;
      match: string;
      children: readonly NavLeaf[];
    };

// ── 내부 ────────────────────────────────────────────────────
// NAV 와 resolveTop 을 함께 내보내면 컴포넌트가 visibleTop() 을 우회해 NAV 를
// 직접 순회할 수 있고, 그러면 "한 항목 규칙의 유일한 판정 지점" 이 깨집니다.
// 밖으로는 게이트를 지난 결과만 나갑니다.

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
      /*
       * 전에는 `/{lang}/#story` 앵커였습니다 — 홈의 한 지점으로 스크롤하는
       * 링크입니다. 섹션 순서를 바꾸면서 브랜드 서사가 아래로 내려갔고,
       * 누르면 페이지 중간 어딘가로 튕겼습니다. 네비게이션이 목적지를
       * 약속하고 스크롤을 배달하는 셈이었습니다.
       *
       * 이제 실제 페이지입니다. `match` 를 따로 두지 않아도 됩니다 —
       * 주소와 판정이 같아졌습니다.
       */
      { id: 'story', label: (t) => t.nav.story, path: 'brand' },
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
      // 후기는 결제된 주문에서만 생깁니다(worker/reviews.ts). 자사 결제가
      // 꺼져 있으면 후기가 존재할 수 없어, 이 항목은 언제 눌러도 빈 페이지로
      // 갑니다. 빈 상태 문구가 잘 쓰여 있어도 빈 페이지는 빈 페이지입니다.
      // 페이지 자체는 그대로 두고 **길만** 감춥니다 — 제품 페이지 하단에서는
      // 계속 갈 수 있고, 첫 후기가 쌓이는 순간 저절로 돌아옵니다.
      { id: 'reviews', label: (t) => t.nav.reviews, path: 'reviews', gate: 'checkout' },
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

/**
 * 이 항목을 지금 보여도 되는가.
 *
 * 게이트가 없으면 항상 보입니다. 판정이 세 곳(최상위·잎·유틸리티)에
 * 흩어져 있으면 한 곳만 고쳐도 나머지가 조용히 달라집니다.
 */
function passes(item: { gate?: Gate }, flags: NavFlags): boolean {
  return item.gate ? flags[item.gate] : true;
}

/**
 * 자식 목록을 받습니다 — NavGroup 전체가 아니라.
 *
 * 게이트로 걸러낸 뒤에는 "최소 1개" 라는 길이 보장이 더 이상 성립하지
 * 않습니다. NavGroup 을 그대로 받으면 걸러낸 배열을 다시 그 타입으로
 * 우겨넣어야 하는데, 그건 타입이 말리는 것을 캐스팅으로 덮는 것입니다.
 * 호출하는 쪽이 빈 목록을 먼저 거르고, 여기는 1개인지 여럿인지만 봅니다.
 */
function resolveTop(
  id: string,
  label: Label,
  children: readonly [NavLeaf, ...NavLeaf[]],
): ResolvedTop {
  if (children.length === 1) {
    const only = children[0];
    return {
      kind: 'link',
      id,
      // 접힌 항목의 라벨은 **부모의 것** 입니다. 자식 라벨을 올리면 최상위가
      // "브랜드" 가 아니라 "브랜드 스토리" 로 바뀝니다.
      label,
      path: only.path,
      match: only.match ?? only.path,
    };
  }
  /*
   * 착지점은 **첫 자식** 입니다. 목록의 첫 항목이 그 묶음의 대표라는 것이
   * 이 파일의 배열 순서가 이미 말하고 있는 사실이고, 따로 적어 두면 둘이
   * 어긋날 자리가 하나 늘어납니다.
   */
  const [first] = children;
  return {
    kind: 'group',
    id,
    label,
    path: first.path,
    match: first.match ?? first.path,
    children,
  };
}

// ── 공개 표면 ───────────────────────────────────────────────

/**
 * 최상위 항목. 세 화면이 전부 이것만 순회합니다.
 *
 * 상수가 아니라 함수인 이유: 잎에도 게이트가 생겼기 때문입니다. 상수로 두면
 * 게이트를 지나지 않은 목록이 존재하게 되고, 어느 화면이 그것을 집어 쓰면
 * 감춰야 할 항목이 새어 나갑니다. NAV 를 내보내지 않는 것과 같은 이유입니다.
 *
 * 자식이 게이트로 빠져 하나만 남으면 resolveTop 이 링크로 접고, 전부 빠지면
 * 묶음 자체가 사라집니다 — 빈 서랍을 만들지 않습니다.
 */
export function visibleTop(flags: NavFlags): readonly ResolvedTop[] {
  const out: ResolvedTop[] = [];
  for (const group of NAV) {
    const [first, ...rest] = group.children.filter((leaf) => passes(leaf, flags));
    if (!first) continue;
    out.push(resolveTop(group.id, group.label, [first, ...rest]));
  }
  return out;
}

/** 게이트를 지난 모든 잎을 평평하게 — 푸터·시트·테스트가 씁니다. */
export function allLeaves(flags: NavFlags): readonly NavLeaf[] {
  return NAV.flatMap((group) => group.children.filter((leaf) => passes(leaf, flags)));
}

/**
 * 게이트를 적용한 유틸리티 (장바구니 **포함**).
 * 헤더가 장바구니를 갈라 쓰기 위해 포함시킵니다.
 */
export function visibleUtility(flags: NavFlags): readonly UtilityItem[] {
  return UTILITY.filter((item) => passes(item, flags));
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
  return [...allLeaves(flags), ...visibleUtility(flags).filter((item) => item.badge !== 'cart')];
}
