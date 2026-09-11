import Link from "next/link";

/** 관리자 목록·계정 주문 목록 공용. 링크는 호출자가 만든 그대로 쓴다(스토어는 언어 접두사를 붙여 넘긴다). */
export function Pagination({
  page,
  totalPages,
  buildHref,
  labels = { prev: "이전", next: "다음" },
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
  labels?: { prev: string; next: string };
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="flex items-center justify-center gap-3 pt-2 text-[13px]">
      <Link
        href={buildHref(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={`rounded-md px-3 py-1.5 ${
          page <= 1 ? "pointer-events-none text-stone-2" : "text-charcoal hover:bg-white"
        }`}
      >
        {labels.prev}
      </Link>
      <span className="text-stone">
        {page} / {totalPages}
      </span>
      <Link
        href={buildHref(Math.min(totalPages, page + 1))}
        aria-disabled={page >= totalPages}
        className={`rounded-md px-3 py-1.5 ${
          page >= totalPages ? "pointer-events-none text-stone-2" : "text-charcoal hover:bg-white"
        }`}
      >
        {labels.next}
      </Link>
    </nav>
  );
}
