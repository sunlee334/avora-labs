import type { Content } from "./index";
import { en } from "./en";

/** Nội dung tiếng Việt. Các trang chính sách dùng bản dịch tiếng Anh, bản gốc tiếng Hàn có hiệu lực pháp lý. */
export const vi: Content = {
  NAV: [
    { href: "/shop", label: "Sản phẩm" },
    { href: "/brand", label: "Thương hiệu" },
    { href: "/standard", label: "Tiêu chuẩn" },
    { href: "/faq", label: "Hỏi đáp" },
  ],
  FOOTER_LINKS: {
    shop: [
      { href: "/products/daily-sunscreen", label: "Daily Sunscreen" },
      { href: "/shop", label: "Lộ trình sản phẩm" },
      { href: "/notify", label: "Nhận thông báo ra mắt" },
    ],
    brand: [
      { href: "/brand", label: "AVORA LABS · PAROS" },
      { href: "/standard", label: "Cách chúng tôi chọn" },
      { href: "https://www.instagram.com/avora_labs", label: "Instagram", external: true },
    ],
    help: [
      { href: "/faq", label: "Câu hỏi thường gặp" },
      { href: "/policy/shipping-returns", label: "Giao hàng · Đổi trả" },
      { href: "/orders/lookup", label: "Tra cứu đơn khách vãng lai" },
    ],
    legal: [
      { href: "/policy/terms", label: "Điều khoản sử dụng" },
      { href: "/policy/privacy", label: "Chính sách bảo mật" },
    ],
  },
  TAGLINES: en.TAGLINES,
  DAY_FLOW: en.DAY_FLOW,
  BRAND_CODES: [
    { key: "light", name: "LIGHT", ko: "Ánh sáng", line: "Không né nắng. Tiếp tục chuyển động dưới nắng." },
    { key: "wind", name: "WIND", ko: "Gió", line: "Không nặng mặt. Thoa xong là quên luôn." },
    { key: "water", name: "WATER", ko: "Nước", line: "Bám da qua mồ hôi và nước." },
    { key: "stone", name: "STONE", ko: "Đá", line: "Một vật yên lặng, đặt trên bàn cũng đẹp." },
  ],

  DAILY_SUNSCREEN: {
    slug: "daily-sunscreen",
    headline: "Chống nắng cho trọn một ngày vận động",
    eyebrow: "FOR EVERY MOVEMENT",
    intro:
      "Đường đi làm, buổi chạy trưa, vòng golf cuối tuần, chuyến du lịch. Thay vì dừng lại để tránh nắng, đây là kem chống nắng hằng ngày giúp bạn tiếp tục vận động dưới nắng.",
    reason: {
      title: "Quyết định trước điều không bao giờ nhượng bộ, rồi mới chọn công thức",
      body: "PAROS không phát triển công thức mới. Chúng tôi viết ra trước cảm giác mong muốn và những gì không thể từ bỏ, rồi loại mọi công thức không đạt chuẩn dù điều kiện có tốt đến đâu. Cùng là công thức có sẵn, nhưng chọn ngẫu nhiên và chọn theo tiêu chuẩn cho kết quả rất khác nhau.",
      link: { href: "/standard", label: "Xem cách chúng tôi chọn" },
    },
    senses: [
      { key: "LIGHT", title: "Nhẹ, không bí da", body: "Độ nhớt thấp, thẩm thấu nhanh. Hạn chế tối đa dầu thừa sau khi thoa." },
      { key: "COMFORT", title: "Vận động vẫn dễ chịu", body: "Không trôi khi đổ mồ hôi hay ma sát, không căng da." },
      { key: "PROTECTION", title: "Bảo vệ khỏi nắng và đời thường", body: "SPF50+ / PA++++. Công thức chống nước lâu dài, giữ hiệu quả khi gặp nước và mồ hôi." },
      { key: "RESET", title: "Cảm giác gọn gàng trở lại sau vận động", body: "Thoa lại mượt, không vón cục." },
    ],
    scenes: [
      { time: "07:30", title: "Đường đi làm", body: "Thoa một lần trước khi ra khỏi nhà, không cần bận tâm đến trưa." },
      { time: "12:10", title: "Chạy bộ buổi trưa", body: "Mồ hôi chảy không được cay mắt." },
      { time: "15:00", title: "Golf cuối tuần", body: "Thoa lại một lần giữa 18 lỗ, tay không dính gì." },
      { time: "17:40", title: "Lướt sóng · chơi nước", body: "Lên bờ, lau khăn rồi thoa lại." },
      { time: "Du lịch", title: "Một ngày ở thành phố lạ", body: "Nắp bật không rò rỉ trong túi. Một tuýp là đủ." },
    ],
    specs: [
      { label: "Chỉ số chống nắng", value: "SPF50+ / PA++++" },
      { label: "Chống nước", value: "Công thức chống nước lâu dài", note: "Ghi nhãn cuối cùng sẽ được xác nhận sau khi có báo cáo kiểm nghiệm." },
      { label: "Kết cấu", value: "Lotion lai gốc màng lọc hữu cơ · dạng sữa" },
      { label: "Lớp nền", value: "Bán lì đến tự nhiên" },
      { label: "Tông màu", value: "Không nâng tông · không vệt trắng", note: "Thiết kế cho mọi giới" },
      { label: "Hương", value: "Không hương" },
      { label: "Kích ứng mắt", value: "Chọn theo tiêu chí không cay mắt", note: "Điều kiện tuyển chọn số 1" },
      { label: "Dung tích · bao bì", value: "Tuýp 50ml · nắp bật" },
      { label: "Vùng dùng", value: "Mặt và cổ" },
      { label: "Tiêu chí chọn", value: "Không oxybenzone, octinoxate; công thức không gây bít tắc lỗ chân lông (non-comedogenic), đã kiểm tra kích ứng da" },
    ],
    ingredientsNote: "Bảng thành phần đầy đủ sẽ được công bố sau khi công thức chốt, gồm bản tiếng Hàn và tiếng Anh cùng hàm lượng màng lọc UV.",
    usage: {
      title: "Thoa đúng cách mới đạt mức bảo vệ ghi trên nhãn",
      steps: [
        { step: "01", title: "Lượng", body: "Khoảng hai đốt ngón trỏ cho mặt và cổ. Thoa quá nhiều một lần có thể để lại vệt trắng, nên chia làm hai lớp." },
        { step: "02", title: "Thời điểm", body: "15 phút trước khi ra ngoài. Tán theo thứ tự trán, gò má, mũi, cằm rồi kéo xuống cổ." },
        { step: "03", title: "Thoa lại", body: "Mỗi 2 giờ, và sau khi đổ nhiều mồ hôi hoặc tiếp xúc với nước. Thấm khô bằng khăn trước rồi mới thoa lại." },
      ],
      reapplyLine: "Thoa lại không phải việc đặc biệt, mà là thói quen. MOVE. SWEAT. REAPPLY.",
    },
    purchaseNotes: [
      "Phí giao hàng ₩3,000. Miễn phí cho đơn từ ₩50,000. Thành viên được miễn phí giao hàng đơn đầu tiên.",
      "Bộ 2 tuýp chỉ bán tại cửa hàng này: ₩28,000/tuýp.",
      "Sản phẩm chưa mở có thể trả lại trong 7 ngày kể từ khi nhận. Sau khi mở, chỉ nhận trả khi sản phẩm lỗi.",
      "Giao hàng trong 1–3 ngày làm việc sau khi xác nhận thanh toán.",
    ],
    reviewIntro: "Chúng tôi tách riêng những đánh giá từ tình huống thật như chạy bộ, leo núi, lướt sóng để bạn dễ xem.",
  },
  CAMPAIGN_STORY: {
    eyebrow: "A DAY IN MOTION",
    title: "Một ngày của người luôn vận động",
    steps: [
      { key: "SUN", body: "Bước ra nơi có nắng." },
      { key: "MOVE", body: "Đi, chạy, leo." },
      { key: "SWEAT", body: "Mồ hôi chảy. Vẫn bám trên mặt." },
      { key: "WATER", body: "Gặp nước. Vẫn còn đó." },
      { key: "RESET", body: "Lau, thoa lại. Ngày tiếp tục." },
    ],
  },
  PROBLEM: {
    eyebrow: "WHY",
    title: "Khoảnh khắc đổ mồ hôi, hầu hết kem chống nắng đều sụp đổ",
    points: ["Kem chống nắng từ trán chảy vào mắt, cay xót.", "Bị mồ hôi đẩy loang lổ, lau là mất.", "Thoa lại thì vón cục, tay dính dầu."],
    close: "Kem chống nắng hằng ngày thì kém chống nước, loại chống nước thì nặng mặt hoặc trắng bệch. PAROS bắt đầu từ khoảng trống ở giữa.",
  },
  CATALOG: {
    products: {
      "daily-sunscreen": { subtitle: "Kem chống nắng hằng ngày cho trọn một ngày vận động, 50ml", description: "SPF50+ / PA++++. Không hương, không nâng tông. Công thức được chọn sau khi quyết định điều không nhượng bộ.", launchLabel: "Ra mắt nửa đầu 2027" },
      mini: { subtitle: "Bản bỏ túi kẹp vào ốp điện thoại để thoa lại", description: "Thoa lại chỉ khả thi khi mang theo được. Dáng dẹt, chạy bộ hay đi ngoài trời không cần túi.", launchLabel: "Dự kiến nửa đầu 2028" },
      "after-care": { subtitle: "Chăm sóc sau vận động — dầu gội · sữa tắm", description: "Khoảnh khắc rửa trôi mồ hôi. Dòng sản phẩm quanh năm bù cho tính mùa vụ của chống nắng.", launchLabel: "Từ nửa cuối 2028" },
      deodorant: { subtitle: "Kiểm soát mùi khi vận động", description: "Nhóm sản phẩm gắn trực tiếp nhất với bối cảnh sử dụng của khách hàng. Xem xét sau giai đoạn 3.", launchLabel: "Sau giai đoạn 3" },
    },
    variants: { "PAROS-DS-50-1": "Tuýp lẻ 50ml", "PAROS-DS-50-2SET": "Bộ 2 tuýp (chỉ tại cửa hàng)" },
  },

  BRAND: {
    eyebrow: "AVORA LABS × PAROS",
    title: "AVORA LABS, công ty xây dựng thương hiệu",
    intro: "AVORA LABS là công ty thương hiệu do hai người sáng lập. Chúng tôi không có nhà máy. Công thức được chọn từ các công thức có sẵn của nhà sản xuất gia công, và chỉ dùng những công thức vượt qua tiêu chuẩn của chúng tôi. PAROS là thương hiệu đầu tiên được tạo ra theo cách đó.",
    company: {
      eyebrow: "COMPANY",
      title: "Vì sao không tự phát triển công thức",
      body: [
        "Phát triển một mỹ phẩm từ đầu tốn rất nhiều thời gian và chi phí, từ phối nguyên liệu đến thử nghiệm lâm sàng. AVORA LABS là đội hai người. Chúng tôi chọn dành thời gian đó không phải cho việc phát triển công thức, mà cho việc xác lập và kiểm chứng tiêu chuẩn thế nào là công thức tốt.",
        "Vì vậy công thức của PAROS là công thức có sẵn của nhà gia công, không phải mới phát triển. Nhưng chúng tôi không chọn bừa. Thứ tự ưu tiên về cảm giác được viết thành văn bản trước, và công thức không đạt chuẩn bị loại dù điều kiện có tốt đến đâu.",
      ],
      standardNote: { before: "Toàn bộ quá trình đó được công khai tại", link: { href: "/standard", label: "trang Cách chúng tôi chọn" }, after: "." },
    },
    movementCare: {
      eyebrow: "PHILOSOPHY",
      title: "MOVEMENT + CARE",
      body: "PAROS xem thời gian vận động cơ thể và thời gian chăm sóc cơ thể là một. Chúng tôi không làm sản phẩm giúp bạn tập giỏi hơn, mà làm sản phẩm giúp một ngày đầy vận động trôi qua nhẹ nhàng.",
    },
    positioning: {
      eyebrow: "POSITIONING",
      title: "Không phải SPORTS BEAUTY mà là ACTIVE LIFESTYLE BEAUTY",
      body: "PAROS không phải sản phẩm thể thao chức năng vì thành tích thi đấu. Chúng tôi không thiết kế theo từng môn như giày chạy hay đồ thể thao. Thay vào đó, sản phẩm mang tiêu chuẩn cảm giác mà bất kỳ ai có một ngày vận động đều cần, bất kể môn nào.",
    },
    target: {
      eyebrow: "TARGET",
      title: "Người 20–30 tuổi không bị gói trong một môn",
      body: "Chạy bộ, gym, leo núi, lướt sóng, golf, du lịch. Không phải người thuộc về một môn duy nhất, mà là người trưởng thành 20–30 tuổi lấp đầy ngày bằng nhiều hoạt động. Chúng tôi không phân biệt giới tính — đó cũng là lý do chọn công thức không hương, không nâng tông.",
    },
    principle: {
      eyebrow: "VISUAL PRINCIPLE",
      title: "Landscape → Lifestyle → Product",
      body: "Mọi hình ảnh của PAROS đều theo thứ tự này: phong cảnh trước, con người chuyển động trong đó, và sản phẩm sau cùng. Ảnh sản phẩm không vượt quá một phần ba tổng thể.",
      steps: [
        { key: "Landscape", body: "Phong cảnh có ánh sáng và không gian. Không phô trương điểm du lịch hay bối cảnh ngoại lai." },
        { key: "Lifestyle", body: "Hành động và nhịp điệu của người đang chuyển động trong phong cảnh đó." },
        { key: "Product", body: "Xuất hiện lặng lẽ ở cuối, như lý do khiến chuyển động trở nên khả thi." },
      ],
    },
    dayFlow: {
      eyebrow: "A DAY IN MOTION",
      title: "SUN → MOVE → SWEAT → WATER → RESET",
      body: "Lộ trình của PAROS đi theo dòng chảy của một ngày: ra nắng, vận động, đổ mồ hôi, gặp nước, và sắp xếp lại — năm chặng. Hiện tại bắt đầu với một sản phẩm, Daily Sunscreen, ở chặng SUN·MOVE.",
    },
    honesty: {
      eyebrow: "HONESTY",
      title: "Những điều chúng tôi không giấu",
      points: ["PAROS là thương hiệu đầu tiên của AVORA LABS. Chúng tôi không tô vẽ nó thành thương hiệu lâu năm.", "Công thức không phải mới phát triển mà là công thức có sẵn. Nhưng được chọn theo tiêu chuẩn.", "Bảng thành phần đầy đủ sẽ công bố sau khi công thức chốt. Không đưa ra ước tính trước đó."],
    },
  },

  STANDARD: {
    eyebrow: "HOW WE CHOOSE",
    title: "Đặt tiêu chuẩn trước, rồi mới chọn",
    intro: "Công thức của PAROS không phải do chúng tôi tạo ra. Từ những công thức có sẵn của nhà gia công, chúng tôi viết tiêu chuẩn cảm giác thành văn bản trước và chỉ chọn công thức vượt qua. Trang này công khai nguyên vẹn tiêu chuẩn và quy trình đánh giá đó.",
    why: {
      eyebrow: "WHY A STANDARD, NOT A NEW FORMULA",
      title: "Vì sao không tạo công thức mới",
      points: [
        "Phát triển mỹ phẩm từ đầu cần phối nguyên liệu, thử độ ổn định, thử lâm sàng — rất nhiều thời gian và chi phí. Chúng tôi chọn cách lấy công thức đạt chuẩn từ những công thức đã được kiểm chứng.",
        "Nhưng 'công thức có sẵn' và 'công thức có sẵn chọn không theo tiêu chuẩn' là hai chuyện khác nhau. PAROS quyết định trước cảm giác nào không bao giờ từ bỏ, và loại công thức không đạt dù điều kiện tốt.",
        "Chúng tôi tin sự khác biệt không nằm ở công thức, mà ở tiêu chuẩn chọn công thức và thái độ giữ vững tiêu chuẩn ấy.",
      ],
    },
    priority: {
      eyebrow: "THỨ TỰ ƯU TIÊN VỀ CẢM GIÁC",
      title: "1–6, thứ tự có lý do",
      lede: "Hai mục đầu là ngưỡng loại. Công thức không đạt hai điều kiện này bị loại dù các mục khác điểm cao đến đâu.",
      items: [
        { rank: 1, title: "Không cay mắt", cutline: true, body: "Dù chảy theo mồ hôi vào mắt cũng không được cay." },
        { rank: 2, title: "Không vệt trắng", cutline: true, body: "Ngay sau khi thoa và cả khi để lâu đều không trắng bệch." },
        { rank: 3, title: "Không dính", cutline: false, body: "Không vướng khi cầm dụng cụ hay chạm vào đồ vật." },
        { rank: 4, title: "Bám da · không trôi", cutline: false, body: "Không xê dịch khi đổ mồ hôi và ma sát." },
        { rank: 5, title: "Phù hợp thoa lại", cutline: false, body: "Thoa chồng không vón cục, không trôi, tự nhiên." },
        { rank: 6, title: "Tốc độ thẩm thấu", cutline: false, body: "Thời gian từ khi thoa đến việc tiếp theo phải ngắn." },
      ],
    },
    criteria: {
      eyebrow: "TIÊU CHÍ CHỌN CÔNG THỨC",
      title: "Công thức không qua các điều kiện này bị loại khỏi danh sách",
      items: ["Có báo cáo kiểm nghiệm SPF/PA", "Công thức lai với màng lọc hữu cơ là chính", "Không oxybenzone, octinoxate (hướng thân thiện với rạn san hô)", "Không hương", "Không gây bít tắc lỗ chân lông (non-comedogenic) · đã kiểm tra kích ứng da", "Độ nhớt phù hợp để đóng tuýp 50ml nắp bật"],
    },
    evaluation: {
      eyebrow: "CÁCH ĐÁNH GIÁ",
      title: "Hai người, đánh giá mù, cùng điều kiện",
      method: [
        { label: "Người đánh giá", body: "Hai người độc lập chấm riêng, đối chiếu kết quả sau." },
        { label: "Đánh giá mù", body: "Che tên nhà sản xuất và tên công thức." },
        { label: "Điều kiện", body: "So sánh cùng ngày, dưới cùng ánh sáng." },
        { label: "Tình huống", body: "Thoa và đánh giá thật khi đã tập trên 30 phút, đang đổ mồ hôi." },
      ],
      scoringNote: "Ưu tiên 1–6 có điểm riêng, quy về tổng 100 điểm.",
      scoring: [
        { rank: 1, title: "Không cay mắt", points: 30 },
        { rank: 2, title: "Không vệt trắng", points: 25 },
        { rank: 3, title: "Không dính", points: 15 },
        { rank: 4, title: "Bám da · không trôi", points: 15 },
        { rank: 5, title: "Phù hợp thoa lại", points: 10 },
        { rank: 6, title: "Tốc độ thẩm thấu", points: 5 },
      ],
    },
    closing: "Tiêu chuẩn này áp dụng như nhau cho mọi sản phẩm PAROS sau này. Nếu tiêu chuẩn thay đổi, trang này sẽ đổi theo cùng với lý do.",
  },

  FAQ_GROUPS: [
    {
      key: "product",
      title: "Sản phẩm",
      items: [
        { q: "Dung tích bao nhiêu?", a: "Một cỡ duy nhất: tuýp 50ml nắp bật. Dùng cho mặt và cổ." },
        { q: "Có mùi hương không?", a: "Không hương. Không thêm hương liệu." },
        { q: "Thoa lên có sáng da hay trắng bệch không?", a: "Công thức không nâng tông, và được chọn theo tiêu chí không để lại vệt trắng." },
        { q: "Vào mắt có cay không?", a: "Không cay mắt là tiêu chuẩn đầu tiên mà mọi công thức phải vượt qua. Xem chi tiết ở trang Cách chúng tôi chọn." },
        { q: "Thoa lại thế nào?", a: "Mỗi 2 giờ, và sau khi đổ nhiều mồ hôi hoặc gặp nước. Thấm khô bằng khăn trước rồi thoa lại sẽ không vón cục." },
        { q: "Khi nào công bố bảng thành phần?", a: "Sau khi công thức chốt, chúng tôi công bố bảng thành phần tiếng Hàn và tiếng Anh cùng hàm lượng màng lọc UV." },
        { q: "Nam nữ đều dùng được chứ?", a: "Được. Thiết kế không hương, không nâng tông để mọi giới đều dùng." },
      ],
    },
    {
      key: "shipping",
      title: "Đặt hàng · Giao hàng",
      items: [
        { q: "Phí giao hàng bao nhiêu?", a: "₩3,000. Miễn phí cho đơn từ ₩50,000, và thành viên được miễn phí đơn đầu tiên." },
        { q: "Sau khi đặt bao lâu thì giao?", a: "Trong 1–3 ngày làm việc sau khi xác nhận thanh toán." },
        { q: "Dùng đơn vị vận chuyển nào?", a: "Mặc định là CJ Logistics. Hiện chỉ giao trong Hàn Quốc." },
      ],
    },
    {
      key: "returns",
      title: "Đổi · Trả",
      items: [
        { q: "Được trả hàng trong bao lâu?", a: "Sản phẩm chưa mở có thể trả trong 7 ngày kể từ khi nhận." },
        { q: "Đã mở có trả được không?", a: "Do đặc thù mỹ phẩm, sau khi mở chỉ đổi/trả khi sản phẩm lỗi." },
        { q: "Trả hàng do lỗi thì ai chịu phí vận chuyển?", a: "Đổi/trả do lỗi sản phẩm, thương hiệu chịu phí vận chuyển hai chiều." },
      ],
    },
    {
      key: "payment",
      title: "Thanh toán",
      items: [
        { q: "Hỗ trợ phương thức thanh toán nào?", a: "Thẻ và nhiều phương thức khác qua cổng Toss Payments. Giá tính bằng won Hàn Quốc (KRW)." },
        { q: "Không đăng ký có đặt hàng được không?", a: "Được. Bạn có thể đặt hàng với tư cách khách vãng lai." },
        { q: "Khách vãng lai xem đơn hàng thế nào?", a: "Nhập mã đơn và email tại trang tra cứu đơn khách vãng lai." },
      ],
    },
    {
      key: "brand",
      title: "Thương hiệu",
      items: [
        { q: "PAROS là thương hiệu mới?", a: "Đúng. PAROS là thương hiệu đầu tiên do AVORA LABS tạo ra." },
        { q: "Các bạn tự phát triển công thức?", a: "Không. Chúng tôi chọn từ công thức có sẵn của nhà gia công những công thức vượt qua tiêu chuẩn của mình. Tiêu chuẩn được công khai ở trang Cách chúng tôi chọn." },
        { q: "Tôi đã ủng hộ gây quỹ, có ưu đãi mua lại không?", a: "Người ủng hộ nhận mã mua lại riêng (WITHPAROS) kèm phần thưởng. Nhập mã khi thanh toán để áp dụng." },
      ],
    },
  ],

  legalNotice: "Bản dịch này chỉ để tham khảo. Bản gốc tiếng Hàn có hiệu lực pháp lý.",
  SHIPPING_RETURNS_POLICY: en.SHIPPING_RETURNS_POLICY,
  TERMS_POLICY: en.TERMS_POLICY,
  PRIVACY_POLICY: en.PRIVACY_POLICY,
};
