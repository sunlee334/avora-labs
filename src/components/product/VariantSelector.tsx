"use client";

import { Badge, Price } from "@/components/ui/Primitives";
import { useLocale, useMessages } from "@/i18n/client";
import { fill, formatPrice } from "@/i18n/format";

export interface PurchaseVariant {
  id: number;
  /** 현재 언어로 표시할 구성 이름 (서버가 카탈로그 번역을 적용해 넘긴다) */
  name: string;
  unitsPerPack: number;
  priceKrw: number;
  compareAtKrw: number | null;
  stock: number;
}

/** 변형 선택 라디오 카드. 세트는 정가 대비 표시와 개당 가격을 함께 보여준다. */
export function VariantSelector({
  variants,
  selectedId,
  onSelect,
  disabled,
}: {
  variants: PurchaseVariant[];
  selectedId: number;
  onSelect: (id: number) => void;
  disabled?: boolean;
}) {
  const locale = useLocale();
  const m = useMessages();
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-[13px] font-medium text-charcoal">{m.product.purchase.variants}</legend>
      {variants.map((variant) => {
        const selected = variant.id === selectedId;
        const soldOut = variant.stock <= 0;
        return (
          <label
            key={variant.id}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 transition ${
              selected ? "border-ink bg-white" : "border-line-2 bg-white/50 hover:border-line-2"
            } ${soldOut ? "cursor-not-allowed opacity-55" : ""}`}
          >
            <input
              type="radio"
              name="variant"
              value={variant.id}
              checked={selected}
              disabled={disabled || soldOut}
              onChange={() => onSelect(variant.id)}
              className="mt-1 h-4 w-4 shrink-0 accent-ink"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-medium tracking-tight text-ink">
                  {variant.name}
                </span>
                {variant.unitsPerPack > 1 ? <Badge tone="mist">{m.product.purchase.exclusive}</Badge> : null}
                {soldOut ? <Badge tone="danger">{m.product.purchase.soldOutBadge}</Badge> : null}
              </span>
              <span className="mt-2 block">
                <Price value={variant.priceKrw} compareAt={variant.compareAtKrw} size="sm" />
              </span>
              {variant.unitsPerPack > 1 ? (
                <span className="mt-1 block text-[12px] text-stone">
                  {fill(m.common.unitPrice, { price: formatPrice(Math.round(variant.priceKrw / variant.unitsPerPack), locale) })}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
