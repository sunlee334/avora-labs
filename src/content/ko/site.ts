/**
 * 사이트 공통 카피. 모든 사용자 노출 문구는 content/ 아래에 두어 추후 다국어 확장이 가능하게 한다.
 * 금지 표현(제품기획안 4-3): '눈이 시리지 않은 선크림' 헤드라인, '무백탁' 단독 소구, '스웨트프루프',
 * '운동할 때 쓰는 선크림', '자체 개발 처방'. 효능 표현은 자외선 차단으로 한정.
 */
export const NAV = [
  { href: "/shop", label: "제품" },
  { href: "/brand", label: "브랜드" },
  { href: "/standard", label: "기준" },
  { href: "/faq", label: "FAQ" },
] as const;

export const FOOTER_LINKS = {
  shop: [
    { href: "/products/daily-sunscreen", label: "Daily Sunscreen" },
    { href: "/shop", label: "로드맵" },
    { href: "/notify", label: "출시 알림 신청" },
  ],
  brand: [
    { href: "/brand", label: "AVORA LABS · PAROS" },
    { href: "/standard", label: "고르는 기준" },
    { href: "https://www.instagram.com/avora_labs", label: "Instagram", external: true },
  ],
  help: [
    { href: "/faq", label: "자주 묻는 질문" },
    { href: "/policy/shipping-returns", label: "배송 · 교환 · 반품" },
    { href: "/orders/lookup", label: "비회원 주문 조회" },
  ],
  legal: [
    { href: "/policy/terms", label: "이용약관" },
    { href: "/policy/privacy", label: "개인정보처리방침" },
  ],
} as const;

export const TAGLINES = {
  primary: "FOR EVERY MOVEMENT",
  secondary: "MOVE. SWEAT. REAPPLY.",
  tertiary: "MOVE FREELY. CARE GENTLY.",
  company: "We create brands for people in motion.",
} as const;

/** 하루의 흐름 — 로드맵과 캠페인 서사의 공통 축 */
export const DAY_FLOW = ["SUN", "MOVE", "SWEAT", "WATER", "RESET"] as const;

/** 세계관 4코드 */
export const BRAND_CODES = [
  {
    key: "light",
    name: "LIGHT",
    ko: "빛",
    line: "햇빛을 피하지 않는다. 그 아래에서 계속 움직인다.",
  },
  {
    key: "wind",
    name: "WIND",
    ko: "바람",
    line: "무겁지 않게. 바르고 나면 잊어버리는 사용감.",
  },
  {
    key: "water",
    name: "WATER",
    ko: "물",
    line: "땀과 물을 만나도 무너지지 않는 밀착.",
  },
  {
    key: "stone",
    name: "STONE",
    ko: "돌",
    line: "책상 위에 두어도 좋은, 조용한 물건의 태도.",
  },
] as const;
