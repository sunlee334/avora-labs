import type { Content } from "./index";
import { en } from "./en";

/** 简体中文内容。政策页面沿用英文译本并注明以韩文原文为准。 */
export const zh: Content = {
  NAV: [
    { href: "/shop", label: "产品" },
    { href: "/brand", label: "品牌" },
    { href: "/standard", label: "标准" },
    { href: "/faq", label: "常见问题" },
  ],
  FOOTER_LINKS: {
    shop: [
      { href: "/products/daily-sunscreen", label: "Daily Sunscreen" },
      { href: "/shop", label: "产品路线图" },
      { href: "/notify", label: "上市通知" },
    ],
    brand: [
      { href: "/brand", label: "AVORA LABS · PAROS" },
      { href: "/standard", label: "我们的挑选标准" },
      { href: "https://www.instagram.com/avora_labs", label: "Instagram", external: true },
    ],
    help: [
      { href: "/faq", label: "常见问题" },
      { href: "/policy/shipping-returns", label: "配送 · 退换货" },
      { href: "/orders/lookup", label: "非会员订单查询" },
    ],
    legal: [
      { href: "/policy/terms", label: "服务条款" },
      { href: "/policy/privacy", label: "隐私政策" },
    ],
  },
  TAGLINES: en.TAGLINES,
  DAY_FLOW: en.DAY_FLOW,
  BRAND_CODES: [
    { key: "light", name: "LIGHT", ko: "光", line: "不躲开阳光，在阳光下继续前行。" },
    { key: "wind", name: "WIND", ko: "风", line: "毫无负担，涂上便忘记它的存在。" },
    { key: "water", name: "WATER", ko: "水", line: "遇汗遇水，依然服帖不脱落。" },
    { key: "stone", name: "STONE", ko: "石", line: "放在桌上也好看的、安静的物件。" },
  ],

  DAILY_SUNSCREEN: {
    slug: "daily-sunscreen",
    headline: "为一整天的活动而生的防晒",
    eyebrow: "FOR EVERY MOVEMENT",
    intro: "通勤路上、午间跑步、周末高尔夫、出门旅行。不必为了躲避阳光而停下脚步——这是一支让你在阳光下持续活动的日常防晒霜。",
    reason: {
      title: "先决定绝不妥协的地方，再挑选配方",
      body: "PAROS 没有重新研发配方。我们先用文档写下想要的肤感、不能放弃的条件，再据此筛选，达不到标准的配方即使条件再好也不采用。同样是现成配方，随手挑选和按标准挑选，结果截然不同。",
      link: { href: "/standard", label: "查看挑选标准" },
    },
    senses: [
      { key: "LIGHT", title: "轻盈不厚重", body: "低黏度、快速吸收，涂后残留油感降到最低。" },
      { key: "COMFORT", title: "运动时依然舒适", body: "遇汗与摩擦不移位，不紧绷。" },
      { key: "PROTECTION", title: "抵御阳光与日常", body: "SPF50+ / PA++++。持久防水配方，遇水遇汗仍保持防护力。" },
      { key: "RESET", title: "活动后重新整理的感觉", body: "补涂时不结块，自然补妆。" },
    ],
    scenes: [
      { time: "07:30", title: "通勤路上", body: "出门前涂一次，到午饭前都无需在意。" },
      { time: "12:10", title: "午间跑步", body: "汗水流下也不该流进眼睛刺痛。" },
      { time: "15:00", title: "周末高尔夫", body: "18 洞中间补涂一次，手上不留残余。" },
      { time: "17:40", title: "冲浪 · 戏水", body: "出水后用毛巾擦干，再涂一次。" },
      { time: "旅行", title: "陌生城市的一天", body: "不会在包里漏的翻盖设计，一支就够。" },
    ],
    specs: [
      { label: "防晒指数", value: "SPF50+ / PA++++" },
      { label: "防水性", value: "持久防水配方", note: "取得检测报告后确定最终标注。" },
      { label: "质地", value: "以有机防晒剂为主的混合型乳液" },
      { label: "妆效", value: "半哑光至自然" },
      { label: "肤色", value: "不提亮 · 无泛白", note: "男女通用设计" },
      { label: "香味", value: "无香" },
      { label: "眼部刺激", value: "以不刺痛为标准筛选", note: "筛选的首要条件" },
      { label: "容量 · 包装", value: "50ml 软管 · 翻盖" },
      { label: "使用部位", value: "面部及颈部" },
      { label: "筛选标准", value: "不含二苯酮-3 与甲氧基肉桂酸乙基己酯；通过不致粉刺与皮肤刺激测试的配方" },
    ],
    ingredientsNote: "全成分将在配方最终确定后公布，同时公开韩文·英文全成分及防晒剂含量。",
    usage: {
      title: "涂对了，才能得到标注的防护力",
      steps: [
        { step: "01", title: "用量", body: "面部与颈部约两指节的量。一次涂太多可能泛白，分两次涂抹。" },
        { step: "02", title: "时机", body: "出门前 15 分钟。按额头、颧骨、鼻子、下巴的顺序推开，延伸至颈部。" },
        { step: "03", title: "补涂", body: "每 2 小时一次，大量出汗或接触水后也要补涂。先用毛巾轻拍吸干水分，再涂。" },
      ],
      reapplyLine: "补涂不是特别的举动，而是习惯。MOVE. SWEAT. REAPPLY.",
    },
    purchaseNotes: [
      "运费 ₩3,000。满 ₩50,000 免运费。会员首单免运费。",
      "两支装仅在本店销售，每支 ₩28,000。",
      "未开封产品可在收货后 7 天内退货。开封后除产品瑕疵外不予退货。",
      "确认付款后 1–3 个工作日内发货。",
    ],
    reviewIntro: "我们把跑步、登山、冲浪等真实使用场景的评价单独整理出来展示。",
  },
  CAMPAIGN_STORY: {
    eyebrow: "A DAY IN MOTION",
    title: "活动之人的一天",
    steps: [
      { key: "SUN", body: "走向有阳光的地方。" },
      { key: "MOVE", body: "走、跑、攀登。" },
      { key: "SWEAT", body: "汗水流下，脸上依然服帖。" },
      { key: "WATER", body: "遇见水，依然还在。" },
      { key: "RESET", body: "擦干，再涂。一天继续。" },
    ],
  },
  PROBLEM: {
    eyebrow: "WHY",
    title: "一出汗，大多数防晒霜就垮了",
    points: ["从额头流下的防晒霜进入眼睛，刺痛。", "被汗推开留下痕迹，一擦就没了。", "补涂时结块，手上留下油腻。"],
    close: "日常防晒防水弱，防水型又厚重或泛白。PAROS 从这两者之间的空白开始。",
  },
  CATALOG: {
    products: {
      "daily-sunscreen": { subtitle: "为一整天的活动而生的日常防晒霜 50ml", description: "SPF50+ / PA++++。无香、不提亮。先决定绝不妥协之处再挑选的配方。", launchLabel: "2027 上半年上市" },
      mini: { subtitle: "可夹在手机壳上的便携补涂装", description: "补涂要能随身携带才成立。跑步或户外时无需背包也能带上的扁平设计。", launchLabel: "预计 2028 上半年" },
      "after-care": { subtitle: "活动后护理 — 洗发水 · 沐浴露", description: "洗去汗水的那一刻。弥补防晒季节性的全年产品线。", launchLabel: "2028 下半年以后" },
      deodorant: { subtitle: "活动中的气味管理", description: "与目标用户的使用场景最直接相关的品类，第三阶段后评估。", launchLabel: "第三阶段以后" },
    },
    variants: { "PAROS-DS-50-1": "单支 50ml", "PAROS-DS-50-2SET": "两支装（本店专享）" },
  },

  BRAND: {
    eyebrow: "AVORA LABS × PAROS",
    title: "AVORA LABS，一家打造品牌的公司",
    intro: "AVORA LABS 是两个人创立的品牌公司。我们没有生产设备。配方从代工厂的现成配方中挑选，只使用通过我们标准的那些。PAROS 是我们这样打造的第一个品牌。",
    company: {
      eyebrow: "COMPANY",
      title: "为什么不自己研发配方",
      body: [
        "从原料配比到临床测试，重新开发一款化妆品需要漫长的时间和成本。AVORA LABS 是两人团队，我们决定把时间用在建立并验证“什么才是好配方”的标准上，而不是配方研发。",
        "因此 PAROS 的配方并非全新研发，而是代工厂的现成配方。但我们并非随便挑选：先以文档确定肤感优先级，达不到标准的配方即使条件再好也不采用。",
      ],
      standardNote: { before: "这一过程完整公开在", link: { href: "/standard", label: "挑选标准页面" }, after: "。" },
    },
    movementCare: {
      eyebrow: "PHILOSOPHY",
      title: "MOVEMENT + CARE",
      body: "PAROS 把活动身体的时间和照顾身体的时间视为一体。我们做的不是让你运动表现更好的产品，而是帮你顺利度过被运动填满的一整天的产品。",
    },
    positioning: {
      eyebrow: "POSITIONING",
      title: "不是 SPORTS BEAUTY，而是 ACTIVE LIFESTYLE BEAUTY",
      body: "PAROS 不是为竞技表现设计的功能性运动产品，也不像跑鞋或运动服那样按项目划分。我们把任何身体活跃的人都需要的肤感标准，融入产品之中。",
    },
    target: {
      eyebrow: "TARGET",
      title: "不被单一项目定义的 20~30 岁人群",
      body: "跑步、健身、攀岩、冲浪、高尔夫、旅行。不是只属于某一项运动的人，而是在多种活动间穿梭、用行动填满一天的 20~30 岁成年人。不区分性别——这也是我们选择无香、不提亮配方的原因。",
    },
    principle: {
      eyebrow: "VISUAL PRINCIPLE",
      title: "Landscape → Lifestyle → Product",
      body: "PAROS 的所有影像都遵循这个顺序：先有风景，其中有活动的人，最后才是产品。产品镜头不超过整体的三分之一。",
      steps: [
        { key: "Landscape", body: "有光与空间的风景。不突出特定旅游地或异域背景。" },
        { key: "Lifestyle", body: "在那片风景中活动的人的动作与节奏。" },
        { key: "Product", body: "作为让活动成为可能的原因，安静地在最后出现。" },
      ],
    },
    dayFlow: {
      eyebrow: "A DAY IN MOTION",
      title: "SUN → MOVE → SWEAT → WATER → RESET",
      body: "PAROS 的路线图跟随这一天的流动：走进阳光、活动、出汗、遇水、重新整理，共五个阶段。现在从 SUN·MOVE 阶段的 Daily Sunscreen 开始。",
    },
    honesty: {
      eyebrow: "HONESTY",
      title: "我们不隐瞒的事",
      points: ["PAROS 是 AVORA LABS 的第一个品牌，我们不把它包装成老牌。", "配方不是全新研发，而是现成配方。但我们建立了标准再挑选。", "全成分将在配方最终确定后公开，不会先抛出确定前的估算值。"],
    },
  },

  STANDARD: {
    eyebrow: "HOW WE CHOOSE",
    title: "先定标准，再挑选",
    intro: "PAROS 的配方不是我们新创的。我们从代工厂已有的现成配方中，先以文档确定肤感标准，只采用通过标准的配方。本页完整公开该标准与评估过程。",
    why: {
      eyebrow: "WHY A STANDARD, NOT A NEW FORMULA",
      title: "为什么不重新研发配方",
      points: [
        "从零开发化妆品需要原料配比、稳定性试验、临床测试等漫长的时间和成本。我们选择从已经验证过的现成配方中挑选符合标准的那一个。",
        "但“现成配方”和“没有标准就挑的现成配方”不同。PAROS 先决定绝不放弃的肤感，达不到标准的配方即使条件再好也排除。",
        "我们相信差异不在配方本身，而在于挑选配方的标准，以及坚守标准的态度。",
      ],
    },
    priority: {
      eyebrow: "肤感优先级",
      title: "1~6，顺序有其理由",
      lede: "前两项是及格线。不满足这两项的配方，其他项目分数再高也淘汰。",
      items: [
        { rank: 1, title: "不刺眼", cutline: true, body: "随汗水流进眼睛也不能刺痛。" },
        { rank: 2, title: "不泛白", cutline: true, body: "刚涂完不泛白，时间久了也不泛白。" },
        { rank: 3, title: "不黏腻", cutline: false, body: "握器械或用手触碰东西时不碍事。" },
        { rank: 4, title: "服帖 · 不脱落", cutline: false, body: "遇汗与摩擦不移位。" },
        { rank: 5, title: "适合补涂", cutline: false, body: "叠涂时不结块、不搓泥，自然补妆。" },
        { rank: 6, title: "吸收速度", cutline: false, body: "涂完到进行下一个动作的时间要短。" },
      ],
    },
    criteria: {
      eyebrow: "配方筛选标准",
      title: "未通过以下条件的配方从候选中排除",
      items: ["持有 SPF/PA 检测报告的配方", "以有机防晒剂为主的混合配方", "不含二苯酮-3 与甲氧基肉桂酸乙基己酯（珊瑚友好取向）", "无香配方", "通过不致粉刺 · 皮肤刺激测试的配方", "黏度适合灌装 50ml 翻盖软管"],
    },
    evaluation: {
      eyebrow: "评估方式",
      title: "两人、盲测、同等条件",
      method: [
        { label: "评估者", body: "两位独立评估者各自打分，事后对照结果。" },
        { label: "盲测", body: "隐去厂商名与配方名进行评估。" },
        { label: "条件", body: "同一天、同一光线下比较。" },
        { label: "情境", body: "运动 30 分钟以上出汗后实际涂抹评估。" },
      ],
      scoringNote: "优先级 1~6 各有配分，换算为总分 100 分。",
      scoring: [
        { rank: 1, title: "不刺眼", points: 30 },
        { rank: 2, title: "不泛白", points: 25 },
        { rank: 3, title: "不黏腻", points: 15 },
        { rank: 4, title: "服帖 · 不脱落", points: 15 },
        { rank: 5, title: "适合补涂", points: 10 },
        { rank: 6, title: "吸收速度", points: 5 },
      ],
    },
    closing: "这一标准同样适用于今后所有 PAROS 产品。标准若有变化，本页会连同变更理由一起更新。",
  },

  FAQ_GROUPS: [
    {
      key: "product",
      title: "产品",
      items: [
        { q: "容量是多少？", a: "单一规格 50ml 软管（翻盖），用于面部和颈部。" },
        { q: "有香味吗？", a: "无香，不添加香料。" },
        { q: "涂后会提亮或泛白吗？", a: "不提亮配方，并且按不泛白的标准筛选。" },
        { q: "进眼睛会刺痛吗？", a: "“不刺眼”是我们挑选配方时必须首先通过的标准。详情见挑选标准页面。" },
        { q: "怎么补涂？", a: "每 2 小时，以及大量出汗或接触水后再涂。先用毛巾轻拍吸干水分再涂就不会结块。" },
        { q: "全成分什么时候公开？", a: "配方最终确定后，将同时公布韩文·英文全成分及防晒剂含量。" },
        { q: "男女都能用吗？", a: "可以。无香、不提亮的设计不分性别。" },
      ],
    },
    {
      key: "shipping",
      title: "订单 · 配送",
      items: [
        { q: "运费多少？", a: "₩3,000。满 ₩50,000 免运费，会员首单免运费。" },
        { q: "下单后多久发货？", a: "确认付款后 1–3 个工作日内发货。" },
        { q: "使用哪家快递？", a: "默认使用 CJ 大韩通运。目前仅配送韩国境内。" },
      ],
    },
    {
      key: "returns",
      title: "退换货",
      items: [
        { q: "退货期限是多久？", a: "未开封状态下，收货后 7 天内可退货。" },
        { q: "开封后能退货吗？", a: "化妆品的特性决定开封后仅限产品瑕疵可退换。" },
        { q: "因产品瑕疵退货，运费谁承担？", a: "因产品瑕疵产生的退换货，往返运费由品牌承担。" },
      ],
    },
    {
      key: "payment",
      title: "支付",
      items: [
        { q: "支持哪些支付方式？", a: "通过 Toss Payments 支付组件支持银行卡等多种方式。价格以韩元（KRW）计。" },
        { q: "不注册能下单吗？", a: "可以，支持非会员下单。" },
        { q: "非会员如何查询订单？", a: "在非会员订单查询页面输入订单号和邮箱即可。" },
      ],
    },
    {
      key: "brand",
      title: "品牌",
      items: [
        { q: "PAROS 是新品牌吗？", a: "是的。PAROS 是 AVORA LABS 打造的第一个品牌。" },
        { q: "配方是自己研发的吗？", a: "不是。我们从代工厂的现成配方中挑选了通过我们标准的配方。标准公开在挑选标准页面。" },
        { q: "参加过众筹，有回购优惠吗？", a: "众筹支持者随奖励收到了专属回购码（WITHPAROS），结算时输入即可使用。" },
      ],
    },
  ],

  legalNotice: "本译文仅供参考，以韩文原文为准。",
  SHIPPING_RETURNS_POLICY: en.SHIPPING_RETURNS_POLICY,
  TERMS_POLICY: en.TERMS_POLICY,
  PRIVACY_POLICY: en.PRIVACY_POLICY,
};
