import type { Content } from "./index";

/**
 * English content. Same shape as the Korean source (src/content/ko). Legal pages are translated for reference;
 * the Korean text is the binding version (legalNotice).
 */
export const en: Content = {
  NAV: [
    { href: "/shop", label: "Products" },
    { href: "/brand", label: "Brand" },
    { href: "/standard", label: "Standard" },
    { href: "/faq", label: "FAQ" },
  ],
  FOOTER_LINKS: {
    shop: [
      { href: "/products/daily-sunscreen", label: "Daily Sunscreen" },
      { href: "/shop", label: "Roadmap" },
      { href: "/notify", label: "Launch alerts" },
    ],
    brand: [
      { href: "/brand", label: "AVORA LABS · PAROS" },
      { href: "/standard", label: "How we choose" },
      { href: "https://www.instagram.com/avora_labs", label: "Instagram", external: true },
    ],
    help: [
      { href: "/faq", label: "FAQ" },
      { href: "/policy/shipping-returns", label: "Shipping · Returns" },
      { href: "/orders/lookup", label: "Guest order lookup" },
    ],
    legal: [
      { href: "/policy/terms", label: "Terms of Service" },
      { href: "/policy/privacy", label: "Privacy Policy" },
    ],
  },
  TAGLINES: {
    primary: "FOR EVERY MOVEMENT",
    secondary: "MOVE. SWEAT. REAPPLY.",
    tertiary: "MOVE FREELY. CARE GENTLY.",
    company: "We create brands for people in motion.",
  },
  DAY_FLOW: ["SUN", "MOVE", "SWEAT", "WATER", "RESET"],
  BRAND_CODES: [
    { key: "light", name: "LIGHT", ko: "Light", line: "We don't hide from the sun. We keep moving under it." },
    { key: "wind", name: "WIND", ko: "Wind", line: "Never heavy. A finish you forget the moment it's on." },
    { key: "water", name: "WATER", ko: "Water", line: "Stays put through sweat and water." },
    { key: "stone", name: "STONE", ko: "Stone", line: "A quiet object you'd happily leave on your desk." },
  ],

  DAILY_SUNSCREEN: {
    slug: "daily-sunscreen",
    headline: "Sun care for a whole day in motion",
    eyebrow: "FOR EVERY MOVEMENT",
    intro:
      "The commute, a lunchtime run, a weekend round, a trip abroad. A daily sunscreen that lets you keep moving in the sun instead of stopping to avoid it.",
    reason: {
      title: "A formula chosen by deciding first what we would never give up",
      body: "PAROS did not develop a new formula. Instead we wrote down what the product had to feel like and what we could not compromise on, then rejected any formula that fell short of that standard, however attractive it looked otherwise. Two off-the-shelf formulas can be worlds apart depending on whether they were picked at random or against a standard.",
      link: { href: "/standard", label: "See how we choose" },
    },
    senses: [
      { key: "LIGHT", title: "Feels light on the skin", body: "Low viscosity, fast absorption. Minimal residual oil after application." },
      { key: "COMFORT", title: "Comfortable while you move", body: "Doesn't slide with sweat or friction, and doesn't feel tight." },
      { key: "PROTECTION", title: "Protection from sun and everyday life", body: "SPF50+ / PA++++. A very water-resistant formula that keeps protecting through water and sweat." },
      { key: "RESET", title: "Feels put back together after activity", body: "Reapplies smoothly without pilling or patchiness." },
    ],
    scenes: [
      { time: "07:30", title: "The commute", body: "Apply once on the way out and forget about it until lunch." },
      { time: "12:10", title: "Lunchtime run", body: "Sweat shouldn't run into your eyes and sting." },
      { time: "15:00", title: "Weekend round of golf", body: "Once between holes. Reapply without leaving anything on your hands." },
      { time: "17:40", title: "Surfing · in the water", body: "Out of the water, a quick towel-off, and back on." },
      { time: "Travel", title: "A day in an unfamiliar city", body: "A flip-top that won't leak in your bag. One tube is enough." },
    ],
    specs: [
      { label: "UV protection", value: "SPF50+ / PA++++" },
      { label: "Water resistance", value: "Very water-resistant formula", note: "Final wording will be confirmed once test reports are in hand." },
      { label: "Texture", value: "Organic-filter-based hybrid lotion · milk type" },
      { label: "Finish", value: "Semi-matte to natural" },
      { label: "Tone", value: "No tone-up · no white cast", note: "Designed for all genders" },
      { label: "Fragrance", value: "Fragrance-free" },
      { label: "Eye irritation", value: "Selected on a sting-free basis", note: "Our first selection criterion" },
      { label: "Size · packaging", value: "50 ml tube · flip-top cap" },
      { label: "Where to use", value: "Face and neck" },
      { label: "Selection criteria", value: "No oxybenzone or octinoxate; non-comedogenic and skin-irritation tested formula" },
    ],
    ingredientsNote:
      "The full ingredient list will be published once the formula is finalised, in Korean and English, together with the UV filter concentrations.",
    usage: {
      title: "You only get the labelled protection if you apply it properly",
      steps: [
        { step: "01", title: "Amount", body: "Two finger-lengths for face and neck. Applying too much at once can leave a white cast, so split it into two layers." },
        { step: "02", title: "Timing", body: "15 minutes before heading out. Spread across forehead, cheeks, nose and chin, then continue down the neck." },
        { step: "03", title: "Reapply", body: "Every two hours, and after heavy sweating or contact with water. Pat dry with a towel first, then reapply." },
      ],
      reapplyLine: "Reapplying isn't a special act. It's a habit. MOVE. SWEAT. REAPPLY.",
    },
    purchaseNotes: [
      "Shipping is ₩3,000. Free shipping on orders of ₩50,000 or more. Members get free shipping on their first order.",
      "The 2-pack is sold only on this store: ₩28,000 per tube.",
      "Unopened products can be returned within 7 days of delivery. Once opened, returns are limited to product defects.",
      "Orders ship within 1–3 business days after payment is confirmed.",
    ],
    reviewIntro: "We collect reviews from real situations — running, hiking, surfing — and show them separately.",
  },
  CAMPAIGN_STORY: {
    eyebrow: "A DAY IN MOTION",
    title: "A day in the life of someone who moves",
    steps: [
      { key: "SUN", body: "Head out into the sun." },
      { key: "MOVE", body: "Walk, run, climb." },
      { key: "SWEAT", body: "Sweat runs. It stays on your face." },
      { key: "WATER", body: "Meet water. It's still there." },
      { key: "RESET", body: "Wipe, reapply. The day goes on." },
    ],
  },
  PROBLEM: {
    eyebrow: "WHY",
    title: "The moment you sweat, most sunscreens fall apart",
    points: [
      "Sunscreen runs down from your forehead into your eyes and stings.",
      "It slides with sweat, streaks, and disappears when you wipe.",
      "Reapplying leaves clumps on your face and oil on your hands.",
    ],
    close: "Daily sunscreens are weak against water; waterproof ones feel heavy or turn white. PAROS starts in the gap between them.",
  },
  CATALOG: {
    products: {
      "daily-sunscreen": {
        subtitle: "A daily sunscreen for a whole day in motion, 50 ml",
        description: "SPF50+ / PA++++. Fragrance-free, no tone-up. A formula chosen by first deciding what we would never give up.",
        launchLabel: "Launching first half of 2027",
      },
      mini: {
        subtitle: "A pocket reapply size that clips onto your phone case",
        description: "Reapplying only works if you can carry it. A flat form you take running or outdoors without a bag.",
        launchLabel: "Planned for first half of 2028",
      },
      "after-care": {
        subtitle: "After-activity care — shampoo · body wash",
        description: "The moment you wash off the sweat. A year-round line that balances the seasonality of sun care.",
        launchLabel: "Second half of 2028 or later",
      },
      deodorant: {
        subtitle: "Odour care while you move",
        description: "The item most directly tied to how our customers spend their days. Under review after stage 3.",
        launchLabel: "After stage 3",
      },
    },
    variants: {
      "PAROS-DS-50-1": "Single 50 ml",
      "PAROS-DS-50-2SET": "2-pack (store exclusive)",
    },
  },

  BRAND: {
    eyebrow: "AVORA LABS × PAROS",
    title: "AVORA LABS, a company that builds brands",
    intro:
      "AVORA LABS is a brand company founded by two people. We don't own manufacturing facilities. Our formulas are chosen from a contract manufacturer's existing formulas, and only the ones that pass our standard are used. PAROS is the first brand we built that way.",
    company: {
      eyebrow: "COMPANY",
      title: "Why we didn't develop our own formula",
      body: [
        "Developing a cosmetic from scratch takes a long time and a lot of money, from raw-material blending to clinical testing. AVORA LABS is a team of two. We chose to spend that time not on formula development, but on defining and verifying what makes a formula good.",
        "So PAROS uses an existing formula from a contract manufacturer rather than a newly developed one. But we didn't pick just any formula. We wrote down our priorities for how the product should feel first, and rejected anything that fell short of that standard no matter how good the terms were.",
      ],
      standardNote: {
        before: "That process is published in full on the",
        link: { href: "/standard", label: "How we choose page" },
        after: ".",
      },
    },
    movementCare: {
      eyebrow: "PHILOSOPHY",
      title: "MOVEMENT + CARE",
      body: "PAROS sees the time you spend moving your body and the time you spend caring for it as one. We don't make products that make you better at sport. We make products that help a day filled with movement pass without friction.",
    },
    positioning: {
      eyebrow: "POSITIONING",
      title: "ACTIVE LIFESTYLE BEAUTY, not SPORTS BEAUTY",
      body: "PAROS isn't a functional sports product built for performance. We don't design by discipline the way running shoes or sportswear do. Instead we build in the standards of feel that anyone with a physically active day needs, regardless of the activity.",
    },
    target: {
      eyebrow: "TARGET",
      title: "People in their 20s and 30s who aren't defined by one sport",
      body: "Running, gym, climbing, surfing, golf, travel. Not people who belong to a single sport, but adults in their 20s and 30s who move between many activities and fill their days with movement. We don't separate by gender, which is also why we chose a fragrance-free, no-tone-up formula.",
    },
    principle: {
      eyebrow: "VISUAL PRINCIPLE",
      title: "Landscape → Lifestyle → Product",
      body: "Every PAROS image follows this order. The landscape comes first, then the person moving through it, and the product last. Product shots never exceed a third of the whole.",
      steps: [
        { key: "Landscape", body: "A landscape with light and space. No landmark tourism, no exotic backdrops." },
        { key: "Lifestyle", body: "The actions and rhythm of a person moving through that landscape." },
        { key: "Product", body: "Appears quietly at the end, as the reason the movement was possible." },
      ],
    },
    dayFlow: {
      eyebrow: "A DAY IN MOTION",
      title: "SUN → MOVE → SWEAT → WATER → RESET",
      body: "The PAROS roadmap follows the flow of this day: going out into the sun, moving, sweating, meeting water, and resetting. We start with a single product, Daily Sunscreen, in the SUN·MOVE stage.",
    },
    honesty: {
      eyebrow: "HONESTY",
      title: "What we don't hide",
      points: [
        "PAROS is AVORA LABS's first brand. We don't dress it up as an old one.",
        "The formula isn't newly developed; it's an existing formula. But it was chosen against a standard.",
        "The full ingredient list will be published once the formula is final. We don't put estimates forward before then.",
      ],
    },
  },

  STANDARD: {
    eyebrow: "HOW WE CHOOSE",
    title: "We set the standard first, then choose",
    intro:
      "PAROS's formula isn't something we created. From the existing formulas our contract manufacturer already had, we first wrote down our standard for how the product should feel, then adopted only the formulas that passed it. This page publishes that standard and the evaluation process as they are.",
    why: {
      eyebrow: "WHY A STANDARD, NOT A NEW FORMULA",
      title: "Why we didn't create a new formula",
      points: [
        "Developing a cosmetic from scratch takes a long time and a lot of money: raw-material blending, stability testing, clinical work. We chose instead to pick a formula that met our standard from among already-proven existing ones.",
        "But an 'existing formula' and an 'existing formula chosen without a standard' are different things. PAROS decided first which qualities of feel we would never give up, and excluded any formula that fell short, however good its terms.",
        "We believe the difference lies not in the formula itself, but in the standard used to choose it and the discipline to keep to that standard.",
      ],
    },
    priority: {
      eyebrow: "PRIORITIES OF FEEL",
      title: "1 to 6, and the order matters",
      lede: "The first two are cut-off lines. A formula that failed either of them was rejected no matter how high it scored elsewhere.",
      items: [
        { rank: 1, title: "No eye sting", cutline: true, body: "Even when it runs with sweat into your eyes, it must not sting." },
        { rank: 2, title: "No white cast", cutline: true, body: "No white cast right after application, and none as time passes." },
        { rank: 3, title: "No stickiness", cutline: false, body: "Must not get in the way when you grip equipment or touch things." },
        { rank: 4, title: "Adhesion · no breakdown", cutline: false, body: "Must not slide out of place under sweat and friction." },
        { rank: 5, title: "Suited to reapplication", cutline: false, body: "Must retouch naturally when layered, without clumping or sliding." },
        { rank: 6, title: "Absorption speed", cutline: false, body: "The time from application to the next thing you do must be short." },
      ],
    },
    criteria: {
      eyebrow: "FORMULA SELECTION CRITERIA",
      title: "Formulas that failed these conditions were removed from the shortlist",
      items: [
        "Holds SPF/PA test reports",
        "Hybrid formula built mainly on organic UV filters",
        "No oxybenzone or octinoxate (reef-safe orientation)",
        "Fragrance-free",
        "Non-comedogenic and skin-irritation tested",
        "Viscosity suitable for filling a 50 ml flip-top tube",
      ],
    },
    evaluation: {
      eyebrow: "HOW WE EVALUATE",
      title: "Two people, blind, under the same conditions",
      method: [
        { label: "Evaluators", body: "Two independent evaluators score separately; results are compared afterwards." },
        { label: "Blind", body: "Manufacturer and formula names are hidden during evaluation." },
        { label: "Conditions", body: "Compared on the same day, under the same lighting." },
        { label: "Situation", body: "Applied and evaluated after 30+ minutes of exercise, while actually sweating." },
      ],
      scoringNote: "Priorities 1–6 each carry points, converted to a total of 100.",
      scoring: [
        { rank: 1, title: "No eye sting", points: 30 },
        { rank: 2, title: "No white cast", points: 25 },
        { rank: 3, title: "No stickiness", points: 15 },
        { rank: 4, title: "Adhesion · no breakdown", points: 15 },
        { rank: 5, title: "Suited to reapplication", points: 10 },
        { rank: 6, title: "Absorption speed", points: 5 },
      ],
    },
    closing:
      "This standard applies equally to every PAROS product to come. If the standard changes, this page changes with it, along with the reason.",
  },

  FAQ_GROUPS: [
    {
      key: "product",
      title: "Product",
      items: [
        { q: "What size is it?", a: "A single 50 ml tube with a flip-top cap. For face and neck." },
        { q: "Does it have a fragrance?", a: "It's fragrance-free. No perfume is added." },
        { q: "Does it brighten the skin or leave a white cast?", a: "It's a no-tone-up formula, and we selected it specifically to avoid a white cast." },
        { q: "Will it sting if it gets in my eyes?", a: "No eye sting was the first criterion any formula had to pass. You can read the full standard on the How we choose page." },
        { q: "How do I reapply?", a: "Every two hours, and after heavy sweating or contact with water. Pat the water off with a towel first and it won't clump." },
        { q: "When will the full ingredient list be published?", a: "Once the formula is finalised, we'll publish the full ingredient list in Korean and English together with the UV filter concentrations." },
        { q: "Can anyone use it regardless of gender?", a: "Yes. It's designed fragrance-free and without tone-up so anyone can use it." },
      ],
    },
    {
      key: "shipping",
      title: "Orders · Shipping",
      items: [
        { q: "How much is shipping?", a: "₩3,000. Free on orders of ₩50,000 or more, and members get free shipping on their first order." },
        { q: "When does my order ship?", a: "Within 1–3 business days after payment is confirmed." },
        { q: "Which courier do you use?", a: "CJ Logistics by default. We currently ship within Korea." },
      ],
    },
    {
      key: "returns",
      title: "Exchanges · Returns",
      items: [
        { q: "How long do I have to return?", a: "Unopened products can be returned within 7 days of delivery." },
        { q: "Can I return an opened product?", a: "Because it's a cosmetic, once opened it can only be exchanged or returned for a product defect." },
        { q: "Who pays return shipping for a defective product?", a: "For exchanges or returns due to a product defect, the brand covers shipping both ways." },
      ],
    },
    {
      key: "payment",
      title: "Payment",
      items: [
        { q: "Which payment methods do you accept?", a: "Cards and other methods through the Toss Payments checkout widget. Prices are in Korean won (KRW)." },
        { q: "Can I order without an account?", a: "Yes. You can order as a guest." },
        { q: "How do I check a guest order?", a: "Enter your order number and email on the guest order lookup page." },
      ],
    },
    {
      key: "brand",
      title: "Brand",
      items: [
        { q: "Is PAROS a new brand?", a: "Yes. PAROS is the first brand created by AVORA LABS." },
        { q: "Did you develop the formula yourselves?", a: "No. We chose, from a contract manufacturer's existing formulas, the one that passed the standard we set. The standard is published on the How we choose page." },
        { q: "I backed the funding campaign. Is there a repurchase benefit?", a: "Backers received a dedicated repurchase code (WITHPAROS) with their reward. Enter it at checkout to apply it." },
      ],
    },
  ],

  legalNotice: "This translation is provided for reference. The Korean original is the legally binding version.",
  SHIPPING_RETURNS_POLICY: {
    title: "Shipping · Exchanges · Returns",
    updatedNote: "This policy may be improved without prior notice; changes are reflected on this page.",
    sections: [
      {
        title: "Shipping",
        body: [
          "Shipping is ₩3,000, and free on orders of ₩50,000 or more.",
          "Members are not charged shipping on their first order.",
          "Orders ship within 1–3 business days after payment is confirmed; orders paid before 14:00 on weekdays are targeted for same-day dispatch.",
          "We ship with CJ Logistics by default and currently deliver within Korea.",
          "If dispatch is delayed, we tell you the current status and expected arrival first, before listing reasons.",
        ],
      },
      {
        title: "Exchanges · Returns",
        body: [
          "Under the Act on Consumer Protection in Electronic Commerce, you may request a withdrawal (return) within 7 days of receiving the product.",
          "Because cosmetics are hygiene products, withdrawal may be limited once the product is opened. This is stated before payment.",
          "Exchanges or returns due to a defect in the product itself are accepted regardless of whether it has been opened, and the brand covers shipping both ways.",
          "Refunds are processed to the original payment method within 3–5 business days after the returned product is checked.",
        ],
      },
      {
        title: "If you have a skin reaction",
        body: [
          "If redness, itching, irritation or any other reaction occurs during use, stop using the product immediately and wash it off.",
          "On request we provide the full ingredient information for the product. Consult a dermatologist or other medical professional if needed.",
          "PAROS does not provide medical diagnosis or treatment decisions. If symptoms persist, please see a medical professional.",
        ],
      },
    ],
  },
  TERMS_POLICY: {
    title: "Terms of Service",
    updatedNote: "A summary of the standard e-commerce terms adapted for the PAROS store.",
    sections: [
      { title: "Article 1 Purpose", body: ["These terms set out the rights, obligations and conditions of use between AVORA LABS (the 'Company') and users of the PAROS store operated by the Company."] },
      {
        title: "Article 2 Definitions",
        list: [
          "'Store' means the online site the Company has set up so that goods can be traded.",
          "'User' means a member or non-member who accesses the store and uses the services the Company provides under these terms.",
          "'Member' means a person who has registered by providing personal information to the store and can continuously receive its information and use its services.",
        ],
      },
      {
        title: "Article 3 Membership",
        body: [
          "A user applies for membership by filling in the member information in the form set by the Company.",
          "The Company may restrict membership where there are reasonable grounds, such as use of a false name or another person's information.",
        ],
      },
      {
        title: "Article 4 Orders and payment",
        body: [
          "Users apply to purchase through the store by the methods provided, and the Company takes measures so that users can enter the necessary information accurately.",
          "Payment is made through the Toss Payments checkout widget, and non-members may also order.",
        ],
      },
      { title: "Article 5 Delivery", body: ["The Company specifies the delivery method, who bears the cost and the time required for the goods a user has ordered. Details follow the Shipping · Exchanges · Returns policy page."] },
      {
        title: "Article 6 Withdrawal and refunds",
        body: [
          "Users may withdraw from a purchase in accordance with applicable law.",
          "When the Company receives a withdrawal or refund request, it processes it within the procedure and period set by applicable law. Details follow the Shipping · Exchanges · Returns policy page.",
        ],
      },
      { title: "Article 7 Company's responsibility", body: ["The Company does not engage in acts prohibited by applicable law or these terms, and continually works so that users can use the service safely."] },
      {
        title: "Article 8 Dispute resolution",
        body: [
          "When the Company considers an opinion or complaint raised by a user to be justified, it handles it without delay; where handling is difficult, it explains the reason and schedule.",
          "Disputes between the Company and users are governed by applicable law, including the Act on Consumer Protection in Electronic Commerce.",
        ],
      },
    ],
  },
  PRIVACY_POLICY: {
    title: "Privacy Policy",
    updatedNote: "AVORA LABS manages users' personal information safely in accordance with applicable law.",
    sections: [
      {
        title: "1. Personal information we collect",
        list: [
          "On registration: email, name, password, mobile phone number",
          "On ordering: delivery address, recipient name and contact number, payment identification information",
          "In the course of using the service: history of consent to receive marketing information",
        ],
      },
      {
        title: "2. Purpose of collection and use",
        list: [
          "Identifying members and providing the service, processing orders and deliveries, responding to customer enquiries",
          "Notifying users who have consented of new product launches and brand news",
        ],
      },
      {
        title: "3. Retention and use period",
        list: [
          "Records on contracts or withdrawal: 5 years (E-Commerce Act)",
          "Records on payment and supply of goods: 5 years (E-Commerce Act)",
          "Records on consumer complaints or dispute handling: 3 years (E-Commerce Act)",
          "On membership withdrawal, personal information other than the statutory retention periods above is destroyed without delay.",
        ],
      },
      { title: "4. Outsourcing of processing", list: ["Payment processing: Toss Payments", "Product delivery: contracted courier (CJ Logistics by default)"] },
      {
        title: "5. Consent to and refusal of marketing information",
        body: ["Users may separately consent to receiving marketing information such as new product launches, and may refuse at any time via the unsubscribe link at the bottom of emails or through customer service."],
      },
      { title: "6. Users' rights", body: ["Users may view or correct their personal information at any time, and may request deletion by withdrawing their membership."] },
    ],
  },
};
