import { Section } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { getT } from "@/i18n/server";

/** ③ 4감각 LIGHT / COMFORT / PROTECTION / RESET */
export async function Senses() {
  const { locale, m } = await getT();
  const { DAILY_SUNSCREEN } = getContent(locale);
  return (
    <Section eyebrow={m.home.senses.eyebrow} title={m.home.senses.title} className="bg-mist-50/60">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {DAILY_SUNSCREEN.senses.map((sense) => (
          <div key={sense.key} className="rounded-lg border border-line bg-white p-6">
            <p className="eyebrow text-mist-600">{sense.key}</p>
            <h3 className="mt-3 text-[16px] font-semibold text-ink">{sense.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-stone">{sense.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
