import type { PolicySection } from "@/content";

/** 정책 3종 페이지(배송·반품 / 이용약관 / 개인정보) 공통 렌더러. 번역본은 legalNotice(한국어 원문 우선 고지)를 위에 보여준다. */
export function PolicySections({ sections, legalNotice }: { sections: readonly PolicySection[]; legalNotice?: string }) {
  return (
    <div className="space-y-10">
      {legalNotice ? <p className="measure text-[13px] leading-relaxed text-stone-2">{legalNotice}</p> : null}
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="text-lg font-semibold tracking-tight text-ink">{section.title}</h2>
          {section.body ? (
            <div className="mt-3 space-y-3">
              {section.body.map((p, i) => (
                <p key={i} className="measure text-[15px] leading-relaxed text-stone">
                  {p}
                </p>
              ))}
            </div>
          ) : null}
          {section.list ? (
            <ul className="mt-3 space-y-2">
              {section.list.map((item, i) => (
                <li key={i} className="flex gap-2 text-[15px] leading-relaxed text-stone">
                  <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-mist-500" />
                  <span className="measure">{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
