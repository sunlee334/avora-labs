"use client";

import { useState, useTransition } from "react";
import { removeCartLineAction, updateCartQtyAction } from "@/app/[locale]/(store)/cart/actions";
import { useMessages } from "@/i18n/client";
import { MAX_QTY_PER_LINE } from "@/lib/config";

/** 장바구니 한 줄의 수량 조절·삭제. 서버 액션 결과 메시지를 그 자리에 표시한다. */
export function CartLineControls({
  lineId,
  qty,
  max,
}: {
  lineId: number;
  qty: number;
  max: number;
}) {
  const m = useMessages();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const ceiling = Math.min(MAX_QTY_PER_LINE, Math.max(1, max));

  function change(next: number) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateCartQtyAction(lineId, next);
      if (!result.ok) setMessage(result.message);
    });
  }

  function remove() {
    setMessage(null);
    startTransition(async () => {
      const result = await removeCartLineAction(lineId);
      if (!result.ok) setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center rounded-full border border-line-2 bg-white">
          <button
            type="button"
            onClick={() => change(qty - 1)}
            disabled={pending || qty <= 1}
            aria-label={m.product.purchase.decrease}
            className="flex h-9 w-9 items-center justify-center rounded-l-full text-lg text-charcoal transition hover:bg-paper-2 disabled:opacity-35"
          >
            −
          </button>
          <span className="w-9 text-center text-sm tabular-nums" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => change(qty + 1)}
            disabled={pending || qty >= ceiling}
            aria-label={m.product.purchase.increase}
            className="flex h-9 w-9 items-center justify-center rounded-r-full text-lg text-charcoal transition hover:bg-paper-2 disabled:opacity-35"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="text-[13px] text-stone underline underline-offset-4 transition hover:text-ink disabled:opacity-50"
        >
          {m.cart.remove}
        </button>
      </div>
      {message ? (
        <p role="alert" className="text-[12px] text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
