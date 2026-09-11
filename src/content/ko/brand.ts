/**
 * `/brand` 페이지 카피. 출처: AVORA LABS 사업기획서 v04 1장, PAROS 제품기획안 v09 1장·4장.
 * 정직 원칙: PAROS는 AVORA LABS의 첫 브랜드이며, 제조는 위탁(ODM/OEM)한다는 사실을 숨기지 않는다.
 * 금지 표현(브리프): 처방을 직접 새로 만들었다는 주장 금지, 그리스 관광지 이미지 언급 금지, 스포츠 시각 언어 금지.
 */
export const BRAND = {
  eyebrow: "AVORA LABS × PAROS",
  title: "브랜드를 만드는 회사, 아보라랩스",
  intro:
    "아보라랩스는 두 사람이 만든 브랜드 회사입니다. 제조 설비를 갖추고 있지 않습니다. 처방은 위탁 제조사의 기성 처방 중에서, 저희가 세운 기준을 통과한 것만 골라 씁니다. PAROS는 그렇게 만든 첫 번째 브랜드입니다.",

  company: {
    eyebrow: "COMPANY",
    title: "왜 처방을 직접 만들지 않았는가",
    body: [
      "화장품을 새로 개발하려면 원료 배합부터 임상까지 오랜 시간과 비용이 듭니다. 아보라랩스는 2인 팀입니다. 그 시간을 처방 개발이 아니라, 어떤 처방이 좋은 처방인지 기준을 세우고 검증하는 데 쓰기로 했습니다.",
      "그래서 PAROS의 제형은 새로 만든 처방이 아니라 위탁 제조사의 기성 처방입니다. 다만 아무 처방이나 고르지 않았습니다. 사용감 우선순위를 문서로 먼저 정하고, 그 기준에 미달하는 처방은 조건이 좋아도 채택하지 않았습니다.",
    ],
    standardNote: {
      before: "그 과정은",
      link: { href: "/standard", label: "고르는 기준 페이지" },
      after: "에 그대로 공개되어 있습니다.",
    },
  },

  movementCare: {
    eyebrow: "PHILOSOPHY",
    title: "MOVEMENT + CARE",
    body: "PAROS는 몸을 움직이는 시간과, 그 몸을 돌보는 시간을 하나로 봅니다. 운동을 잘하게 만드는 제품이 아니라, 운동으로 채워진 하루 전체를 무리 없이 지나가게 돕는 제품을 만듭니다.",
  },

  positioning: {
    eyebrow: "POSITIONING",
    title: "SPORTS BEAUTY가 아니라 ACTIVE LIFESTYLE BEAUTY",
    body: "PAROS는 경기력을 위한 기능성 스포츠 제품이 아닙니다. 러닝화나 스포츠 웨어처럼 종목에 맞춰 만들지 않습니다. 대신 몸을 쓰는 하루를 보내는 사람이라면 종목과 무관하게 필요할 사용감의 기준을 제품에 반영합니다.",
  },

  target: {
    eyebrow: "TARGET",
    title: "종목에 갇히지 않은 20~30대",
    body: "러닝, 헬스, 클라이밍, 서핑, 라운딩, 여행. 하나의 종목에 속한 사람이 아니라, 여러 활동을 넘나들며 하루를 움직임으로 채우는 20~30대 성인을 위해 만듭니다. 성별을 구분하지 않습니다. 무향·무톤업 처방을 고른 이유이기도 합니다.",
  },

  principle: {
    eyebrow: "VISUAL PRINCIPLE",
    title: "Landscape → Lifestyle → Product",
    body: "PAROS의 모든 이미지는 이 순서를 지킵니다. 풍경이 먼저 있고, 그 안에서 움직이는 사람이 있고, 제품은 그 다음입니다. 제품 컷의 비중은 전체의 1/3을 넘기지 않습니다.",
    steps: [
      { key: "Landscape", body: "빛과 공간이 있는 풍경. 특정 관광지나 이국적 배경을 내세우지 않습니다." },
      { key: "Lifestyle", body: "그 풍경 속에서 움직이는 사람의 행동과 리듬." },
      { key: "Product", body: "움직임을 가능하게 만든 이유로서, 마지막에 조용히 등장합니다." },
    ],
  },

  dayFlow: {
    eyebrow: "A DAY IN MOTION",
    title: "SUN → MOVE → SWEAT → WATER → RESET",
    body: "PAROS의 로드맵은 이 하루의 흐름을 따라갑니다. 햇빛 아래로 나가고, 움직이고, 땀을 흘리고, 물을 만나고, 다시 정돈하는 다섯 구간입니다. 지금은 SUN·MOVE 구간의 Daily Sunscreen 하나로 시작합니다.",
  },

  honesty: {
    eyebrow: "HONESTY",
    title: "숨기지 않는 것",
    points: [
      "PAROS는 아보라랩스의 첫 번째 브랜드입니다. 오래된 브랜드처럼 포장하지 않습니다.",
      "처방은 새로 만든 것이 아니라 기성 처방입니다. 다만 기준을 세우고 골랐습니다.",
      "전성분은 처방이 최종 확정된 뒤 공개합니다. 확정 전 추정치를 먼저 내세우지 않습니다.",
    ],
  },
} as const;
