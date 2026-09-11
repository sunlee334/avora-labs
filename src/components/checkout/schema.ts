import { z } from "zod";
import type { Messages } from "@/i18n/messages";
import { DELIVERY_MEMO_KEYS } from "@/lib/config";
import { zodFieldErrors } from "@/lib/forms";

export function normalizePhone(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/**
 * 주문서 입력값 규칙. 서버 액션과 클라이언트가 같은 규칙을 공유하고, 오류 문구는 현재 언어 사전에서 가져온다.
 * 배송 메모는 고정 선택지의 키(`DELIVERY_MEMO_KEYS`)만 받는다 — 언어와 무관한 키를 저장해야 창고에 한국어로 전달된다.
 */
export function buildCheckoutSchema(m: Messages) {
  const t = m.checkout.schema;
  const phone = z
    .string()
    .transform(normalizePhone)
    .refine((v) => /^01[0-9]{8,9}$/.test(v), { message: t.phone });
  const requiredText = (message: string, max = 60) => z.string().trim().min(1, { message }).max(max);

  return z.object({
    customerName: requiredText(t.customerName, 40),
    email: z.email({ message: t.email }).max(254),
    phone,

    recipientName: requiredText(t.recipientName, 40),
    recipientPhone: phone,
    postalCode: z.string().trim().regex(/^\d{5}$/, { message: t.postalCode }),
    address1: requiredText(t.address1, 200),
    address2: z.string().trim().max(120).default(""),
    deliveryMemo: z.enum(["", ...DELIVERY_MEMO_KEYS]).default(""),

    couponCode: z.string().trim().max(40).default(""),
    agreePurchase: z.literal(true, { message: t.agreePurchase }),
    smsOptIn: z.boolean().default(false),
  });
}

export type CheckoutSchema = ReturnType<typeof buildCheckoutSchema>;
export type CheckoutParsed = z.output<CheckoutSchema>;

/**
 * 폼이 들고 있는 값. `agreePurchase`는 체크 전에도 존재해야 하므로 boolean으로 두고,
 * 필수 동의 여부는 zod가 검증한다.
 */
export type CheckoutValues = Omit<z.input<CheckoutSchema>, "agreePurchase"> & {
  agreePurchase: boolean;
};

export type CheckoutFieldErrors = Partial<Record<keyof CheckoutValues, string>>;

/** zod 결과를 필드별 첫 메시지로 정리한다. */
export function toFieldErrors(error: z.ZodError): CheckoutFieldErrors {
  return zodFieldErrors(error) as CheckoutFieldErrors;
}
