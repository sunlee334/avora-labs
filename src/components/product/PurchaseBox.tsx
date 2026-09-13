"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addToCartAction } from "@/app/[locale]/(store)/cart/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/Field";
import { useLocale, useMessages } from "@/i18n/client";
import { localizePath } from "@/i18n/config";
import { fill, formatPrice } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { track } from "@/lib/analytics";
import { MAX_QTY_PER_LINE, SALES_OPEN, SHIPPING } from "@/lib/config";
import { VariantSelector, type PurchaseVariant } from "./VariantSelector";

/**
 * 구매 박스. 변형·수량 선택 후 장바구니에 담거나 바로 결제로 이동한다.
 * 재고와 판매 상태는 서버 액션이 다시 확인하므로 여기서는 안내만 담당한다.
 */
export function PurchaseBox({
  variants,
  selectedId,
  onSelect,
}: {
  variants: PurchaseVariant[];
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  const router = useRouter();
  const locale = useLocale();
  const m = useMessages();
  const t = m.product.purchase;
  const [qty, setQty] = useState(1);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  const soldOut = !selected || selected.stock <= 0;
  // 출시 전: 구매 관련 입력을 모두 막는다. 서버 액션도 같은 설정으로 거부한다.
  const closed = !SALES_OPEN;
  const ceiling = Math.min(MAX_QTY_PER_LINE, Math.max(1, selected?.stock ?? 1));
  const lineTotal = selected ? selected.priceKrw * qty : 0;

  function changeVariant(id: number) {
    onSelect(id);
    setQty(1);
    setResult(null);
  }

  function add(then?: () => void) {
    if (!selected) return;
    setResult(null);
    startTransition(async () => {
      const response = await addToCartAction({ variantId: selected.id, qty });
      setResult({ ok: response.ok, message: response.message });
      if (response.ok) {
        track("add_to_cart", {
          currency: "KRW",
          value: selected.priceKrw * qty,
          items: [{ item_id: String(selected.id), item_name: selected.name, price: selected.priceKrw, quantity: qty }],
        });
      }
      if (response.ok && then) then();
    });
  }

  return (
    <div className="space-y-6">
      <VariantSelector
        variants={variants}
        selectedId={selectedId}
        onSelect={changeVariant}
        disabled={pending}
      />

      <div className="flex items-center justify-between gap-4">
        <span className="text-[13px] font-medium text-charcoal">{t.qty}</span>
        <div className="inline-flex items-center rounded-full border border-line-2 bg-white">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={pending || closed || soldOut || qty <= 1}
            aria-label={t.decrease}
            className="flex h-10 w-10 items-center justify-center rounded-l-full text-lg text-charcoal transition hover:bg-paper-2 disabled:opacity-35"
          >
            −
          </button>
          <span className="w-10 text-center text-sm tabular-nums" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(ceiling, q + 1))}
            disabled={pending || closed || soldOut || qty >= ceiling}
            aria-label={t.increase}
            className="flex h-10 w-10 items-center justify-center rounded-r-full text-lg text-charcoal transition hover:bg-paper-2 disabled:opacity-35"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex items-baseline justify-between border-t border-line pt-4">
        <span className="text-[13px] text-stone">{t.total}</span>
        <span className="text-2xl font-semibold tabular-nums text-ink">{formatPrice(lineTotal, locale)}</span>
      </div>

      {closed ? (
        <FormMessage tone="info">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{t.salesClosed}</span>
            <Link href="/notify" className="font-medium underline underline-offset-4">
              {t.salesClosedLink}
            </Link>
          </span>
        </FormMessage>
      ) : soldOut ? (
        <FormMessage tone="info">{t.soldOut}</FormMessage>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={pending || closed || soldOut}
          onClick={() => add()}
        >
          {pending ? m.common.processing : t.addToCart}
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={pending || closed || soldOut}
          onClick={() => add(() => router.push(localizePath(locale, "/checkout")))}
        >
          {t.buyNow}
        </Button>
      </div>

      {result ? (
        <FormMessage tone={result.ok ? "success" : "error"}>
          <span className="flex flex-wrap items-center gap-2">
            <span>{result.message}</span>
            {result.ok ? (
              <Link href="/cart" className="underline underline-offset-4">
                {t.viewCart}
              </Link>
            ) : null}
          </span>
        </FormMessage>
      ) : null}

      <p className="text-[13px] leading-relaxed text-stone">
        {fill(t.shippingNote, {
          threshold: formatPrice(SHIPPING.freeThreshold, locale),
          fee: formatPrice(SHIPPING.fee, locale),
        })}
      </p>
    </div>
  );
}
