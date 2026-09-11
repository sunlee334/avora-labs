import type { Locale } from "@/i18n/config";
import { fill, formatPrice } from "@/i18n/format";

/**
 * 알림 템플릿. UI 문구 사전(src/i18n/messages)과 달리 이메일 본문이라 여기 둔다.
 * 한국어 문안은 제품기획안 10-3(재구매 메시지: 할인을 앞세우지 않고 소진 시점을 알려주는 정보 전달)에서 가져왔다.
 * th/vi/zh 는 영어로 보낸다 (검수된 번역이 생기면 추가).
 */
export type NotificationTemplate = "order_confirmed" | "shipped" | "review_request" | "repurchase_6w" | "repurchase_9w" | "season";

export type TemplatePayload = Record<string, string | number>;

const ACCOUNT_URL = "https://avoralabs.co/account";
const LOOKUP_URL = "https://avoralabs.co/orders/lookup";

type Copy = { subject: string; text: string };
type CopyTable = Record<NotificationTemplate, { ko: Copy; en: Copy }>;

/** 마케팅성 메시지(재구매·계절)에는 수신 설정 안내를 붙인다. 주문 확인·송장·리뷰 요청은 거래 안내라 붙이지 않는다. */
export const MARKETING_TEMPLATES: ReadonlySet<NotificationTemplate> = new Set(["repurchase_6w", "repurchase_9w", "season"]);

const COPY: CopyTable = {
  order_confirmed: {
    ko: {
      subject: "[PAROS] 주문이 접수되었습니다 ({orderNumber})",
      text: [
        "주문해 주셔서 감사합니다.",
        "",
        "주문번호: {orderNumber}",
        "결제 금액: {total}",
        "",
        "결제 확인 후 영업일 기준 1–3일 안에 출고됩니다. 발송되면 송장 번호를 다시 알려드립니다.",
        "주문 내역은 {lookupUrl} 에서 주문번호와 이메일로 확인하실 수 있습니다.",
      ].join("\n"),
    },
    en: {
      subject: "[PAROS] Order received ({orderNumber})",
      text: [
        "Thank you for your order.",
        "",
        "Order number: {orderNumber}",
        "Amount paid: {total}",
        "",
        "Orders ship within 1–3 business days after payment is confirmed. We will send the tracking number once it ships.",
        "You can look up your order at {lookupUrl} with the order number and email.",
      ].join("\n"),
    },
  },
  shipped: {
    ko: {
      subject: "[PAROS] 상품이 발송되었습니다 ({orderNumber})",
      text: [
        "주문하신 상품을 발송했습니다.",
        "",
        "주문번호: {orderNumber}",
        "택배사: {carrier}",
        "송장 번호: {trackingNumber}",
        "",
        "배송 조회는 택배사 사이트에서 송장 번호로 확인하실 수 있습니다.",
      ].join("\n"),
    },
    en: {
      subject: "[PAROS] Your order has shipped ({orderNumber})",
      text: [
        "Your order is on its way.",
        "",
        "Order number: {orderNumber}",
        "Carrier: {carrier}",
        "Tracking number: {trackingNumber}",
        "",
        "Track the parcel on the carrier's website with the tracking number.",
      ].join("\n"),
    },
  },
  review_request: {
    ko: {
      subject: "[PAROS] 3주 써 보신 소감을 들려주세요",
      text: [
        "받으신 지 3주가 지났습니다. 러닝이든 출근길이든, 실제로 움직이며 써 보신 느낌을 남겨 주시면 다음 구매자에게 가장 큰 도움이 됩니다.",
        "",
        "후기 남기기: {accountUrl} (주문 내역 > 후기 작성)",
        "",
        "제품이나 혜택을 제공받고 쓰신 후기라면 그 사실을 후기에 함께 표시해 주세요.",
      ].join("\n"),
    },
    en: {
      subject: "[PAROS] How has it held up after three weeks?",
      text: [
        "It has been three weeks since your order arrived. A few words about how it felt while you were actually moving helps the next buyer more than anything.",
        "",
        "Write a review: {accountUrl} (Orders > Write a review)",
        "",
        "If you received the product or a benefit for this review, please disclose it in the review.",
      ].join("\n"),
    },
  },
  repurchase_6w: {
    ko: {
      subject: "이제 절반쯤 남으셨을 거예요",
      text: [
        "하루 두 번 바르셨다면 지금쯤 튜브가 가벼워졌을 시점입니다.",
        "다 쓰고 나서 주문하면 며칠은 안 바르게 되더라고요. 미리 준비해두세요.",
        "",
        "https://avoralabs.co/products/daily-sunscreen",
      ].join("\n"),
    },
    en: {
      subject: "You are probably about halfway through",
      text: [
        "If you have been applying twice a day, the tube should be feeling lighter by now.",
        "Ordering only after it runs out usually means a few days without it. Keep the next one ready.",
        "",
        "https://avoralabs.co/en/products/daily-sunscreen",
      ].join("\n"),
    },
  },
  repurchase_9w: {
    ko: {
      subject: "다음 러닝까지 며칠 남으셨나요",
      text: [
        "2개를 함께 주문하시면 배송비 없이 받아보실 수 있습니다.",
        "",
        "https://avoralabs.co/products/daily-sunscreen",
      ].join("\n"),
    },
    en: {
      subject: "How many days until your next run?",
      text: ["Order the 2-pack and shipping is on us.", "", "https://avoralabs.co/en/products/daily-sunscreen"].join("\n"),
    },
  },
  season: {
    ko: {
      subject: "가을에도 자외선은 그대로입니다",
      text: [
        "여름이 지나면 선크림을 놓게 되지만, 자외선 차단은 계절과 무관합니다.",
        "",
        "https://avoralabs.co/products/daily-sunscreen",
      ].join("\n"),
    },
    en: {
      subject: "The sun does not take autumn off",
      text: [
        "Sunscreen tends to get dropped once summer ends, but UV protection has nothing to do with the season.",
        "",
        "https://avoralabs.co/en/products/daily-sunscreen",
      ].join("\n"),
    },
  },
};

const UNSUBSCRIBE_LINE = {
  ko: `\n\n— 이 안내는 마케팅 수신에 동의하신 분께만 보냅니다. 수신 설정: ${ACCOUNT_URL}`,
  en: `\n\n— You receive this because you opted in to marketing email. Manage preferences: ${ACCOUNT_URL}`,
};

export function renderTemplate(template: NotificationTemplate, locale: Locale, payload: TemplatePayload): Copy {
  const lang: "ko" | "en" = locale === "ko" ? "ko" : "en";
  const copy = COPY[template][lang];
  const vars: TemplatePayload = {
    accountUrl: ACCOUNT_URL,
    lookupUrl: LOOKUP_URL,
    ...payload,
  };
  // 금액은 숫자(원)로 받아 언어별로 표기한다.
  if (typeof vars.totalKrw === "number") vars.total = formatPrice(vars.totalKrw, locale);
  const subject = fill(copy.subject, vars);
  let text = fill(copy.text, vars);
  if (MARKETING_TEMPLATES.has(template)) text += UNSUBSCRIBE_LINE[lang];
  return { subject, text };
}
