"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage, Label, Select } from "@/components/ui/Field";
import { useLocale, useMessages } from "@/i18n/client";
import { fill, formatPrice } from "@/i18n/format";
import { CANCEL_REASON_KEYS } from "@/lib/config";

export interface CustomerCancelState {
  error?: string;
  success?: string;
}

/**
 * 고객 셀프 취소 폼. 출고 전(결제 완료·상품 준비 중) 주문만 대상이며, 서버 액션이 소유·상태를 다시 검증한다.
 * 회원(주문 id)과 비회원(주문번호+이메일) 양쪽에서 쓰므로 식별 값은 hidden 으로 넘긴다.
 */
export function CustomerCancelForm({
  action,
  hidden,
  totalKrw,
}: {
  action: (prev: CustomerCancelState, formData: FormData) => Promise<CustomerCancelState>;
  hidden: Record<string, string>;
  totalKrw: number;
}) {
  const locale = useLocale();
  const m = useMessages();
  const [state, formAction] = useActionState(action, {});

  if (state.success) {
    return <FormMessage tone="success">{state.success}</FormMessage>;
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-line bg-paper-2/60 p-5">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <h3 className="text-sm font-semibold text-ink">{m.customerCancel.title}</h3>
      <p className="text-[13px] leading-relaxed text-stone">
        {fill(m.customerCancel.body, { amount: formatPrice(totalKrw, locale) })}
      </p>
      <div>
        <Label htmlFor="cancel-reason">{m.customerCancel.reason}</Label>
        <Select id="cancel-reason" name="reason" defaultValue="change_of_mind">
          {CANCEL_REASON_KEYS.map((value) => (
            <option key={value} value={value}>
              {m.cancelReasons[value]}
            </option>
          ))}
        </Select>
      </div>
      <label className="flex items-start gap-2 text-[13px] leading-relaxed text-charcoal">
        <input type="checkbox" name="confirm" required className="mt-0.5 h-4 w-4 accent-ink" />
        <span>{m.customerCancel.confirm}</span>
      </label>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <SubmitButton variant="secondary" size="sm" pendingLabel={m.customerCancel.pending}>
        {m.customerCancel.submit}
      </SubmitButton>
    </form>
  );
}
