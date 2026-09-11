import { Section } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { getLocale } from "@/i18n/server";

/** ② 문제 제기 */
export async function Problem() {
  const { PROBLEM } = getContent(await getLocale());
  return (
    <Section eyebrow={PROBLEM.eyebrow} title={PROBLEM.title}>
      <div className="grid gap-8 md:grid-cols-2">
        <ul className="space-y-4">
          {PROBLEM.points.map((point) => (
            <li key={point} className="flex gap-3 text-[15px] leading-relaxed text-charcoal">
              <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {point}
            </li>
          ))}
        </ul>
        <p className="measure text-base leading-relaxed text-stone md:text-lg">{PROBLEM.close}</p>
      </div>
    </Section>
  );
}
