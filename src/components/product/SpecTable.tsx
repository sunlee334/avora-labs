export interface SpecRow {
  label: string;
  value: string;
  note?: string;
}

/** 제품 사양표. 확정 전 항목은 각주로 분리해 과장 없이 표기한다. */
export function SpecTable({ specs }: { specs: readonly SpecRow[] }) {
  const notes = specs.filter((spec) => spec.note);

  return (
    <div className="space-y-6">
      <dl className="divide-y divide-line border-y border-line">
        {specs.map((spec) => (
          <div key={spec.label} className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
            <dt className="text-[13px] text-stone">{spec.label}</dt>
            <dd className="text-[15px] leading-relaxed text-charcoal">
              {spec.value}
              {spec.note ? (
                <sup className="ml-1 text-[11px] text-stone">
                  {notes.findIndex((n) => n.label === spec.label) + 1}
                </sup>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {notes.length > 0 ? (
        <ol className="space-y-1.5 text-[12px] leading-relaxed text-stone">
          {notes.map((note, index) => (
            <li key={note.label}>
              <sup className="mr-1">{index + 1}</sup>
              {note.note}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
