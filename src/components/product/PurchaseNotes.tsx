/** 결제 전 확인 사항. 데스크톱에서는 기본으로 펼쳐 둔다 (제품기획안 8-5-1). */
export function PurchaseNotes({ title, notes }: { title: string; notes: readonly string[] }) {
  return (
    <details className="group rounded-md border border-line bg-white/60 open:bg-white/80" open>
      <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-charcoal [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3">
          {title}
          <span aria-hidden className="text-stone transition group-open:rotate-180">
            ▾
          </span>
        </span>
      </summary>
      <ul className="space-y-2 border-t border-line px-4 py-3 text-[13px] leading-relaxed text-stone">
        {notes.map((note) => (
          <li key={note} className="flex gap-2">
            <span aria-hidden className="text-line-2">
              —
            </span>
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
