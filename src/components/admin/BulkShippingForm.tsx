"use client";

import { useActionState } from "react";
import { bulkShippingAction, type BulkShippingState } from "@/app/admin/orders/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage } from "@/components/ui/Field";

const initial: BulkShippingState = {};

/** 송장 CSV 일괄 등록 폼 (관리자 주문 목록). 결과는 적용·건너뜀·오류 행을 모두 보여준다. */
export function BulkShippingForm() {
  const [state, action] = useActionState(bulkShippingAction, initial);
  const r = state.result;
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="text-[13px] text-charcoal file:mr-3 file:rounded-full file:border file:border-line-2 file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-ink"
        />
        <SubmitButton size="sm" pendingLabel="등록 중…">
          송장 일괄 등록
        </SubmitButton>
      </div>
      <p className="text-[12px] leading-relaxed text-stone">
        CSV 헤더는 <code>orderNumber,carrier,trackingNumber</code> (carrier 를 비우면 CJ대한통운). UTF-8 로 저장, 2,000행·900KB 이하.
        <br />
        결제 완료·상품 준비 중 주문만 배송 중으로 바뀌고 송장 안내 알림이 예약됩니다. 평일 14:00 이전 결제분은 당일 출고 기준입니다.
      </p>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {r ? (
        <div className="space-y-2 text-[13px]">
          <FormMessage tone={r.errors.length > 0 ? "error" : "success"}>
            적용 {r.applied}건 · 건너뜀 {r.skipped.length}건 · 오류 {r.errors.length}건
            {r.parseErrors.length > 0 ? ` · 형식 오류 ${r.parseErrors.length}줄` : ""}
            {r.truncated > 0 ? ` · 상한 초과로 무시 ${r.truncated}줄` : ""}
          </FormMessage>
          {[...r.parseErrors.map((e) => ({ line: e.line, orderNumber: "", reason: e.reason })), ...r.skipped, ...r.errors].length > 0 ? (
            <ul className="max-h-64 overflow-y-auto rounded-md border border-line bg-white px-4 py-2 text-stone">
              {[...r.parseErrors.map((e) => ({ line: e.line, orderNumber: "", reason: e.reason })), ...r.skipped, ...r.errors].map((row, i) => (
                <li key={`${row.line}-${i}`} className="py-1">
                  <span className="font-mono text-[12px] text-stone-2">{row.line > 0 ? `${row.line}행` : "-"}</span>{" "}
                  {row.orderNumber ? <span className="font-mono text-ink">{row.orderNumber}</span> : null} {row.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
