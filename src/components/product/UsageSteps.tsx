export interface UsageStep {
  step: string;
  title: string;
  body: string;
}

/** 사용법 · 재도포. 표기된 차단력을 내려면 양과 시점이 중요하다 (제품기획안 8-3 ⑦). */
export function UsageSteps({
  steps,
  reapplyLine,
}: {
  steps: readonly UsageStep[];
  reapplyLine?: string;
}) {
  return (
    <div className="space-y-8">
      <ol className="grid gap-6 md:grid-cols-3">
        {steps.map((step) => (
          <li key={step.step} className="rounded-lg border border-line bg-white/60 p-6">
            <p className="eyebrow">{step.step}</p>
            <h3 className="mt-3 text-lg tracking-tight text-ink">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone">{step.body}</p>
          </li>
        ))}
      </ol>
      {reapplyLine ? (
        <p className="text-[15px] leading-relaxed text-charcoal">{reapplyLine}</p>
      ) : null}
    </div>
  );
}
