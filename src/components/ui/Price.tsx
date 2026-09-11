"use client";

import { useLocale } from "@/i18n/client";
import { formatPrice } from "@/i18n/format";

export function Price({
  value,
  compareAt,
  size = "md",
}: {
  value: number;
  compareAt?: number | null;
  size?: "sm" | "md" | "lg";
}) {
  const locale = useLocale();
  const sizes = { sm: "text-sm", md: "text-lg", lg: "text-2xl" };
  return (
    <span className={`inline-flex items-baseline gap-2 tabular-nums ${sizes[size]}`}>
      <span className="font-semibold text-ink">{formatPrice(value, locale)}</span>
      {compareAt && compareAt > value ? (
        <span className="text-[0.8em] text-stone-2 line-through">{formatPrice(compareAt, locale)}</span>
      ) : null}
    </span>
  );
}
