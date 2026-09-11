import type { Metadata } from "next";
import { PageTitle, Section } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return {
    title: m.pages.faq.metaTitle,
    description: m.pages.faq.metaDescription,
    alternates: localeAlternates(locale, "/faq"),
  };
}

export default async function FaqPage() {
  const { locale, m } = await getT();
  const { FAQ_GROUPS } = getContent(locale);
  return (
    <>
      <PageTitle eyebrow="FAQ" title={m.pages.faq.metaTitle} lede={m.pages.faq.lede} />
      <Section className="pt-0">
        <div className="space-y-12">
          {FAQ_GROUPS.map((group) => (
            <div key={group.key}>
              <h2 className="eyebrow mb-4 text-stone-2">{group.title}</h2>
              <div className="divide-y divide-line rounded-lg border border-line bg-white/60">
                {group.items.map((item) => (
                  <details key={item.q} className="group px-5 py-4 open:pb-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-ink">
                      {item.q}
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-lg leading-none text-stone-2 transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="measure mt-3 text-[14px] leading-relaxed text-stone">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
