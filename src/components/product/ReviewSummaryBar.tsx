import { fill } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { getT } from "@/i18n/server";

/** 별점 표시. 소수점은 반올림해 채운다. 접근성 라벨은 호출부가 현재 언어로 넘긴다. */
export function Stars({ value, label }: { value: number; label: string }) {
  const filled = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5 text-mist-500" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden className={n <= filled ? "text-ink" : "text-line-2"}>
          ★
        </span>
      ))}
    </span>
  );
}

/** 상세 페이지 상단의 후기 요약 (제품기획안 8-5-1: 리뷰를 위로 올린다). */
export async function ReviewSummaryBar({
  average,
  count,
  href = "#reviews",
}: {
  average: number;
  count: number;
  href?: string;
}) {
  const { m } = await getT();
  if (count === 0) {
    return (
      <p className="rounded-md border border-line bg-white/60 px-4 py-3 text-[13px] text-stone">
        {m.product.reviewSummary.empty}
      </p>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-md border border-line bg-white/60 px-4 py-3 transition hover:border-line-2"
    >
      <span className="flex items-center gap-2.5">
        <Stars value={average} label={fill(m.product.reviewSummary.stars, { n: average.toFixed(1) })} />
        <span className="text-sm font-semibold tabular-nums text-ink">{average.toFixed(1)}</span>
        <span className="text-[13px] text-stone">{fill(m.product.reviewSummary.count, { n: count })}</span>
      </span>
      <span className="text-[13px] text-stone underline underline-offset-4">{m.product.reviewSummary.view}</span>
    </Link>
  );
}
