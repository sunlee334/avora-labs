import { Section } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { getT } from "@/i18n/server";

/** ⑦ 사용법 · 재도포 */
export async function Usage() {
  const { locale, m } = await getT();
  const { DAILY_SUNSCREEN } = getContent(locale);
  return (
    <Section eyebrow={m.home.usageEyebrow} title={DAILY_SUNSCREEN.usage.title}>
      <div className="grid gap-6 sm:grid-cols-3">
        {DAILY_SUNSCREEN.usage.steps.map((step) => (
          <div key={step.step}>
            <span className="display text-3xl text-mist-400">{step.step}</span>
            <h3 className="mt-3 text-[15px] font-semibold text-ink">{step.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-stone">{step.body}</p>
          </div>
        ))}
      </div>
      <p className="measure mt-10 border-t border-line pt-6 text-[14px] font-medium tracking-tight text-charcoal">
        {DAILY_SUNSCREEN.usage.reapplyLine}
      </p>
    </Section>
  );
}
